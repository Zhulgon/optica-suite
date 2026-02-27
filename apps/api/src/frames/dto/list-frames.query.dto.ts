import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

export class ListFramesQueryDto {
  @IsOptional()
  @IsString()
  q?: string // codigo o referencia

  @IsOptional()
  @IsIn(['DAMA', 'HOMBRE', 'NINOS'])
  segmento?: 'DAMA' | 'HOMBRE' | 'NINOS'

  @IsOptional()
  @IsString()
  conPlaqueta?: string // "true" | "false"

  @IsOptional()
  @IsString()
  inStock?: string // "true" | "false"

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number
}