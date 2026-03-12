import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly service: SalesService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Post()
  async create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.create(dto, user.sub);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'SALES',
      action: 'CREATE',
      entityType: 'Sale',
      entityId: result.id,
      payload: {
        total: result.total,
        paymentMethod: result.paymentMethod,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub, user.role);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user.sub, user.role);
  }
}
