import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  twoFactorChallengeToken?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El codigo 2FA debe tener 6 digitos',
  })
  twoFactorCode?: string;
}
