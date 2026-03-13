import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'El codigo solo permite letras, numeros, guion y guion bajo',
  })
  code: string;
}
