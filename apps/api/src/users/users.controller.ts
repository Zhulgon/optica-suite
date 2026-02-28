import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CreateUserAdminDto } from './dto/create-user-admin.dto'

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin')
  createByAdmin(@Body() dto: CreateUserAdminDto) {
    return this.service.createByAdmin(dto)
  }
}