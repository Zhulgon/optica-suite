import { IsISO8601, IsOptional, IsUUID } from 'class-validator'

export class ClinicalHistoriesQueryDto {
  @IsUUID()
  patientId: string

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string
}