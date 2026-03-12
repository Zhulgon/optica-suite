import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto, PaymentMethodDto } from './dto/create-sale.dto';
import { VoidSaleDto } from './dto/void-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly saleInclude = {
    patient: true,
    createdBy: {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    },
    voidedBy: {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    },
    items: { include: { frame: true } },
  } as const;

  private mapPaymentMethod(pm?: PaymentMethodDto) {
    switch (pm) {
      case PaymentMethodDto.CARD:
        return 'CARD';
      case PaymentMethodDto.TRANSFER:
        return 'TRANSFER';
      case PaymentMethodDto.MIXED:
        return 'MIXED';
      case PaymentMethodDto.CASH:
      default:
        return 'CASH';
    }
  }

  async create(dto: CreateSaleDto, createdById: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('La venta debe tener al menos 1 item');
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true, isActive: true },
    });
    if (!creator || !creator.isActive) {
      throw new BadRequestException('Usuario creador no existe o esta inactivo');
    }

    if (dto.patientId) {
      const p = await this.prisma.patient.findUnique({
        where: { id: dto.patientId },
        select: { id: true },
      });
      if (!p) throw new NotFoundException('Paciente no encontrado');
    }

    const frameIds = dto.items.map((i) => i.frameId);
    const frames = await this.prisma.frame.findMany({
      where: { id: { in: frameIds } },
    });

    if (frames.length !== frameIds.length) {
      throw new BadRequestException('Uno o mas frameId no existen');
    }

    const computed = dto.items.map((i) => {
      const frame = frames.find((f) => f.id === i.frameId);
      if (!frame) {
        throw new BadRequestException(`Frame ${i.frameId} no encontrado`);
      }
      if (i.quantity > frame.stockActual) {
        throw new BadRequestException(
          `Stock insuficiente para codigo ${frame.codigo} (${frame.referencia}). Stock=${frame.stockActual}, pedido=${i.quantity}`,
        );
      }
      const unitPrice = frame.precioVenta;
      const subtotal = unitPrice * i.quantity;
      return { frame, quantity: i.quantity, unitPrice, subtotal };
    });

    const total = computed.reduce((acc, it) => acc + it.subtotal, 0);

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          patientId: dto.patientId ?? null,
          paymentMethod: this.mapPaymentMethod(dto.paymentMethod),
          total,
          notes: dto.notes ?? null,
          createdById,
        },
      });

      for (const it of computed) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            frameId: it.frame.id,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            frameId: it.frame.id,
            type: 'OUT',
            quantity: it.quantity,
            reason: `Venta ${sale.id}`,
          },
        });

        await tx.frame.update({
          where: { id: it.frame.id },
          data: { stockActual: { decrement: it.quantity } },
        });
      }

      return tx.sale.findUnique({
        where: { id: sale.id },
        include: this.saleInclude,
      });
    });
  }

  async voidSale(id: string, dto: VoidSaleDto, actorUserId: string, actorRole: Role) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            frame: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');

    if (sale.status === 'VOIDED') {
      throw new BadRequestException('La venta ya esta anulada');
    }

    if (actorRole !== 'ADMIN' && sale.createdById !== actorUserId) {
      throw new ForbiddenException('No tienes permiso para anular esta venta');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, isActive: true },
    });
    if (!actor || !actor.isActive) {
      throw new BadRequestException('Usuario anulador no existe o esta inactivo');
    }

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Debes enviar el motivo de anulacion');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidReason: reason,
          voidedById: actorUserId,
        },
      });

      for (const item of sale.items) {
        await tx.inventoryMovement.create({
          data: {
            frameId: item.frameId,
            type: 'IN',
            quantity: item.quantity,
            reason: `Anulacion venta ${sale.id}`,
          },
        });

        await tx.frame.update({
          where: { id: item.frameId },
          data: { stockActual: { increment: item.quantity } },
        });
      }

      return tx.sale.findUnique({
        where: { id: updatedSale.id },
        include: this.saleInclude,
      });
    });
  }

  async findAll(userId: string, role: Role) {
    return this.prisma.sale.findMany({
      where: role === 'ADMIN' ? {} : { createdById: userId },
      orderBy: { createdAt: 'desc' },
      include: this.saleInclude,
    });
  }

  async findOne(id: string, userId: string, role: Role) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: this.saleInclude,
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');

    if (role !== 'ADMIN' && sale.createdById !== userId) {
      throw new ForbiddenException('No tienes permiso para ver esta venta');
    }

    return sale;
  }
}
