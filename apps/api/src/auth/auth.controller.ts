import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtUser } from './jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly auditLogs: AuditLogsService,
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
    try {
      const result = await this.authService.login(body);
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
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return result;
    } catch (error) {
      await this.auditLogs.log({
        actorEmail: body.email,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        payload: {
          email: body.email,
          reason: error instanceof Error ? error.message : 'LOGIN_FAILED',
        },
        ipAddress: req.ip,
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
}
