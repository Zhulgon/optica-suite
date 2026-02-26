import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString } from 'class-validator'

export class UpdatePatientDto {
  @ApiPropertyOptional({ example: 'Ana' })
  @IsOptional()
  @IsString()
  firstName?: string

  @ApiPropertyOptional({ example: 'Cuevas' })
  @IsOptional()
  @IsString()
  lastName?: string

  @ApiPropertyOptional({ example: '999001' })
  @IsOptional()
  @IsString()
  documentNumber?: string

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  phone?: string

  @ApiPropertyOptional({ example: 'ana@test.com' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({ example: 'Estudiante' })
  @IsOptional()
  @IsString()
  occupation?: string

  // Si luego agregas birthDate en Prisma, aquí lo metemos bien.
}