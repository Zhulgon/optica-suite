import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CashClosuresController } from './cash-closures.controller';
import { CashClosuresService } from './cash-closures.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [CashClosuresController],
  providers: [CashClosuresService],
})
export class CashClosuresModule {}
