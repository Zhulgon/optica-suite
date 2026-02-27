import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiQuery, ApiTags } from '@nestjs/swagger'
import { ClinicalHistoriesService } from './clinical-histories.service'
import { CreateClinicalHistoryDto } from './create-clinical-history.dto'
import { UpdateClinicalHistoryDto } from './update-clinical-history.dto'
import { ClinicalHistoriesQueryDto } from './clinical-histories.query.dto'

@ApiTags('ClinicalHistories')
@Controller('clinical-histories')
export class ClinicalHistoriesController {
  constructor(private readonly service: ClinicalHistoriesService) {}

  @Post()
  create(@Body() dto: CreateClinicalHistoryDto) {
    return this.service.create(dto)
  }

  @Get()
  @ApiQuery({ name: 'patientId', required: true, type: String })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-02-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-02-28' })
  findByPatient(@Query() query: ClinicalHistoriesQueryDto) {
    return this.service.findByPatient(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClinicalHistoryDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}