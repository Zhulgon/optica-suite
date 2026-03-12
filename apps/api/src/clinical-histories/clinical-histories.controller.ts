import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClinicalHistoriesService } from './clinical-histories.service';
import { CreateClinicalHistoryDto } from './create-clinical-history.dto';
import { UpdateClinicalHistoryDto } from './update-clinical-history.dto';
import { ClinicalHistoriesQueryDto } from './clinical-histories.query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@ApiTags('ClinicalHistories')
@Controller('clinical-histories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicalHistoriesController {
  constructor(
    private readonly service: ClinicalHistoriesService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Roles('ADMIN', 'OPTOMETRA')
  @Post()
  async create(
    @Body() dto: CreateClinicalHistoryDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.create(dto);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'CREATE',
      entityType: 'ClinicalHistory',
      entityId: result.id,
      payload: {
        patientId: result.patientId,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  @ApiQuery({ name: 'patientId', required: true, type: String })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-02-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-02-28',
  })
  findByPatient(@Query() query: ClinicalHistoriesQueryDto) {
    return this.service.findByPatient(query);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClinicalHistoryDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.update(id, dto);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'UPDATE',
      entityType: 'ClinicalHistory',
      entityId: id,
      payload: {
        fields: Object.keys(dto),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.remove(id);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'DELETE',
      entityType: 'ClinicalHistory',
      entityId: id,
      payload: { id },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
