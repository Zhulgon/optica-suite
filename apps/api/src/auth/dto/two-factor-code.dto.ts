import { IsString, Matches } from 'class-validator';

export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El codigo 2FA debe tener 6 digitos',
  })
  code!: string;
}
