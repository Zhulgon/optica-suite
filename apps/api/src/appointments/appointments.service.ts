import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly appointmentInclude = {
    site: {
      select: {
        id: true,
        name: true,
        code: true,
      },
    },
    patient: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        documentNumber: true,
        phone: true,
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
    optometrist: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        siteId: true,
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
  } as const;

  private async getActor(userId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, siteId: true, isActive: true },
    });
    if (!actor || !actor.isActive) {
      throw new BadRequestException('Usuario no existe o esta inactivo');
    }
    return actor;
  }

  private parseDateBoundary(value: string, boundary: 'start' | 'end') {
    if (value.length <= 10) {
      const [yearRaw, monthRaw, dayRaw] = value.split('-');
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      const day = Number(dayRaw);
      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day)
      ) {
        throw new BadRequestException('Fecha invalida');
      }
      if (boundary === 'start') {
        return new Date(year, month - 1, day, 0, 0, 0, 0);
      }
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Fecha invalida');
    }
    return parsed;
  }

  private ensureSiteAccess(actorSiteId: string | null, entitySiteId?: string | null) {
    if (actorSiteId && entitySiteId && actorSiteId !== entitySiteId) {
      throw new NotFoundException('Cita no encontrada');
    }
  }

  private async resolveOptometristAssignment(params: {
    requestedOptometristId?: string;
    actorId: string;
    actorRole: Role;
    actorSiteId: string | null;
    effectiveSiteId: string | null;
    fallbackOptometristId?: string | null;
  }) {
    const {
      requestedOptometristId,
      actorId,
      actorRole,
      actorSiteId,
      effectiveSiteId,
      fallbackOptometristId,
    } = params;

    const normalizedRequested = requestedOptometristId?.trim();

    if (actorRole === 'OPTOMETRA') {
      if (normalizedRequested && normalizedRequested !== actorId) {
        throw new ForbiddenException(
          'Como optometra solo puedes asignarte a ti mismo en la cita',
        );
      }
      return {
        id: actorId,
        siteId: actorSiteId,
      };
    }

    const targetOptometristId =
      normalizedRequested ?? fallbackOptometristId ?? null;
    if (!targetOptometristId) {
      return {
        id: null,
        siteId: null,
      };
    }

    const optometrist = await this.prisma.user.findUnique({
      where: { id: targetOptometristId },
      select: { id: true, role: true, siteId: true, isActive: true },
    });
    if (!optometrist || !optometrist.isActive || optometrist.role !== 'OPTOMETRA') {
      throw new BadRequestException(
        'El optometra seleccionado no existe, esta inactivo o no tiene rol OPTOMETRA',
      );
    }

    if (actorSiteId && optometrist.siteId && optometrist.siteId !== actorSiteId) {
      throw new BadRequestException(
        'El optometra pertenece a una sede diferente a la del usuario actual',
      );
    }
    if (
      effectiveSiteId &&
      optometrist.siteId &&
      optometrist.siteId !== effectiveSiteId
    ) {
      throw new BadRequestException(
        'El optometra no pertenece a la misma sede de la cita',
      );
    }

    return {
      id: optometrist.id,
      siteId: optometrist.siteId ?? null,
    };
  }

  async findOptometrists(actorUserId: string) {
    const actor = await this.getActor(actorUserId);
    const data = await this.prisma.user.findMany({
      where: {
        role: 'OPTOMETRA',
        isActive: true,
        ...(actor.siteId ? { siteId: actor.siteId } : {}),
      },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        siteId: true,
      },
    });

    return {
      success: true,
      count: data.length,
      data,
    };
  }

  async findAll(query: ListAppointmentsQueryDto, actorUserId: string) {
    const actor = await this.getActor(actorUserId);
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    if (query.fromDate) {
      fromDate = this.parseDateBoundary(query.fromDate, 'start');
    }
    if (query.toDate) {
      toDate = this.parseDateBoundary(query.toDate, 'end');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('fromDate no puede ser mayor que toDate');
    }

    const where: Prisma.AppointmentWhereInput = {
      ...(actor.siteId ? { siteId: actor.siteId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(actor.role === 'OPTOMETRA'
        ? { optometristId: actor.id }
        : query.optometristId
          ? { optometristId: query.optometristId }
          : {}),
      ...(fromDate || toDate
        ? {
            scheduledAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const limit = query.limit ?? 120;
    const [total, data] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        include: this.appointmentInclude,
      }),
    ]);

    return {
      success: true,
      total,
      count: data.length,
      limit,
      data,
    };
  }

  async create(dto: CreateAppointmentDto, actorUserId: string) {
    const actor = await this.getActor(actorUserId);
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { id: true, siteId: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (actor.siteId && patient.siteId && actor.siteId !== patient.siteId) {
      throw new BadRequestException(
        'El paciente pertenece a una sede diferente',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt invalida');
    }

    const assignedOptometrist = await this.resolveOptometristAssignment({
      requestedOptometristId: dto.optometristId,
      actorId: actor.id,
      actorRole: actor.role,
      actorSiteId: actor.siteId ?? null,
      effectiveSiteId: patient.siteId ?? actor.siteId ?? null,
    });
    const appointmentSiteId =
      patient.siteId ?? actor.siteId ?? assignedOptometrist.siteId ?? null;

    const created = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        siteId: appointmentSiteId,
        optometristId: assignedOptometrist.id,
        scheduledAt,
        durationMinutes: dto.durationMinutes ?? 30,
        status: 'SCHEDULED',
        reason: dto.reason?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdById: actor.id,
      },
      include: this.appointmentInclude,
    });

    return {
      success: true,
      data: created,
    };
  }

  async update(
    id: string,
    dto: UpdateAppointmentDto,
    actorUserId: string,
    actorRole: Role,
  ) {
    const actor = await this.getActor(actorUserId);
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
      include: this.appointmentInclude,
    });
    if (!existing) {
      throw new NotFoundException('Cita no encontrada');
    }
    this.ensureSiteAccess(actor.siteId, existing.siteId);

    if (
      existing.status === 'CANCELLED' &&
      dto.status &&
      dto.status !== 'CANCELLED'
    ) {
      throw new BadRequestException(
        'Una cita cancelada no puede cambiar de estado',
      );
    }
    if (
      existing.status === 'COMPLETED' &&
      dto.status &&
      dto.status !== 'COMPLETED'
    ) {
      throw new BadRequestException(
        'Una cita completada no puede cambiar de estado',
      );
    }
    if (dto.status === 'CANCELLED' && actorRole === 'OPTOMETRA') {
      throw new BadRequestException(
        'El rol optometra no puede cancelar citas. Solicita apoyo de admin o asesor',
      );
    }

    const updateData: Prisma.AppointmentUpdateInput = {
      updatedBy: { connect: { id: actor.id } },
      ...(dto.durationMinutes !== undefined
        ? { durationMinutes: dto.durationMinutes }
        : {}),
      ...(dto.reason !== undefined ? { reason: dto.reason.trim() || null } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
    };

    if (dto.optometristId !== undefined) {
      const assignedOptometrist = await this.resolveOptometristAssignment({
        requestedOptometristId: dto.optometristId,
        actorId: actor.id,
        actorRole,
        actorSiteId: actor.siteId ?? null,
        effectiveSiteId: existing.siteId ?? null,
      });
      updateData.optometrist =
        assignedOptometrist.id === null
          ? { disconnect: true }
          : { connect: { id: assignedOptometrist.id } };
      if (!existing.siteId && assignedOptometrist.siteId) {
        updateData.site = { connect: { id: assignedOptometrist.siteId } };
      }
    }

    if (dto.scheduledAt !== undefined) {
      const parsedScheduledAt = new Date(dto.scheduledAt);
      if (Number.isNaN(parsedScheduledAt.getTime())) {
        throw new BadRequestException('scheduledAt invalida');
      }
      updateData.scheduledAt = parsedScheduledAt;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status as AppointmentStatus;
      if (dto.status === 'CANCELLED') {
        updateData.cancelledAt = existing.cancelledAt ?? new Date();
        updateData.cancelledReason = dto.cancelledReason?.trim() || null;
      }
      if (dto.status === 'COMPLETED') {
        updateData.completedAt = existing.completedAt ?? new Date();
      }
      if (dto.status !== 'CANCELLED') {
        updateData.cancelledReason = null;
      }
    }

    const updated = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: updateData,
      include: this.appointmentInclude,
    });

    return {
      success: true,
      data: updated,
    };
  }
}
