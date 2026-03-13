import { IsOptional, IsString } from 'class-validator';

export class UpdateUserSiteDto {
  @IsOptional()
  @IsString()
  siteId?: string;
}
