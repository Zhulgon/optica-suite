import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { LabOrderStatus } from '@prisma/client';

export class ListLabOrdersQueryDto {
  @IsOptional()
  @IsEnum(LabOrderStatus)
  status?: LabOrderStatus;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 40;
}
