import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PatientsService } from './patients.service'
import { CreatePatientDto } from './dto/create-patient.dto'
import { ListPatientsQueryDto } from './dto/list-patients.query'
import { UpdatePatientDto } from './dto/update-patient.dto'
import { UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'

@ApiTags('Patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}
  
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query() query: ListPatientsQueryDto) {
    return this.patientsService.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id)
  }

  // 🔥 NUEVO ENDPOINT
  @Get(':id/clinical-histories')
  findPatientWithClinicalHistories(@Param('id') id: string) {
    return this.patientsService.findOneWithClinicalHistories(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.patientsService.remove(id)
  }

  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto)
  }
}