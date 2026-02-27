import { Type } from 'class-transformer'
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator'

export enum PaymentMethodDto {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  MIXED = 'MIXED',
}

export class CreateSaleItemDto {
  @IsUUID()
  frameId!: string

  @IsInt()
  @Min(1)
  quantity!: number
}

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  patientId?: string

  @IsOptional()
  @IsEnum(PaymentMethodDto)
  paymentMethod?: PaymentMethodDto

  @IsOptional()
  @IsString()
  notes?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[]
}