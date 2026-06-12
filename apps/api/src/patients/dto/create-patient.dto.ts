import { IsDateString, IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({ example: 'Ana' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Cuevas' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '999001' })
  @IsString()
  documentNumber: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'ana@test.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Estudiante' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ example: '1994-08-22' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
