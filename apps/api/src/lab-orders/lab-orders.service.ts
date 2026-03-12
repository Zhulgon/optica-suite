import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LabOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { ListLabOrdersQueryDto } from './dto/list-lab-orders.query.dto';
import { UpdateLabOrderStatusDto } from './dto/update-lab-order-status.dto';

const STATUS_TRANSITIONS: Record<LabOrderStatus, LabOrderStatus[]> = {
  PENDING: ['SENT_TO_LAB', 'CANCELLED'],
  SENT_TO_LAB: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class LabOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListLabOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;
    const skip = (page - 1) * limit;
    const q = query.q?.trim();

    const where: Prisma.LabOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: 'insensitive' } },
              { lensDetails: { contains: q, mode: 'insensitive' } },
              { labName: { contains: q, mode: 'insensitive' } },
              { responsible: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
              { patient: { firstName: { contains: q, mode: 'insensitive' } } },
              { patient: { lastName: { contains: q, mode: 'insensitive' } } },
              {
                patient: { documentNumber: { contains: q, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.labOrder.count({ where }),
      this.prisma.labOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              documentNumber: true,
            },
          },
          sale: {
            select: {
              id: true,
              total: true,
              createdAt: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      page,
      limit,
      total,
      count: data.length,
      data,
    };
  }

  async create(dto: CreateLabOrderDto, actorUserId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    if (dto.saleId) {
      const sale = await this.prisma.sale.findUnique({
        where: { id: dto.saleId },
        select: { id: true, patientId: true },
      });
      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }
      if (sale.patientId && sale.patientId !== dto.patientId) {
        throw new BadRequestException(
          'La venta seleccionada no pertenece al paciente de la orden',
        );
      }
    }

    const result = await this.prisma.labOrder.create({
      data: {
        patientId: dto.patientId,
        saleId: dto.saleId ?? null,
        reference: dto.reference.trim(),
        lensDetails: dto.lensDetails?.trim() || null,
        labName: dto.labName?.trim() || null,
        responsible: dto.responsible?.trim() || null,
        promisedDate: dto.promisedDate ? new Date(dto.promisedDate) : null,
        notes: dto.notes?.trim() || null,
        status: 'PENDING',
        createdById: actorUserId,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
        sale: {
          select: {
            id: true,
            total: true,
            createdAt: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return { success: true, data: result };
  }

  async updateStatus(
    id: string,
    dto: UpdateLabOrderStatusDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.labOrder.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
        sale: {
          select: {
            id: true,
            total: true,
            createdAt: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Orden de laboratorio no encontrada');
    }

    if (existing.status === dto.status) {
      return {
        success: true,
        previousStatus: existing.status,
        data: existing,
      };
    }

    const allowed = STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Transicion invalida: ${existing.status} -> ${dto.status}`,
      );
    }

    const now = new Date();
    const updateData: Prisma.LabOrderUpdateInput = {
      status: dto.status,
      updatedBy: {
        connect: { id: actorUserId },
      },
      notes: dto.notes?.trim() || existing.notes,
    };

    if (dto.status === 'SENT_TO_LAB') {
      updateData.sentAt = existing.sentAt ?? now;
    }
    if (dto.status === 'RECEIVED') {
      updateData.sentAt = existing.sentAt ?? now;
      updateData.receivedAt = existing.receivedAt ?? now;
    }
    if (dto.status === 'DELIVERED') {
      updateData.sentAt = existing.sentAt ?? now;
      updateData.receivedAt = existing.receivedAt ?? now;
      updateData.deliveredAt = existing.deliveredAt ?? now;
    }
    if (dto.status === 'CANCELLED') {
      updateData.cancelledAt = existing.cancelledAt ?? now;
    }

    const updated = await this.prisma.labOrder.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
        sale: {
          select: {
            id: true,
            total: true,
            createdAt: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      success: true,
      previousStatus: existing.status,
      data: updated,
    };
  }
}
