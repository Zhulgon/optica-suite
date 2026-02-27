import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class ListInventoryMovementsQueryDto {
  @IsOptional()
  @IsUUID()
  frameId?: string

  @IsOptional()
  @IsIn(['IN', 'OUT', 'ADJUST'])
  type?: 'IN' | 'OUT' | 'ADJUST'

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

  @IsOptional()
  @IsString()
  from?: string // YYYY-MM-DD

  @IsOptional()
  @IsString()
  to?: string // YYYY-MM-DD
}