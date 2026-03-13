import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
