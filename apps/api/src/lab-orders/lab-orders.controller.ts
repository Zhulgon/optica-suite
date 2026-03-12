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
import { LabOrdersService } from './lab-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { ListLabOrdersQueryDto } from './dto/list-lab-orders.query.dto';
import { UpdateLabOrderStatusDto } from './dto/update-lab-order-status.dto';

@ApiTags('LabOrders')
@Controller('lab-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LabOrdersController {
  constructor(
    private readonly service: LabOrdersService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  findAll(@Query() query: ListLabOrdersQueryDto) {
    return this.service.findAll(query);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Post()
  async create(
    @Body() dto: CreateLabOrderDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.create(dto, user.sub);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'LAB_ORDERS',
      action: 'CREATE',
      entityType: 'LabOrder',
      entityId: result.data.id,
      payload: {
        status: result.data.status,
        patientId: result.data.patientId,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLabOrderStatusDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.updateStatus(id, dto, user.sub);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'LAB_ORDERS',
      action: 'UPDATE_STATUS',
      entityType: 'LabOrder',
      entityId: result.data.id,
      payload: {
        previousStatus: result.previousStatus,
        nextStatus: result.data.status,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
