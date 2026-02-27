import { Module } from '@nestjs/common';
import { ClinicalHistoriesController } from './clinical-histories.controller';
import { ClinicalHistoriesService } from './clinical-histories.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalHistoriesController],
  providers: [ClinicalHistoriesService],
})
export class ClinicalHistoriesModule {}