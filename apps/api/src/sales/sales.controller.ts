import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SalesService } from './sales.service'
import { CreateSaleDto } from './dto/create-sale.dto'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Roles('ADMIN', 'ASESOR')
  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.sub)
  }

  @Roles('ADMIN', 'ASESOR')
@Get()
findAll(@CurrentUser() user: any) {
  return this.service.findAll(user.sub, user.role)
}

@Roles('ADMIN', 'ASESOR')
@Get(':id')
findOne(@Param('id') id: string, @CurrentUser() user: any) {
  return this.service.findOne(id, user.sub, user.role)
}
}