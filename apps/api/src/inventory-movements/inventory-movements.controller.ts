import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InventoryMovementsService } from './inventory-movements.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

@ApiTags('InventoryMovements')
@Controller('inventory-movements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateInventoryMovementDto) {
    return this.service.create(dto);
  }
}
