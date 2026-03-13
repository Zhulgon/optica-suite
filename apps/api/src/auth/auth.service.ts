import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { validatePasswordPolicy } from './password-policy';
import { PasswordResetMailService } from './password-reset-mail.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DEFAULT_REFRESH_DAYS = 7;
const DEFAULT_PASSWORD_RESET_MINUTES = 60;
const DEFAULT_TWO_FACTOR_CHALLENGE_MINUTES = 5;
const DEFAULT_TRUSTED_DEVICE_DAYS = 30;
const DEFAULT_RISK_LOOKBACK_DAYS = 90;
const RECOVERY_CODE_LENGTH = 10;
const DEFAULT_RECOVERY_CODES_COUNT = 8;
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  tokenVersion: number;
};

type LoginChallengeResponse = {
  requiresTwoFactor: true;
  twoFactorChallengeToken: string;
  message: string;
  reason: 'NEW_DEVICE' | 'NEW_IP' | 'UNKNOWN_DEVICE' | 'REQUIRED';
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
};

type LoginSuccessResponse = {
  accessToken: string;
  refreshToken: string;
  trustedDeviceToken?: string;
  twoFactorUsedRecoveryCode?: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    mustChangePassword: boolean;
    twoFactorEnabled: boolean;
  };
};

type SessionClientContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
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
      process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ??
        DEFAULT_PASSWORD_RESET_MINUTES,
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

  private isAdminTwoFactorEnforced() {
    return process.env.ADMIN_2FA_ENFORCED === 'true';
  }

  private getTwoFactorChallengeTtlMinutes() {
    const parsed = Number(
      process.env.TWO_FACTOR_CHALLENGE_TTL_MINUTES ??
        DEFAULT_TWO_FACTOR_CHALLENGE_MINUTES,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_TWO_FACTOR_CHALLENGE_MINUTES;
    }
    return Math.floor(parsed);
  }

  private sanitizeTwoFactorCode(raw?: string) {
    return raw?.replace(/\s+/g, '').trim() ?? '';
  }

  private sanitizeRecoveryCode(raw?: string) {
    return raw?.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim() ?? '';
  }

  private formatRecoveryCode(raw: string) {
    const normalized = raw.toUpperCase();
    const half = Math.floor(normalized.length / 2);
    return `${normalized.slice(0, half)}-${normalized.slice(half)}`;
  }

  private generateRecoveryCodeRaw() {
    const bytes = randomBytes(RECOVERY_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i += 1) {
      const index = bytes[i] % RECOVERY_CODE_ALPHABET.length;
      code += RECOVERY_CODE_ALPHABET[index];
    }
    return code;
  }

  private async issueRecoveryCodes(
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const generated = Array.from({ length: DEFAULT_RECOVERY_CODES_COUNT }, () =>
      this.generateRecoveryCodeRaw(),
    );
    const uniqueCodes = Array.from(new Set(generated));
    while (uniqueCodes.length < DEFAULT_RECOVERY_CODES_COUNT) {
      uniqueCodes.push(this.generateRecoveryCodeRaw());
    }

    await client.twoFactorRecoveryCode.deleteMany({
      where: { userId },
    });

    await client.twoFactorRecoveryCode.createMany({
      data: uniqueCodes.map((code) => ({
        userId,
        codeHash: this.hashToken(code),
      })),
    });

    return uniqueCodes.map((code) => this.formatRecoveryCode(code));
  }

  private async useRecoveryCode(userId: string, inputCode: string) {
    const normalized = this.sanitizeRecoveryCode(inputCode);
    if (!normalized) return false;

    const codeHash = this.hashToken(normalized);
    const result = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: {
        userId,
        codeHash,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  private getTrustedDeviceTtlDays() {
    const parsed = Number(
      process.env.TWO_FACTOR_TRUST_DAYS ?? DEFAULT_TRUSTED_DEVICE_DAYS,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_TRUSTED_DEVICE_DAYS;
    }
    return Math.floor(parsed);
  }

  private getRiskLookbackDays() {
    const parsed = Number(
      process.env.TWO_FACTOR_RISK_LOOKBACK_DAYS ?? DEFAULT_RISK_LOOKBACK_DAYS,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_RISK_LOOKBACK_DAYS;
    }
    return Math.floor(parsed);
  }

  private getTrustedDeviceExpiresAt() {
    const days = this.getTrustedDeviceTtlDays();
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private normalizeDeviceFingerprint(context?: SessionClientContext) {
    const explicit = context?.deviceFingerprint?.trim();
    if (explicit) return explicit;
    const userAgent = context?.userAgent?.trim() || 'unknown-agent';
    return `ua:${userAgent}`;
  }

  private getDeviceFingerprintHash(context?: SessionClientContext) {
    return this.hashToken(this.normalizeDeviceFingerprint(context));
  }

  private async createTrustedDeviceToken(
    userId: string,
    deviceFingerprintHash: string,
    context?: SessionClientContext,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const rawTrustedToken = randomBytes(48).toString('hex');
    const trustedTokenHash = this.hashToken(rawTrustedToken);
    await client.trustedDeviceToken.create({
      data: {
        userId,
        tokenHash: trustedTokenHash,
        deviceFingerprintHash,
        ipAddress: context?.ipAddress?.trim() || null,
        userAgent: context?.userAgent?.trim() || null,
        expiresAt: this.getTrustedDeviceExpiresAt(),
      },
    });
    return rawTrustedToken;
  }

  private async validateTrustedDeviceToken(
    userId: string,
    rawToken: string,
    deviceFingerprintHash: string,
  ) {
    const tokenHash = this.hashToken(rawToken.trim());
    const existing = await this.prisma.trustedDeviceToken.findFirst({
      where: {
        userId,
        tokenHash,
        deviceFingerprintHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
      },
    });

    if (!existing) return false;

    await this.prisma.trustedDeviceToken.update({
      where: { id: existing.id },
      data: {
        lastUsedAt: new Date(),
      },
    });
    return true;
  }

  private async revokeAllTrustedDeviceTokens(
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.trustedDeviceToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private async assessTwoFactorRisk(
    userId: string,
    deviceFingerprintHash: string,
    ipAddress?: string | null,
  ): Promise<{
    requiresTwoFactor: boolean;
    reason: LoginChallengeResponse['reason'];
  }> {
    const since = new Date(
      Date.now() - this.getRiskLookbackDays() * 24 * 60 * 60 * 1000,
    );

    const [seenDevice, seenIp] = await Promise.all([
      this.prisma.refreshToken.findFirst({
        where: {
          userId,
          createdAt: {
            gte: since,
          },
          deviceFingerprintHash,
        },
        select: { id: true },
      }),
      ipAddress
        ? this.prisma.refreshToken.findFirst({
            where: {
              userId,
              createdAt: {
                gte: since,
              },
              ipAddress,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!seenDevice && !seenIp) {
      return { requiresTwoFactor: true, reason: 'UNKNOWN_DEVICE' };
    }
    if (!seenDevice) {
      return { requiresTwoFactor: true, reason: 'NEW_DEVICE' };
    }
    if (ipAddress && !seenIp) {
      return { requiresTwoFactor: true, reason: 'NEW_IP' };
    }

    return { requiresTwoFactor: false, reason: 'REQUIRED' };
  }

  private async issueSession(
    user: SessionUser,
    tx?: Prisma.TransactionClient,
    context?: SessionClientContext,
  ) {
    const client = tx ?? this.prisma;
    const deviceFingerprintHash = this.getDeviceFingerprintHash(context);
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
        deviceFingerprintHash,
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
      twoFactorEnabled: user.twoFactorEnabled,
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
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async login(
    data: LoginDto,
    context?: SessionClientContext,
  ): Promise<LoginSuccessResponse | LoginChallengeResponse> {
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

    if (
      user.role === 'ADMIN' &&
      this.isAdminTwoFactorEnforced() &&
      !user.twoFactorEnabled
    ) {
      throw new UnauthorizedException(
        'Tu cuenta ADMIN requiere activar 2FA. Solicita el aprovisionamiento inicial.',
      );
    }

    const deviceFingerprintHash = this.getDeviceFingerprintHash(context);

    let trustedDeviceTokenToReturn: string | undefined;
    let twoFactorUsedRecoveryCode = false;

    if (user.twoFactorEnabled) {
      if (!user.twoFactorSecret) {
        throw new UnauthorizedException(
          'La configuracion 2FA de tu cuenta es invalida. Contacta al administrador.',
        );
      }

      const challengeToken = data.twoFactorChallengeToken?.trim() ?? '';
      const twoFactorCode = this.sanitizeTwoFactorCode(data.twoFactorCode);
      const twoFactorRecoveryCode = this.sanitizeRecoveryCode(
        data.twoFactorRecoveryCode,
      );
      const trustedDeviceToken = data.trustedDeviceToken?.trim();
      const hasTwoFactorChallenge = Boolean(
        challengeToken && (twoFactorCode || twoFactorRecoveryCode),
      );

      if (!hasTwoFactorChallenge) {
        const trustedDeviceIsValid =
          trustedDeviceToken &&
          (await this.validateTrustedDeviceToken(
            user.id,
            trustedDeviceToken,
            deviceFingerprintHash,
          ));

        const risk = await this.assessTwoFactorRisk(
          user.id,
          deviceFingerprintHash,
          context?.ipAddress?.trim() || null,
        );

        if (!trustedDeviceIsValid && risk.requiresTwoFactor) {
          const reason = risk.reason;
          const messageByReason: Record<
            LoginChallengeResponse['reason'],
            string
          > = {
            NEW_DEVICE: 'Nuevo dispositivo detectado. Confirma tu codigo 2FA.',
            NEW_IP: 'Nueva ubicacion de red detectada. Confirma tu codigo 2FA.',
            UNKNOWN_DEVICE:
              'No reconocemos este acceso. Confirma tu codigo 2FA.',
            REQUIRED: 'Se requiere codigo de autenticacion de 6 digitos.',
          };

          const twoFactorChallengeToken = await this.jwt.signAsync(
            {
              sub: user.id,
              type: '2fa-login',
              tokenVersion: user.tokenVersion,
              deviceFingerprintHash,
              ipAddress: context?.ipAddress?.trim() || null,
              trustDeviceRequested: Boolean(data.trustDevice),
            },
            {
              expiresIn: `${this.getTwoFactorChallengeTtlMinutes()}m`,
            },
          );

          return {
            requiresTwoFactor: true,
            twoFactorChallengeToken,
            message: messageByReason[reason] ?? messageByReason.REQUIRED,
            reason,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
          };
        }
      } else {
        let payload: {
          sub?: string;
          type?: string;
          tokenVersion?: number;
          deviceFingerprintHash?: string;
          ipAddress?: string | null;
          trustDeviceRequested?: boolean;
        } | null = null;
        try {
          payload = await this.jwt.verifyAsync(challengeToken);
        } catch {
          throw new UnauthorizedException(
            'Desafio 2FA invalido o expirado. Inicia sesion nuevamente.',
          );
        }

        if (
          !payload ||
          payload.type !== '2fa-login' ||
          payload.sub !== user.id ||
          payload.tokenVersion !== user.tokenVersion ||
          payload.deviceFingerprintHash !== deviceFingerprintHash ||
          (payload.ipAddress ?? null) !== (context?.ipAddress?.trim() || null)
        ) {
          throw new UnauthorizedException(
            'Desafio 2FA invalido o expirado. Inicia sesion nuevamente.',
          );
        }

        const isValidTotp = twoFactorCode
          ? await verify({
              strategy: 'totp',
              secret: user.twoFactorSecret,
              token: twoFactorCode,
            })
          : false;
        const isValidRecovery = twoFactorRecoveryCode
          ? await this.useRecoveryCode(user.id, twoFactorRecoveryCode)
          : false;

        if (!isValidTotp && !isValidRecovery) {
          throw new UnauthorizedException(
            'Codigo 2FA o codigo de recuperacion invalido',
          );
        }
        twoFactorUsedRecoveryCode = isValidRecovery;

        const shouldTrustDevice = Boolean(
          payload.trustDeviceRequested || data.trustDevice,
        );
        if (shouldTrustDevice) {
          trustedDeviceTokenToReturn = await this.createTrustedDeviceToken(
            user.id,
            deviceFingerprintHash,
            context,
          );
        }
      }
    }

    const session = await this.issueSession(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        twoFactorEnabled: user.twoFactorEnabled,
        tokenVersion: user.tokenVersion,
      },
      undefined,
      context,
    );

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      trustedDeviceToken: trustedDeviceTokenToReturn,
      twoFactorUsedRecoveryCode,
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
          twoFactorEnabled: true,
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
      await this.revokeAllTrustedDeviceTokens(userId, tx);
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
        isCurrent: currentTokenHash
          ? session.tokenHash === currentTokenHash
          : false,
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

  async getTwoFactorStatus(userId: string) {
    const [user, recoveryCodesRemaining] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          twoFactorEnabled: true,
        },
      }),
      this.prisma.twoFactorRecoveryCode.count({
        where: {
          userId,
          usedAt: null,
        },
      }),
    ]);

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    return {
      success: true,
      enabled: user.twoFactorEnabled,
      required: user.role === 'ADMIN' ? this.isAdminTwoFactorEnforced() : false,
      role: user.role,
      recoveryCodesRemaining: user.twoFactorEnabled ? recoveryCodesRemaining : 0,
    };
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo ADMIN puede configurar 2FA en esta version',
      );
    }

    const secret = generateSecret();
    const issuer = process.env.TWO_FACTOR_ISSUER?.trim() || 'Optica Suite';
    const otpauthUrl = generateURI({
      strategy: 'totp',
      label: user.email,
      issuer,
      secret,
      digits: 6,
      period: 30,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorTempSecret: secret,
      },
    });

    return {
      success: true,
      secret,
      otpauthUrl,
      manualEntryKey: secret,
      message:
        'Escanea el codigo en tu app autenticadora y luego confirma con un codigo de 6 digitos.',
    };
  }

  async enableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        twoFactorTempSecret: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo ADMIN puede configurar 2FA en esta version',
      );
    }
    if (!user.twoFactorTempSecret) {
      throw new BadRequestException(
        'No hay una configuracion 2FA pendiente. Solicita setup primero.',
      );
    }

    const normalizedCode = this.sanitizeTwoFactorCode(code);
    const isValid = await verify({
      strategy: 'totp',
      secret: user.twoFactorTempSecret,
      token: normalizedCode,
    });
    if (!isValid) {
      throw new BadRequestException('Codigo 2FA invalido');
    }

    const recoveryCodes = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: user.twoFactorTempSecret,
          twoFactorTempSecret: null,
          twoFactorEnabledAt: new Date(),
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await this.revokeAllRefreshTokens(user.id, tx);
      await this.revokeAllTrustedDeviceTokens(user.id, tx);
      return this.issueRecoveryCodes(user.id, tx);
    });

    return {
      success: true,
      message: '2FA activado correctamente',
      recoveryCodes,
    };
  }

  async disableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo ADMIN puede configurar 2FA en esta version',
      );
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA no esta activo en esta cuenta');
    }

    const normalizedCode = this.sanitizeTwoFactorCode(code);
    const isValid = await verify({
      strategy: 'totp',
      secret: user.twoFactorSecret,
      token: normalizedCode,
    });
    if (!isValid) {
      throw new BadRequestException('Codigo 2FA invalido');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorTempSecret: null,
          twoFactorEnabledAt: null,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await this.revokeAllRefreshTokens(user.id, tx);
      await this.revokeAllTrustedDeviceTokens(user.id, tx);
      await tx.twoFactorRecoveryCode.deleteMany({
        where: { userId: user.id },
      });
    });

    return {
      success: true,
      message: '2FA desactivado correctamente',
    };
  }

  async regenerateRecoveryCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo ADMIN puede gestionar 2FA en esta version',
      );
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA no esta activo en esta cuenta');
    }

    const normalizedCode = this.sanitizeTwoFactorCode(code);
    const isValid = await verify({
      strategy: 'totp',
      secret: user.twoFactorSecret,
      token: normalizedCode,
    });
    if (!isValid) {
      throw new BadRequestException('Codigo 2FA invalido');
    }

    const recoveryCodes = await this.issueRecoveryCodes(user.id);
    return {
      success: true,
      message: 'Codigos de recuperacion regenerados correctamente',
      recoveryCodes,
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
      await tx.trustedDeviceToken.updateMany({
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
      message:
        'Contrasena restablecida correctamente. Inicia sesion con tu nueva clave.',
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
          twoFactorEnabled: true,
          tokenVersion: true,
        },
      });

      await this.revokeAllRefreshTokens(user.id, tx);
      await this.revokeAllTrustedDeviceTokens(user.id, tx);
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
