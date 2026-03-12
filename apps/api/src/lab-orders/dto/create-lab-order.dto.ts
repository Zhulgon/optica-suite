import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLabOrderDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  reference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  lensDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsible?: string;

  @IsOptional()
  @IsISO8601()
  promisedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
