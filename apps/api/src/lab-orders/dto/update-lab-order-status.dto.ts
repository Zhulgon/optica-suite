import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LabOrderStatus } from '@prisma/client';

export class UpdateLabOrderStatusDto {
  @IsEnum(LabOrderStatus)
  status!: LabOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
