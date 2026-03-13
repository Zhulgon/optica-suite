import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PatientsModule } from './patients/patients.module';
import { ClinicalHistoriesModule } from './clinical-histories/clinical-histories.module';
import { SalesModule } from './sales/sales.module';
import { InventoryMovementsModule } from './inventory-movements/inventory-movements.module';
import { FramesModule } from './frames/frames.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { ReportsModule } from './reports/reports.module';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { CashClosuresModule } from './cash-closures/cash-closures.module';
import { LabOrdersModule } from './lab-orders/lab-orders.module';
import { SitesModule } from './sites/sites.module';
import { OpsModule } from './ops/ops.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AuditLogsModule,
    ReportsModule,
    CashClosuresModule,
    SitesModule,
    OpsModule,
    PatientsModule,
    ClinicalHistoriesModule,
    LabOrdersModule,
    SalesModule,
    InventoryMovementsModule,
    FramesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
