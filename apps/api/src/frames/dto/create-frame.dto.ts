import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateFrameDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999999999)
  codigo!: number;

  @IsString()
  referencia!: string;

  @IsIn(['DAMA', 'HOMBRE', 'NINOS'])
  segmento!: 'DAMA' | 'HOMBRE' | 'NINOS';

  @Type(() => Boolean)
  @IsBoolean()
  conPlaqueta!: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioVenta!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockInicial!: number;
}
