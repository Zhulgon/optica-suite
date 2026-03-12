import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { validatePasswordPolicy } from './password-policy';
import { PasswordResetMailService } from './password-reset-mail.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DEFAULT_REFRESH_DAYS = 7;
const DEFAULT_PASSWORD_RESET_MINUTES = 60;

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  tokenVersion: number;
};

type SessionClientContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private readonly passwordResetMail: PasswordResetMailService,
  ) {}

  private getRefreshTtlDays() {
    const parsed = Number(process.env.JWT_REFRESH_DAYS ?? DEFAULT_REFRESH_DAYS);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_REFRESH_DAYS;
    return Math.floor(parsed);
  }

  private getRefreshExpiresAt() {
    const days = this.getRefreshTtlDays();
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getPasswordResetTtlMinutes() {
    const parsed = Number(
      process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? DEFAULT_PASSWORD_RESET_MINUTES,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_PASSWORD_RESET_MINUTES;
    }
    return Math.floor(parsed);
  }

  private getPasswordResetExpiresAt() {
    const ttlMinutes = this.getPasswordResetTtlMinutes();
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  private getWebBaseUrl() {
    const envUrl = process.env.WEB_APP_URL?.trim();
    if (!envUrl) return 'http://localhost:5173';
    return envUrl.replace(/\/+$/, '');
  }

  private shouldReturnDebugResetToken() {
    return process.env.NODE_ENV !== 'production';
  }

  private async issueSession(
    user: SessionUser,
    tx?: Prisma.TransactionClient,
    context?: SessionClientContext,
  ) {
    const client = tx ?? this.prisma;
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTokenHash = this.hashToken(refreshToken);
    await client.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        ipAddress: context?.ipAddress?.trim() || null,
        userAgent: context?.userAgent?.trim() || null,
        expiresAt: this.getRefreshExpiresAt(),
      },
    });

    return { accessToken, refreshToken };
  }

  private toSessionUser(user: SessionUser) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async revokeAllRefreshTokens(
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

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
        tokenVersion: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async login(data: LoginDto, context?: SessionClientContext) {
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

    const session = await this.issueSession(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        tokenVersion: user.tokenVersion,
      },
      undefined,
      context,
    );

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: this.toSessionUser(user),
    };
  }

  async refresh(refreshToken: string, context?: SessionClientContext) {
    const normalizedToken = refreshToken.trim();
    if (!normalizedToken) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    const tokenHash = this.hashToken(normalizedToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!existing || !existing.user || !existing.user.isActive) {
      throw new UnauthorizedException('Sesion expirada');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });

      const activeUser = await tx.user.findUnique({
        where: { id: existing.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mustChangePassword: true,
          isActive: true,
          tokenVersion: true,
        },
      });

      if (!activeUser || !activeUser.isActive) {
        throw new UnauthorizedException('Usuario no autorizado');
      }

      const session = await this.issueSession(activeUser, tx, context);
      return {
        ...session,
        user: this.toSessionUser(activeUser),
      };
    });

    return result;
  }

  async logout(userId: string, refreshToken?: string) {
    const normalizedToken = refreshToken?.trim();
    if (normalizedToken) {
      const tokenHash = this.hashToken(normalizedToken);
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      return { success: true };
    }

    await this.revokeAllRefreshTokens(userId);
    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await this.revokeAllRefreshTokens(userId, tx);
    });

    return { success: true };
  }

  async listActiveSessions(userId: string, currentRefreshToken?: string) {
    const normalizedCurrentToken = currentRefreshToken?.trim();
    const currentTokenHash = normalizedCurrentToken
      ? this.hashToken(normalizedCurrentToken)
      : null;

    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        tokenHash: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return {
      success: true,
      count: sessions.length,
      data: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        isCurrent: currentTokenHash ? session.tokenHash === currentTokenHash : false,
      })),
    };
  }

  async revokeSessionById(userId: string, sessionId: string) {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Sesion no encontrada o ya revocada');
    }

    return {
      success: true,
      message: 'Sesion revocada correctamente',
    };
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const genericMessage =
      'Si el correo existe, recibiras instrucciones para restablecer tu contrasena.';

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return {
        success: true,
        message: genericMessage,
      };
    }

    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = this.getPasswordResetExpiresAt();

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    const resetUrl = `${this.getWebBaseUrl()}/?resetToken=${encodeURIComponent(rawToken)}`;
    try {
      await this.passwordResetMail.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });
    } catch (error) {
      console.error('PASSWORD_RESET_EMAIL_ERROR', error);
    }

    return {
      success: true,
      message: genericMessage,
      debugToken: this.shouldReturnDebugResetToken() ? rawToken : undefined,
    };
  }

  async resetPasswordByToken(token: string, newPassword: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Token invalido o expirado');
    }

    validatePasswordPolicy(newPassword);
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const tokenHash = this.hashToken(normalizedToken);
    const now = new Date();

    const tokenRecord = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Token invalido o expirado');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: tokenRecord.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: tokenRecord.userId,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });
    });

    return {
      success: true,
      message: 'Contrasena restablecida correctamente. Inicia sesion con tu nueva clave.',
    };
  }

  async changePassword(
    userId: string,
    data: ChangePasswordDto,
    context?: SessionClientContext,
  ) {
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
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
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
          tokenVersion: true,
        },
      });

      await this.revokeAllRefreshTokens(user.id, tx);
      const session = await this.issueSession(updatedUser, tx, context);
      return {
        updatedUser,
        session,
      };
    });

    return {
      success: true,
      message: 'Contrasena actualizada correctamente',
      user: this.toSessionUser(result.updatedUser),
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
    };
  }
}
