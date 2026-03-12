import { IsOptional, IsString, MinLength } from 'class-validator';

export class ListSessionsDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  currentRefreshToken?: string;
}
