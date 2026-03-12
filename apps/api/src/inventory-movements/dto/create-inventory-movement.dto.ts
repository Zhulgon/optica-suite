import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum InventoryMovementTypeDto {
  IN = 'IN',
  OUT = 'OUT',
  ADJUST = 'ADJUST',
}

export class CreateInventoryMovementDto {
  @IsUUID()
  frameId!: string;

  @IsEnum(InventoryMovementTypeDto)
  type!: InventoryMovementTypeDto;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
