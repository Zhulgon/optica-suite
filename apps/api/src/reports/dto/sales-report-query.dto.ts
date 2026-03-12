import { IsDateString, IsOptional } from 'class-validator';

export class SalesReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
