import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CashClosuresService } from './cash-closures.service';
import { CloseCashClosureDto } from './dto/close-cash-closure.dto';
import { ListCashClosuresQueryDto } from './dto/list-cash-closures.query.dto';

@ApiTags('CashClosures')
@Controller('cash-closures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashClosuresController {
  constructor(
    private readonly service: CashClosuresService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Post('close')
  async close(
    @Body() dto: CloseCashClosureDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.close(dto, user.sub, user.role);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CASH',
      action: 'CLOSE',
      entityType: 'CashClosure',
      entityId: result.id,
      payload: {
        userId: result.userId,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        salesCount: result.salesCount,
        totalSales: result.totalSales,
        expectedCash: result.expectedCash,
        declaredCash: result.declaredCash,
        difference: result.difference,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  list(
    @Query() query: ListCashClosuresQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.findAll(query, user.sub, user.role);
  }
}
