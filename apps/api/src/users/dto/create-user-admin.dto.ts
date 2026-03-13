import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export enum UserRole {
  ADMIN = 'ADMIN',
  ASESOR = 'ASESOR',
  OPTOMETRA = 'OPTOMETRA',
}

export class CreateUserAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}
