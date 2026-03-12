import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import * as bcrypt from 'bcrypt';
import { validatePasswordPolicy } from '../auth/password-policy';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createByAdmin(dto: CreateUserAdminDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email ya registrado');
    }

    validatePasswordPolicy(dto.password);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
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
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        isActive,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: {
          increment: 1,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
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

    return this.prisma.user.update({
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
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
