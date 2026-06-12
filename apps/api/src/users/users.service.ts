import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import * as bcrypt from 'bcrypt';
import { validatePasswordPolicy } from '../auth/password-policy';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private formatBlockers(blockers: Array<{ label: string; count: number }>) {
    return blockers
      .filter((item) => item.count > 0)
      .map((item) => `${item.label}: ${item.count}`)
      .join(', ');
  }

  private readonly userListSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    siteId: true,
    site: {
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
      },
    },
    isActive: true,
    mustChangePassword: true,
    twoFactorEnabled: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        sales: true,
        voidedSales: true,
        cashClosures: true,
        closedCashClosures: true,
        signedClinicalHistories: true,
        salePayments: true,
        createdLabOrders: true,
        updatedLabOrders: true,
        createdAppointments: true,
        updatedAppointments: true,
        assignedAppointments: true,
      },
    },
  } as const;

  async createByAdmin(dto: CreateUserAdminDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email ya registrado');
    }

    validatePasswordPolicy(dto.password);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const normalizedSiteId = dto.siteId?.trim() || null;
    if (normalizedSiteId) {
      const site = await this.prisma.site.findUnique({
        where: { id: normalizedSiteId },
        select: { id: true, isActive: true },
      });
      if (!site) {
        throw new NotFoundException('Sede no encontrada');
      }
      if (!site.isActive) {
        throw new BadRequestException('La sede seleccionada esta inactiva');
      }
    }

    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role,
        siteId: normalizedSiteId,
        mustChangePassword: true,
      },
      select: this.userListSelect,
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: this.userListSelect,
    });
  }

  async setActiveStatus(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (id === actorId && !isActive) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    if (existing.isActive === isActive) {
      return this.prisma.user.findUniqueOrThrow({
        where: { id },
        select: this.userListSelect,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          isActive,
          failedLoginAttempts: 0,
          lockedUntil: null,
          tokenVersion: {
            increment: 1,
          },
        },
        select: this.userListSelect,
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return updated;
    });
  }

  async resetPasswordByAdmin(id: string, newPassword: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (id === actorId) {
      throw new BadRequestException(
        'No puedes resetear tu propia contraseña desde este flujo',
      );
    }

    validatePasswordPolicy(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
          tokenVersion: {
            increment: 1,
          },
        },
        select: this.userListSelect,
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return updated;
    });
  }

  async setUserSite(id: string, siteId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const normalizedSiteId = siteId?.trim() || null;
    if (normalizedSiteId) {
      const site = await this.prisma.site.findUnique({
        where: { id: normalizedSiteId },
        select: { id: true, isActive: true },
      });
      if (!site) {
        throw new NotFoundException('Sede no encontrada');
      }
      if (!site.isActive) {
        throw new BadRequestException('La sede seleccionada esta inactiva');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        siteId: normalizedSiteId,
      },
      select: this.userListSelect,
    });
  }

  async remove(id: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        _count: {
          select: {
            sales: true,
            voidedSales: true,
            cashClosures: true,
            closedCashClosures: true,
            signedClinicalHistories: true,
            salePayments: true,
            createdLabOrders: true,
            updatedLabOrders: true,
            createdAppointments: true,
            updatedAppointments: true,
            assignedAppointments: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (id === actorId) {
      throw new BadRequestException('No puedes eliminar tu propio usuario');
    }

    if (existing.isActive) {
      throw new BadRequestException(
        'Primero desactiva el usuario antes de eliminarlo definitivamente',
      );
    }

    const blockers = [
      { label: 'ventas creadas', count: existing._count.sales },
      { label: 'ventas anuladas', count: existing._count.voidedSales },
      { label: 'cierres de caja', count: existing._count.cashClosures },
      {
        label: 'cierres de caja aprobados',
        count: existing._count.closedCashClosures,
      },
      {
        label: 'historias clinicas firmadas',
        count: existing._count.signedClinicalHistories,
      },
      { label: 'pagos registrados', count: existing._count.salePayments },
      {
        label: 'ordenes de laboratorio creadas',
        count: existing._count.createdLabOrders,
      },
      {
        label: 'ordenes de laboratorio actualizadas',
        count: existing._count.updatedLabOrders,
      },
      {
        label: 'citas creadas',
        count: existing._count.createdAppointments,
      },
      {
        label: 'citas actualizadas',
        count: existing._count.updatedAppointments,
      },
      {
        label: 'citas asignadas como optometra',
        count: existing._count.assignedAppointments,
      },
    ].filter((item) => item.count > 0);

    if (blockers.length > 0) {
      throw new BadRequestException(
        `No puedes eliminar este usuario porque tiene historial asociado (${this.formatBlockers(
          blockers,
        )}). Mantenlo inactivo para conservar la trazabilidad.`,
      );
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      success: true,
      message: 'Usuario eliminado correctamente',
    };
  }
}
