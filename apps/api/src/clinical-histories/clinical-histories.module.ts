import { Module } from '@nestjs/common';
import { ClinicalHistoriesController } from './clinical-histories.controller';
import { ClinicalHistoriesService } from './clinical-histories.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [ClinicalHistoriesController],
  providers: [ClinicalHistoriesService],
})
export class ClinicalHistoriesModule {}
