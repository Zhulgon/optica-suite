import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query';
import { NotFoundException } from '@nestjs/common';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ListPatientsQueryDto, siteId?: string | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const q = query.q?.trim();

    const skip = (page - 1) * limit;

    const where = {
      ...(siteId ? { siteId } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { documentNumber: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

  async findOne(id: string, siteId?: string | null) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        ...(siteId ? { siteId } : {}),
      },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return {
      success: true,
      data: patient,
    };
  }

  async findOneWithClinicalHistories(id: string, siteId?: string | null) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        ...(siteId ? { siteId } : {}),
      },
      include: {
        clinicalHistories: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return {
      success: true,
      data: patient,
    };
  }

  async update(id: string, data: UpdatePatientDto, siteId?: string | null) {
    const exists = await this.prisma.patient.findFirst({
      where: {
        id,
        ...(siteId ? { siteId } : {}),
      },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const patient = await this.prisma.patient.update({
      where: { id },
      data,
    });

    return {
      success: true,
      data: patient,
    };
  }

  async remove(id: string, siteId?: string | null) {
    const exists = await this.prisma.patient.findFirst({
      where: {
        id,
        ...(siteId ? { siteId } : {}),
      },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Paciente no encontrado');
    }

    await this.prisma.patient.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Paciente eliminado correctamente',
    };
  }

  async create(data: CreatePatientDto, siteId?: string | null) {
    const patient = await this.prisma.patient.create({
      data: {
        ...data,
        siteId: siteId ?? null,
      },
    });
    return { success: true, data: patient };
  }
}
