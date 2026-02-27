import { IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateClinicalHistoryDto {
  @IsUUID()
  @IsNotEmpty()
  patientId: string

  @IsOptional()
  @IsISO8601({ strict: true })
  visitDate?: string

  @IsOptional() @IsString() motivoConsulta?: string
  @IsOptional() @IsString() antecedentes?: string

  @IsOptional() @IsString() lens_od_esf?: string
  @IsOptional() @IsString() lens_od_cil?: string
  @IsOptional() @IsString() lens_od_eje?: string
  @IsOptional() @IsString() lens_od_add?: string
  @IsOptional() @IsString() lens_od_vl?: string
  @IsOptional() @IsString() lens_od_vp?: string

  @IsOptional() @IsString() lens_oi_esf?: string
  @IsOptional() @IsString() lens_oi_cil?: string
  @IsOptional() @IsString() lens_oi_eje?: string
  @IsOptional() @IsString() lens_oi_add?: string
  @IsOptional() @IsString() lens_oi_vl?: string
  @IsOptional() @IsString() lens_oi_vp?: string

  @IsOptional() @IsString() av_od_vl?: string
  @IsOptional() @IsString() av_od_ph?: string
  @IsOptional() @IsString() av_od_vp?: string

  @IsOptional() @IsString() av_oi_vl?: string
  @IsOptional() @IsString() av_oi_ph?: string
  @IsOptional() @IsString() av_oi_vp?: string

  @IsOptional() @IsString() ker_od?: string
  @IsOptional() @IsString() ker_oi?: string

  @IsOptional() @IsString() motor_vl?: string
  @IsOptional() @IsString() motor_vp?: string

  @IsOptional() @IsString() refr_od_esf?: string
  @IsOptional() @IsString() refr_od_cil?: string
  @IsOptional() @IsString() refr_od_eje?: string

  @IsOptional() @IsString() refr_oi_esf?: string
  @IsOptional() @IsString() refr_oi_cil?: string
  @IsOptional() @IsString() refr_oi_eje?: string

  @IsOptional() @IsString() dp?: string

  @IsOptional() @IsString() rx_od_esf?: string
  @IsOptional() @IsString() rx_od_cil?: string
  @IsOptional() @IsString() rx_od_eje?: string
  @IsOptional() @IsString() rx_od_add?: string
  @IsOptional() @IsString() rx_od_vl?: string
  @IsOptional() @IsString() rx_od_vp?: string

  @IsOptional() @IsString() rx_oi_esf?: string
  @IsOptional() @IsString() rx_oi_cil?: string
  @IsOptional() @IsString() rx_oi_eje?: string
  @IsOptional() @IsString() rx_oi_add?: string
  @IsOptional() @IsString() rx_oi_vl?: string
  @IsOptional() @IsString() rx_oi_vp?: string

  @IsOptional() @IsString() sp_od?: string
  @IsOptional() @IsString() sp_oi?: string

  @IsOptional() @IsString() diagnostico?: string
  @IsOptional() @IsString() disposicion?: string
}