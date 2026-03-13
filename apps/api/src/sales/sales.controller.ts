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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { VoidSaleDto } from './dto/void-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { AddSalePaymentDto } from './dto/add-sale-payment.dto';

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
        frameSubtotal: result.frameSubtotal,
        lensSubtotal: result.lensSubtotal,
        subtotal: result.subtotal,
        discountType: result.discountType,
        discountValue: result.discountValue,
        discountAmount: result.discountAmount,
        taxPercent: result.taxPercent,
        taxAmount: result.taxAmount,
        lensCostTotal: result.lensCostTotal,
        grossProfit: result.grossProfit,
        paidAmount: result.paidAmount,
        balanceDue: result.balanceDue,
        paymentStatus: result.paymentStatus,
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
  findAll(@Query() query: ListSalesQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub, user.role, query);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user.sub, user.role);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Post(':id/payments')
  async addPayment(
    @Param('id') id: string,
    @Body() dto: AddSalePaymentDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.addPayment(id, dto, user.sub, user.role);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'SALES',
      action: 'ADD_PAYMENT',
      entityType: 'Sale',
      entityId: result.sale.id,
      payload: {
        paymentId: result.payment.id,
        amount: result.payment.amount,
        paymentMethod: result.payment.paymentMethod,
        balanceDue: result.sale.balanceDue,
        paymentStatus: result.sale.paymentStatus,
        notes: dto.notes ?? null,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result.sale;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Patch(':id/void')
  async voidSale(
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.voidSale(id, dto, user.sub, user.role);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'SALES',
      action: 'VOID',
      entityType: 'Sale',
      entityId: result.id,
      payload: {
        reason: dto.reason,
        total: result.total,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
