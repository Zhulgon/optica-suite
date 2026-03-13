import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

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

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{6,24}$/, {
    message: 'El codigo de recuperacion no tiene formato valido',
  })
  twoFactorRecoveryCode?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  trustDevice?: boolean;

  @IsOptional()
  @IsString()
  trustedDeviceToken?: string;

  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
