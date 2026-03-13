import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
