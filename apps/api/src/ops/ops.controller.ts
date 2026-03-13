import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { OpsService } from './ops.service';

@ApiTags('Ops')
@Controller('ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class OpsController {
  constructor(
    private readonly opsService: OpsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Get('backups')
  listBackups() {
    return this.opsService.listBackups();
  }

  @Post('backups')
  async createBackup(
    @Body() dto: CreateBackupDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.opsService.createBackup(dto.keep);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'OPS',
      action: 'BACKUP_CREATE',
      entityType: 'Backup',
      payload: {
        keep: dto.keep ?? null,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Post('backups/restore')
  async restoreBackup(
    @Body() dto: RestoreBackupDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.opsService.restoreBackup(dto.fileName, dto.confirmText);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'OPS',
      action: 'BACKUP_RESTORE',
      entityType: 'Backup',
      payload: {
        fileName: dto.fileName,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
