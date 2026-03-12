import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInventoryMovementDto,
  InventoryMovementTypeDto,
} from './dto/create-inventory-movement.dto';

@Injectable()
export class InventoryMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInventoryMovementDto) {
    const frame = await this.prisma.frame.findUnique({
      where: { id: dto.frameId },
    });

    if (!frame) throw new NotFoundException('Frame no existe');

    if (dto.quantity <= 0) {
      throw new BadRequestException('Cantidad inv�lida');
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          frameId: dto.frameId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason ?? null,
        },
      });

      if (dto.type === InventoryMovementTypeDto.IN) {
        await tx.frame.update({
          where: { id: dto.frameId },
          data: { stockActual: { increment: dto.quantity } },
        });
      }

      if (dto.type === InventoryMovementTypeDto.OUT) {
        if (dto.quantity > frame.stockActual) {
          throw new BadRequestException('Stock insuficiente');
        }

        await tx.frame.update({
          where: { id: dto.frameId },
          data: { stockActual: { decrement: dto.quantity } },
        });
      }

      return movement;
    });
  }
}
