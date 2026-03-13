import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { ReportsService } from './reports.service';
import { SalesReportQueryDto } from './dto/sales-report-query.dto';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales-summary')
  getSalesSummary(
    @Query() query: SalesReportQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reportsService.getSalesSummary(query, user.sub);
  }

  @Get('executive-kpis')
  getExecutiveKpis(@CurrentUser() user: JwtUser) {
    return this.reportsService.getExecutiveKpis(user.sub);
  }
}
