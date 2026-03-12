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
import { ApiTags } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@ApiTags('Patients')
@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  findAll(@Query() query: ListPatientsQueryDto) {
    return this.patientsService.findAll(query);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get(':id/clinical-histories')
  findPatientWithClinicalHistories(@Param('id') id: string) {
    return this.patientsService.findOneWithClinicalHistories(id);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.patientsService.update(id, dto);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'PATIENTS',
      action: 'UPDATE',
      entityType: 'Patient',
      entityId: id,
      payload: {
        fields: Object.keys(dto),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.patientsService.remove(id);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'PATIENTS',
      action: 'DELETE',
      entityType: 'Patient',
      entityId: id,
      payload: { id },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Post()
  async create(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.patientsService.create(dto);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'PATIENTS',
      action: 'CREATE',
      entityType: 'Patient',
      entityId: result.data.id,
      payload: {
        documentNumber: result.data.documentNumber,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
