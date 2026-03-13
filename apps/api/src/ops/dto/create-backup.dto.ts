import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateBackupDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  keep?: number;
}
