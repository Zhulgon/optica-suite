import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { InventoryMovementsService } from './inventory-movements.service'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('InventoryMovements')
@Controller('inventory-movements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.service.create(dto, user.sub)
  }
}