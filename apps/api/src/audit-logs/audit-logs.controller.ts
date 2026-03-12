import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditLogsService } from './audit-logs.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';

@ApiTags('AuditLogs')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.service.findAll(query);
  }
}
