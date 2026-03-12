import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CloseCashClosureDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  declaredCash!: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}
