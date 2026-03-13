import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@ApiTags('Sites')
@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Get()
  findAll() {
    return this.sitesService.findAll();
  }

  @Post()
  async create(
    @Body() dto: CreateSiteDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const site = await this.sitesService.create(dto);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'SITES',
      action: 'CREATE',
      entityType: 'Site',
      entityId: site.id,
      payload: { code: site.code, name: site.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return site;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const site = await this.sitesService.update(id, dto);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'SITES',
      action: 'UPDATE',
      entityType: 'Site',
      entityId: site.id,
      payload: { fields: Object.keys(dto) },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return site;
  }
}
