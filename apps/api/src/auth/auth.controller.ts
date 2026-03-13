import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { RevokeSessionDto } from './dto/revoke-session.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtUser } from './jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LoginRateLimitService } from './login-rate-limit.service';

function resolveClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    const first = forwardedFor[0];
    if (first && first.trim()) {
      return first.split(',')[0]?.trim() || 'unknown';
    }
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

const AUTH_REFRESH_COOKIE = 'optica_refresh';
const AUTH_TRUSTED_DEVICE_COOKIE = 'optica_trusted_device';
const DEFAULT_REFRESH_DAYS = 7;
const DEFAULT_TRUSTED_DEVICE_DAYS = 30;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getRefreshCookieMaxAgeMs() {
  const days = parsePositiveInt(
    process.env.JWT_REFRESH_DAYS,
    DEFAULT_REFRESH_DAYS,
  );
  return days * 24 * 60 * 60 * 1000;
}

function getTrustedCookieMaxAgeMs() {
  const days = parsePositiveInt(
    process.env.TWO_FACTOR_TRUST_DAYS,
    DEFAULT_TRUSTED_DEVICE_DAYS,
  );
  return days * 24 * 60 * 60 * 1000;
}

function getCookieSameSite(): CookieOptions['sameSite'] {
  const raw = (process.env.AUTH_COOKIE_SAMESITE ?? 'lax').trim().toLowerCase();
  if (raw === 'strict') return 'strict';
  if (raw === 'none') return 'none';
  return 'lax';
}

function shouldUseSecureCookies() {
  if (process.env.AUTH_COOKIE_SECURE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function getCookieDomain() {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return domain || undefined;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly auditLogs: AuditLogsService,
    private readonly loginRateLimit: LoginRateLimitService,
  ) {}

  private buildAuthCookieOptions(maxAgeMs: number): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      secure: shouldUseSecureCookies(),
      sameSite: getCookieSameSite(),
      path: '/',
      maxAge: maxAgeMs,
    };
    const domain = getCookieDomain();
    if (domain) {
      options.domain = domain;
    }
    return options;
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(
      AUTH_REFRESH_COOKIE,
      refreshToken,
      this.buildAuthCookieOptions(getRefreshCookieMaxAgeMs()),
    );
  }

  private setTrustedDeviceCookie(res: Response, trustedDeviceToken: string) {
    res.cookie(
      AUTH_TRUSTED_DEVICE_COOKIE,
      trustedDeviceToken,
      this.buildAuthCookieOptions(getTrustedCookieMaxAgeMs()),
    );
  }

  private clearAuthCookie(res: Response, cookieName: string) {
    const options = this.buildAuthCookieOptions(0);
    res.clearCookie(cookieName, {
      ...options,
      maxAge: 0,
      expires: new Date(0),
    });
  }

  @Post('register')
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    const user = await this.authService.register(body);
    await this.auditLogs.log({
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'REGISTER',
      entityType: 'User',
      entityId: user.id,
      payload: {
        email: user.email,
        role: user.role,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return user;
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipKey = resolveClientIp(req);
    const trustedCookieToken =
      typeof req.cookies?.[AUTH_TRUSTED_DEVICE_COOKIE] === 'string'
        ? req.cookies[AUTH_TRUSTED_DEVICE_COOKIE].trim()
        : '';
    const loginPayload: LoginDto = {
      ...body,
      email: body.email.trim().toLowerCase(),
      trustedDeviceToken:
        body.trustedDeviceToken?.trim() || trustedCookieToken || undefined,
    };
    const clientContext = {
      ipAddress: ipKey,
      userAgent: req.headers['user-agent'] ?? null,
      deviceFingerprint: loginPayload.deviceFingerprint?.trim() || null,
    };
    const [rateLimitByIp, rateLimitByEmail] = await Promise.all([
      this.loginRateLimit.check(ipKey, 'ip'),
      this.loginRateLimit.check(loginPayload.email, 'email'),
    ]);
    if (!rateLimitByIp.allowed || !rateLimitByEmail.allowed) {
      const retryAfterSeconds =
        Math.max(
          rateLimitByIp.retryAfterSeconds ?? 0,
          rateLimitByEmail.retryAfterSeconds ?? 0,
        ) || 60;
      await this.auditLogs.log({
        actorEmail: loginPayload.email,
        module: 'AUTH',
        action: 'LOGIN_RATE_LIMIT_BLOCKED',
        entityType: 'User',
        payload: {
          email: loginPayload.email,
          retryAfterSeconds,
          blockedBy: {
            ip: !rateLimitByIp.allowed,
            email: !rateLimitByEmail.allowed,
          },
        },
        ipAddress: ipKey,
        userAgent: req.headers['user-agent'] ?? null,
      });
      throw new HttpException(
        `Demasiados intentos de inicio de sesion. Intenta de nuevo en ${retryAfterSeconds} segundos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const result = await this.authService.login(loginPayload, clientContext);
      await Promise.all([
        this.loginRateLimit.recordSuccess(ipKey, 'ip'),
        this.loginRateLimit.recordSuccess(loginPayload.email, 'email'),
      ]);

      if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
        await this.auditLogs.log({
          actorUserId: result.user.id,
          actorEmail: result.user.email,
          actorRole: result.user.role,
          module: 'AUTH',
          action: 'LOGIN_2FA_CHALLENGE',
          entityType: 'User',
          entityId: result.user.id,
          payload: {
            reason: result.reason,
          },
          ipAddress: ipKey,
          userAgent: req.headers['user-agent'] ?? null,
        });
        return result;
      }

      if (!('accessToken' in result)) {
        throw new UnauthorizedException('Respuesta de autenticacion invalida');
      }

      this.setRefreshCookie(res, result.refreshToken);
      if (result.trustedDeviceToken?.trim()) {
        this.setTrustedDeviceCookie(res, result.trustedDeviceToken);
      } else if (
        Boolean(loginPayload.twoFactorChallengeToken) &&
        loginPayload.trustDevice === false
      ) {
        this.clearAuthCookie(res, AUTH_TRUSTED_DEVICE_COOKIE);
      }

      await this.auditLogs.log({
        actorUserId: result.user.id,
        actorEmail: result.user.email,
        actorRole: result.user.role,
        module: 'AUTH',
        action: 'LOGIN_SUCCESS',
        entityType: 'User',
        entityId: result.user.id,
        payload: {
          role: result.user.role,
          mustChangePassword: result.user.mustChangePassword,
          twoFactorEnabled: result.user.twoFactorEnabled,
        },
        ipAddress: ipKey,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await Promise.all([
          this.loginRateLimit.recordFailure(ipKey, 'ip'),
          this.loginRateLimit.recordFailure(loginPayload.email, 'email'),
        ]);
      }
      await this.auditLogs.log({
        actorEmail: loginPayload.email,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        payload: {
          email: loginPayload.email,
          reason: error instanceof Error ? error.message : 'LOGIN_FAILED',
        },
        ipAddress: ipKey,
        userAgent: req.headers['user-agent'] ?? null,
      });
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/status')
  async twoFactorStatus(@CurrentUser() user: JwtUser, @Req() req: Request) {
    const result = await this.authService.getTwoFactorStatus(user.sub);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'TWO_FACTOR_STATUS',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  async twoFactorSetup(@CurrentUser() user: JwtUser, @Req() req: Request) {
    const result = await this.authService.setupTwoFactor(user.sub);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'TWO_FACTOR_SETUP',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  async twoFactorEnable(
    @Body() body: TwoFactorCodeDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.authService.enableTwoFactor(user.sub, body.code);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'TWO_FACTOR_ENABLE',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  async twoFactorDisable(
    @Body() body: TwoFactorCodeDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.authService.disableTwoFactor(user.sub, body.code);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'TWO_FACTOR_DISABLE',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/recovery-codes/regenerate')
  async regenerateRecoveryCodes(
    @Body() body: TwoFactorCodeDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.authService.regenerateRecoveryCodes(
      user.sub,
      body.code,
    );
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'TWO_FACTOR_RECOVERY_CODES_REGENERATE',
      entityType: 'User',
      entityId: user.sub,
      payload: {
        generatedCount: Array.isArray(result.recoveryCodes)
          ? result.recoveryCodes.length
          : 0,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Post('request-password-reset')
  async requestPasswordReset(
    @Body() body: RequestPasswordResetDto,
    @Req() req: Request,
  ) {
    const result = await this.authService.requestPasswordReset(body.email);
    await this.auditLogs.log({
      actorEmail: body.email,
      module: 'AUTH',
      action: 'REQUEST_PASSWORD_RESET',
      entityType: 'User',
      payload: {
        email: body.email,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Post('reset-password')
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPasswordByToken(
      body.token,
      body.newPassword,
    );
    this.clearAuthCookie(res, AUTH_REFRESH_COOKIE);
    this.clearAuthCookie(res, AUTH_TRUSTED_DEVICE_COOKIE);
    await this.auditLogs.log({
      module: 'AUTH',
      action: 'RESET_PASSWORD_BY_TOKEN',
      entityType: 'User',
      payload: {
        source: 'public-reset-flow',
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  async listSessions(
    @Body() body: ListSessionsDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const cookieRefreshToken =
      typeof req.cookies?.[AUTH_REFRESH_COOKIE] === 'string'
        ? req.cookies[AUTH_REFRESH_COOKIE].trim()
        : '';
    const result = await this.authService.listActiveSessions(
      user.sub,
      body.currentRefreshToken?.trim() || cookieRefreshToken || undefined,
    );
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'LIST_ACTIVE_SESSIONS',
      entityType: 'User',
      entityId: user.sub,
      payload: {
        count: result.count,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/revoke')
  async revokeSession(
    @Body() body: RevokeSessionDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.authService.revokeSessionById(
      user.sub,
      body.sessionId,
    );
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'REVOKE_SESSION',
      entityType: 'RefreshToken',
      entityId: body.sessionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(user.sub, body, {
      ipAddress: resolveClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
    this.setRefreshCookie(res, result.refreshToken);
    this.clearAuthCookie(res, AUTH_TRUSTED_DEVICE_COOKIE);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'CHANGE_PASSWORD',
      entityType: 'User',
      entityId: user.sub,
      payload: {
        forcedChangeCompleted: true,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Post('refresh')
  async refresh(
    @Body() body: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieRefreshToken =
      typeof req.cookies?.[AUTH_REFRESH_COOKIE] === 'string'
        ? req.cookies[AUTH_REFRESH_COOKIE].trim()
        : '';
    const refreshToken = body.refreshToken?.trim() || cookieRefreshToken || '';
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token invalido');
    }
    try {
      const result = await this.authService.refresh(refreshToken, {
        ipAddress: resolveClientIp(req),
        userAgent: req.headers['user-agent'] ?? null,
      });
      this.setRefreshCookie(res, result.refreshToken);
      await this.auditLogs.log({
        actorUserId: result.user.id,
        actorEmail: result.user.email,
        actorRole: result.user.role,
        module: 'AUTH',
        action: 'REFRESH_SUCCESS',
        entityType: 'User',
        entityId: result.user.id,
        payload: {
          mustChangePassword: result.user.mustChangePassword,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return result;
    } catch (error) {
      await this.auditLogs.log({
        module: 'AUTH',
        action: 'REFRESH_FAILED',
        entityType: 'User',
        payload: {
          reason: error instanceof Error ? error.message : 'REFRESH_FAILED',
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: JwtUser,
    @Body() body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieRefreshToken =
      typeof req.cookies?.[AUTH_REFRESH_COOKIE] === 'string'
        ? req.cookies[AUTH_REFRESH_COOKIE].trim()
        : '';
    const result = await this.authService.logout(
      user.sub,
      body.refreshToken?.trim() || cookieRefreshToken || undefined,
    );
    this.clearAuthCookie(res, AUTH_REFRESH_COOKIE);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'LOGOUT',
      entityType: 'User',
      entityId: user.sub,
      payload: {
        revokedCurrentRefreshToken: Boolean(
          body.refreshToken?.trim() || cookieRefreshToken,
        ),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(user.sub);
    this.clearAuthCookie(res, AUTH_REFRESH_COOKIE);
    this.clearAuthCookie(res, AUTH_TRUSTED_DEVICE_COOKIE);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'LOGOUT_ALL',
      entityType: 'User',
      entityId: user.sub,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
