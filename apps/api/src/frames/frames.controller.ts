import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FramesService } from './frames.service';
import { ListFramesQueryDto } from './dto/list-frames.query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Frames')
@Controller('frames')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FramesController {
  constructor(private readonly service: FramesService) {}

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  findAll(@Query() query: ListFramesQueryDto) {
    return this.service.findAll(query);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
