import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator'

export enum UserRole {
  ADMIN = 'ADMIN',
  ASESOR = 'ASESOR',
  OPTOMETRA = 'OPTOMETRA',
}

export class CreateUserAdminDto {
  @IsEmail()
  email: string

  @IsString()
  name: string

  @IsString()
  @MinLength(6)
  password: string

  @IsEnum(UserRole)
  role: UserRole
}