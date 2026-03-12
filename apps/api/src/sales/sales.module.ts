import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
