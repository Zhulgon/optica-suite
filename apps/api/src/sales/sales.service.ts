import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateSaleDto, PaymentMethodDto } from './dto/create-sale.dto'

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapPaymentMethod(pm?: PaymentMethodDto) {
    switch (pm) {
      case PaymentMethodDto.CARD:
        return 'CARD'
      case PaymentMethodDto.TRANSFER:
        return 'TRANSFER'
      case PaymentMethodDto.MIXED:
        return 'MIXED'
      case PaymentMethodDto.CASH:
      default:
        return 'CASH'
    }
  }

  async create(dto: CreateSaleDto, createdById: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('La venta debe tener al menos 1 item')
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true },
    })
    if (!creator) throw new BadRequestException('Usuario creador no existe')

    if (dto.patientId) {
      const p = await this.prisma.patient.findUnique({
        where: { id: dto.patientId },
        select: { id: true },
      })
      if (!p) throw new NotFoundException('Paciente no encontrado')
    }

    const frameIds = dto.items.map((i) => i.frameId)

    const frames = await this.prisma.frame.findMany({
      where: { id: { in: frameIds } },
    })

    if (frames.length !== frameIds.length) {
      throw new BadRequestException('Uno o más frameId no existen')
    }

    const computed = dto.items.map((i) => {
      const frame = frames.find((f) => f.id === i.frameId)!
      if (i.quantity > frame.stockActual) {
        throw new BadRequestException(
          `Stock insuficiente para codigo ${frame.codigo} (${frame.referencia}). Stock=${frame.stockActual}, pedido=${i.quantity}`,
        )
      }
      const unitPrice = frame.precioVenta
      const subtotal = unitPrice * i.quantity
      return { frame, quantity: i.quantity, unitPrice, subtotal }
    })

    const total = computed.reduce((acc, it) => acc + it.subtotal, 0)

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          patientId: dto.patientId ?? null,
          paymentMethod: this.mapPaymentMethod(dto.paymentMethod),
          total,
          notes: dto.notes ?? null,
          createdById,
        },
      })

      for (const it of computed) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            frameId: it.frame.id,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal,
          },
        })

        await tx.inventoryMovement.create({
          data: {
            frameId: it.frame.id,
            type: 'OUT',
            quantity: it.quantity,
            reason: `Venta ${sale.id}`,
          },
        })

        await tx.frame.update({
          where: { id: it.frame.id },
          data: { stockActual: { decrement: it.quantity } },
        })
      }

      return tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          patient: true,
          createdBy: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
          items: { include: { frame: true } },
        },
      })
    })
  }

  async findAll(userId: string, role: string) {
    if (role === 'ADMIN') {
      return this.prisma.sale.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          patient: true,
          createdBy: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
          items: { include: { frame: true } },
        },
      })
    }

    return this.prisma.sale.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        items: { include: { frame: true } },
      },
    })
  }

  async findOne(id: string, userId: string, role: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        patient: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        items: { include: { frame: true } },
      },
    })

    if (!sale) throw new NotFoundException('Venta no encontrada')

    if (role !== 'ADMIN' && sale.createdById !== userId) {
      throw new BadRequestException('No tienes permiso para ver esta venta')
    }

    return sale
  }
}