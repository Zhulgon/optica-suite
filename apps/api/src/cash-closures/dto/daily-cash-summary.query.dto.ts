import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class DailyCashSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;
}
