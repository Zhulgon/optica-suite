import { MovementType, Prisma } from '@prisma/client';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListFramesQueryDto } from './dto/list-frames.query.dto';
import { CreateFrameDto } from './dto/create-frame.dto';
import { UpdateFrameDto } from './dto/update-frame.dto';

@Injectable()
export class FramesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListFramesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const q = query.q?.trim();
    const conPlaqueta =
      query.conPlaqueta === undefined
        ? undefined
        : query.conPlaqueta === 'true';
    const inStock = query.inStock === 'true';

    const where: Prisma.FrameWhereInput = {
      ...(query.segmento ? { segmento: query.segmento } : {}),
      ...(conPlaqueta !== undefined ? { conPlaqueta } : {}),
      ...(inStock ? { stockActual: { gt: 0 } } : {}),
      ...(q
        ? {
            OR: [
              { referencia: { contains: q, mode: 'insensitive' as const } },
              ...(Number.isFinite(Number(q)) ? [{ codigo: Number(q) }] : []),
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.frame.count({ where }),
      this.prisma.frame.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { success: true, page, limit, total, count: data.length, data };
  }

  async findOne(id: string) {
    const frame = await this.prisma.frame.findUnique({ where: { id } });
    if (!frame) {
      throw new NotFoundException('Montura no existe');
    }
    return frame;
  }

  async create(dto: CreateFrameDto) {
    const referencia = dto.referencia.trim();
    const existing = await this.prisma.frame.findUnique({
      where: { codigo: dto.codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una montura con codigo ${dto.codigo}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const frame = await tx.frame.create({
        data: {
          codigo: dto.codigo,
          referencia,
          segmento: dto.segmento,
          conPlaqueta: dto.conPlaqueta,
          precioVenta: dto.precioVenta,
          stockActual: dto.stockInicial,
        },
      });

      if (dto.stockInicial > 0) {
        await tx.inventoryMovement.create({
          data: {
            frameId: frame.id,
            type: MovementType.IN,
            quantity: dto.stockInicial,
            reason: 'Alta manual de montura',
          },
        });
      }

      return frame;
    });
  }

  async update(id: string, dto: UpdateFrameDto) {
    await this.findOne(id);

    const referencia = dto.referencia?.trim();
    if (dto.codigo !== undefined) {
      const existing = await this.prisma.frame.findUnique({
        where: { codigo: dto.codigo },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe una montura con codigo ${dto.codigo}`);
      }
    }

    return this.prisma.frame.update({
      where: { id },
      data: {
        ...(dto.codigo !== undefined ? { codigo: dto.codigo } : {}),
        ...(referencia !== undefined ? { referencia } : {}),
        ...(dto.segmento !== undefined ? { segmento: dto.segmento } : {}),
        ...(dto.conPlaqueta !== undefined ? { conPlaqueta: dto.conPlaqueta } : {}),
        ...(dto.precioVenta !== undefined ? { precioVenta: dto.precioVenta } : {}),
      },
    });
  }
}
