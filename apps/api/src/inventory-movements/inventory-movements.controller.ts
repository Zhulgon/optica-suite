import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { InventoryMovementsService } from './inventory-movements.service'
import { ListInventoryMovementsQueryDto } from './dto/list-inventory-movements.query.dto'

@ApiTags('InventoryMovements')
@Controller('inventory-movements')
export class InventoryMovementsController {
  constructor(private readonly service: InventoryMovementsService) {}

  @Get()
  findAll(@Query() query: ListInventoryMovementsQueryDto) {
    return this.service.findAll(query)
  }
}