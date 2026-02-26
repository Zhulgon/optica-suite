import { IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Transform } from 'class-transformer'

export class ListPatientsQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  limit?: number

  @IsOptional()
  @IsString()
  q?: string
}