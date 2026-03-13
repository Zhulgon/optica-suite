import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@ApiTags('Appointments')
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(
    private readonly service: AppointmentsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get('optometrists')
  findOptometrists(@CurrentUser() user: JwtUser) {
    return this.service.findOptometrists(user.sub);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  findAll(
    @Query() query: ListAppointmentsQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.findAll(query, user.sub);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Post()
  async create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.create(dto, user.sub);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'APPOINTMENTS',
      action: 'CREATE',
      entityType: 'Appointment',
      entityId: result.data.id,
      payload: {
        patientId: result.data.patientId,
        optometristId: result.data.optometristId ?? null,
        siteId: result.data.siteId ?? null,
        status: result.data.status,
        scheduledAt: result.data.scheduledAt,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.update(id, dto, user.sub, user.role);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'APPOINTMENTS',
      action: 'UPDATE',
      entityType: 'Appointment',
      entityId: result.data.id,
      payload: {
        optometristId: result.data.optometristId ?? null,
        status: result.data.status,
        scheduledAt: result.data.scheduledAt,
        fields: Object.keys(dto),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
