import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RestoreBackupDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9._-]+\.sql$/, {
    message: 'Nombre de archivo invalido',
  })
  fileName: string;

  @IsString()
  @IsNotEmpty()
  confirmText: string;
}
