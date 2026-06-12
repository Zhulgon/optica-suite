import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateFrameDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999999999)
  codigo?: number;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsIn(['DAMA', 'HOMBRE', 'NINOS'])
  segmento?: 'DAMA' | 'HOMBRE' | 'NINOS';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  conPlaqueta?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioVenta?: number;
}
