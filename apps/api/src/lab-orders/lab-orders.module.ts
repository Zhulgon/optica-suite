import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LabOrdersController } from './lab-orders.controller';
import { LabOrdersService } from './lab-orders.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService],
})
export class LabOrdersModule {}
