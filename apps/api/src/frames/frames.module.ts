import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { FramesController } from './frames.controller'
import { FramesService } from './frames.service'

@Module({
  imports: [PrismaModule],
  controllers: [FramesController],
  providers: [FramesService],
})
export class FramesModule {}