import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { validatePasswordPolicy } from './password-policy';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(data: RegisterDto) {
    validatePasswordPolicy(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: hashedPassword,
        mustChangePassword: false,
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

    return user;
  }

  async login(data: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException(
        'Cuenta bloqueada temporalmente. Intenta de nuevo en unos minutos.',
      );
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : failedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null,
        },
      });

      if (shouldLock) {
        throw new UnauthorizedException(
          'Cuenta bloqueada por intentos fallidos. Intenta de nuevo en 15 minutos.',
        );
      }
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(userId: string, data: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException(
        'Cuenta bloqueada temporalmente. Intenta de nuevo en unos minutos.',
      );
    }

    const validCurrentPassword = await bcrypt.compare(
      data.currentPassword,
      user.passwordHash,
    );
    if (!validCurrentPassword) {
      throw new UnauthorizedException('La contrasena actual no es valida');
    }

    if (data.currentPassword === data.newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }
    validatePasswordPolicy(data.newPassword);

    const newPasswordHash = await bcrypt.hash(data.newPassword, 10);
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
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
      },
    });

    return {
      success: true,
      message: 'Contrasena actualizada correctamente',
      user: updatedUser,
    };
  }
}
