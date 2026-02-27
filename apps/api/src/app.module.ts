import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { PatientsModule } from './patients/patients.module'
import { ClinicalHistoriesModule } from './clinical-histories/clinical-histories.module'
import { SalesModule } from './sales/sales.module'
import { InventoryMovementsModule } from './inventory-movements/inventory-movements.module'
import { FramesModule } from './frames/frames.module'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    PatientsModule,
    ClinicalHistoriesModule,
    SalesModule,
    InventoryMovementsModule,
    FramesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}