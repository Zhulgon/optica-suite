import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
