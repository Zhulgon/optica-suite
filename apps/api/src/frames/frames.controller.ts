import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { FramesService } from './frames.service'
import { ListFramesQueryDto } from './dto/list-frames.query.dto'

@ApiTags('Frames')
@Controller('frames')
export class FramesController {
  constructor(private readonly service: FramesService) {}

  @Get()
  findAll(@Query() query: ListFramesQueryDto) {
    return this.service.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }
}