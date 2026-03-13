import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Post('admin')
  async createByAdmin(
    @Body() dto: CreateUserAdminDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const created = await this.service.createByAdmin(dto);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'USERS',
      action: 'CREATE',
      entityType: 'User',
      entityId: created.id,
      payload: {
        createdRole: created.role,
        createdEmail: created.email,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return created;
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const updated = await this.service.setActiveStatus(
      id,
      dto.isActive,
      user.sub,
    );
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'USERS',
      action: dto.isActive ? 'ACTIVATE' : 'DEACTIVATE',
      entityType: 'User',
      entityId: id,
      payload: {
        isActive: dto.isActive,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return updated;
  }

  @Patch(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const updated = await this.service.resetPasswordByAdmin(
      id,
      dto.newPassword,
      user.sub,
    );
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'USERS',
      action: 'RESET_PASSWORD',
      entityType: 'User',
      entityId: id,
      payload: {
        mustChangePassword: updated.mustChangePassword,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return updated;
  }
}
