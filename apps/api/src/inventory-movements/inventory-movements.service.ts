import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class InventoryMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: any, userId: string) {
    const frame = await this.prisma.frame.findUnique({
      where: { id: dto.frameId },
    })

    if (!frame) throw new NotFoundException('Frame no existe')

    if (dto.quantity <= 0) {
      throw new BadRequestException('Cantidad inválida')
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          frameId: dto.frameId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason ?? null,
        },
      })

      if (dto.type === 'IN') {
        await tx.frame.update({
          where: { id: dto.frameId },
          data: { stockActual: { increment: dto.quantity } },
        })
      }

      if (dto.type === 'OUT') {
        if (dto.quantity > frame.stockActual) {
          throw new BadRequestException('Stock insuficiente')
        }

        await tx.frame.update({
          where: { id: dto.frameId },
          data: { stockActual: { decrement: dto.quantity } },
        })
      }

      return movement
    })
  }
}