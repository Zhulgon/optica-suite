import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  private formatBlockers(blockers: Array<{ label: string; count: number }>) {
    return blockers
      .filter((item) => item.count > 0)
      .map((item) => `${item.label}: ${item.count}`)
      .join(', ');
  }

  async findAll() {
    return this.prisma.site.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            patients: true,
            sales: true,
            labOrders: true,
            clinicalHistories: true,
            appointments: true,
          },
        },
      },
    });
  }

  async create(dto: CreateSiteDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    const existing = await this.prisma.site.findUnique({
      where: { code: normalizedCode },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Ya existe una sede con ese codigo');
    }

    return this.prisma.site.create({
      data: {
        name: dto.name.trim(),
        code: normalizedCode,
      },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, dto: UpdateSiteDto) {
    const existing = await this.prisma.site.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Sede no encontrada');
    }

    return this.prisma.site.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(typeof dto.isActive === 'boolean' ? { isActive: dto.isActive } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        _count: {
          select: {
            users: true,
            patients: true,
            sales: true,
            labOrders: true,
            clinicalHistories: true,
            appointments: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Sede no encontrada');
    }

    if (existing.isActive) {
      throw new BadRequestException(
        'Primero desactiva la sede antes de eliminarla definitivamente',
      );
    }

    const blockers = [
      { label: 'usuarios asignados', count: existing._count.users },
      { label: 'pacientes asociados', count: existing._count.patients },
      { label: 'ventas asociadas', count: existing._count.sales },
      { label: 'ordenes de laboratorio', count: existing._count.labOrders },
      {
        label: 'historias clinicas asociadas',
        count: existing._count.clinicalHistories,
      },
      { label: 'citas asociadas', count: existing._count.appointments },
    ].filter((item) => item.count > 0);

    if (blockers.length > 0) {
      throw new BadRequestException(
        `No puedes eliminar esta sede porque tiene historial o relaciones activas (${this.formatBlockers(
          blockers,
        )}). Mantenla inactiva o reasigna sus registros primero.`,
      );
    }

    await this.prisma.site.delete({
      where: { id },
    });

    return {
      id: existing.id,
      name: existing.name,
      code: existing.code,
      success: true,
      message: 'Sede eliminada correctamente',
    };
  }
}
