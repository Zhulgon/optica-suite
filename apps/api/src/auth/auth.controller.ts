import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
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

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly auditLogs: AuditLogsService,
    private readonly loginRateLimit: LoginRateLimitService,
  ) {}

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
  async login(@Body() body: LoginDto, @Req() req: Request) {
    const ipKey = resolveClientIp(req);
    const rateLimitState = this.loginRateLimit.check(ipKey);
    if (!rateLimitState.allowed) {
      const retryAfterSeconds = rateLimitState.retryAfterSeconds ?? 60;
      await this.auditLogs.log({
        actorEmail: body.email,
        module: 'AUTH',
        action: 'LOGIN_RATE_LIMIT_BLOCKED',
        entityType: 'User',
        payload: {
          email: body.email,
          retryAfterSeconds,
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
      const result = await this.authService.login(body);
      this.loginRateLimit.recordSuccess(ipKey);
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
        },
        ipAddress: ipKey,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.loginRateLimit.recordFailure(ipKey);
      }
      await this.auditLogs.log({
        actorEmail: body.email,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        payload: {
          email: body.email,
          reason: error instanceof Error ? error.message : 'LOGIN_FAILED',
        },
        ipAddress: ipKey,
        userAgent: req.headers['user-agent'] ?? null,
      });
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.authService.changePassword(user.sub, body);
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
  async refresh(@Body() body: RefreshTokenDto, @Req() req: Request) {
    try {
      const result = await this.authService.refresh(body.refreshToken);
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
  ) {
    const result = await this.authService.logout(user.sub, body.refreshToken);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'AUTH',
      action: 'LOGOUT',
      entityType: 'User',
      entityId: user.sub,
      payload: {
        revokedCurrentRefreshToken: Boolean(body.refreshToken),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: JwtUser, @Req() req: Request) {
    const result = await this.authService.logoutAll(user.sub);
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
