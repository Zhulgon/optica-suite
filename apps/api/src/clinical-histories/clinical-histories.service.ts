import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateClinicalHistoryDto } from './create-clinical-history.dto'
import { UpdateClinicalHistoryDto } from './update-clinical-history.dto'

@Injectable()
export class ClinicalHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClinicalHistoryDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { id: true },
    })

    if (!patient) throw new NotFoundException('Patient not found')

    return this.prisma.clinicalHistory.create({
      data: {
        patientId: dto.patientId,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
        motivoConsulta: dto.motivoConsulta,
        antecedentes: dto.antecedentes,

        lens_od_esf: dto.lens_od_esf,
        lens_od_cil: dto.lens_od_cil,
        lens_od_eje: dto.lens_od_eje,
        lens_od_add: dto.lens_od_add,
        lens_od_vl: dto.lens_od_vl,
        lens_od_vp: dto.lens_od_vp,

        lens_oi_esf: dto.lens_oi_esf,
        lens_oi_cil: dto.lens_oi_cil,
        lens_oi_eje: dto.lens_oi_eje,
        lens_oi_add: dto.lens_oi_add,
        lens_oi_vl: dto.lens_oi_vl,
        lens_oi_vp: dto.lens_oi_vp,

        av_od_vl: dto.av_od_vl,
        av_od_ph: dto.av_od_ph,
        av_od_vp: dto.av_od_vp,

        av_oi_vl: dto.av_oi_vl,
        av_oi_ph: dto.av_oi_ph,
        av_oi_vp: dto.av_oi_vp,

        ker_od: dto.ker_od,
        ker_oi: dto.ker_oi,

        motor_vl: dto.motor_vl,
        motor_vp: dto.motor_vp,

        refr_od_esf: dto.refr_od_esf,
        refr_od_cil: dto.refr_od_cil,
        refr_od_eje: dto.refr_od_eje,

        refr_oi_esf: dto.refr_oi_esf,
        refr_oi_cil: dto.refr_oi_cil,
        refr_oi_eje: dto.refr_oi_eje,

        dp: dto.dp,

        rx_od_esf: dto.rx_od_esf,
        rx_od_cil: dto.rx_od_cil,
        rx_od_eje: dto.rx_od_eje,
        rx_od_add: dto.rx_od_add,
        rx_od_vl: dto.rx_od_vl,
        rx_od_vp: dto.rx_od_vp,

        rx_oi_esf: dto.rx_oi_esf,
        rx_oi_cil: dto.rx_oi_cil,
        rx_oi_eje: dto.rx_oi_eje,
        rx_oi_add: dto.rx_oi_add,
        rx_oi_vl: dto.rx_oi_vl,
        rx_oi_vp: dto.rx_oi_vp,

        sp_od: dto.sp_od,
        sp_oi: dto.sp_oi,

        diagnostico: dto.diagnostico,
        disposicion: dto.disposicion,
      },
      include: { patient: true },
    })
  }

  // GET /clinical-histories?patientId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
  async findByPatient(query: { patientId: string; from?: string; to?: string }) {
    const { patientId, from, to } = query

    if (from && to && from > to) {
      throw new BadRequestException('El parámetro "from" no puede ser mayor que "to"')
    }

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : undefined
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : undefined

    return this.prisma.clinicalHistory.findMany({
      where: {
        patientId,
        ...(fromDate || toDate
          ? {
              visitDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { visitDate: 'desc' },
      include: { patient: true },
    })
  }

  async findOne(id: string) {
    const item = await this.prisma.clinicalHistory.findUnique({
      where: { id },
      include: { patient: true },
    })

    if (!item) throw new NotFoundException('Clinical history not found')

    return item
  }

  async update(id: string, dto: UpdateClinicalHistoryDto) {
    await this.findOne(id)

    return this.prisma.clinicalHistory.update({
      where: { id },
      data: {
        visitDate: (dto as any).visitDate ? new Date((dto as any).visitDate) : undefined,

        motivoConsulta: (dto as any).motivoConsulta,
        antecedentes: (dto as any).antecedentes,

        lens_od_esf: (dto as any).lens_od_esf,
        lens_od_cil: (dto as any).lens_od_cil,
        lens_od_eje: (dto as any).lens_od_eje,
        lens_od_add: (dto as any).lens_od_add,
        lens_od_vl: (dto as any).lens_od_vl,
        lens_od_vp: (dto as any).lens_od_vp,

        lens_oi_esf: (dto as any).lens_oi_esf,
        lens_oi_cil: (dto as any).lens_oi_cil,
        lens_oi_eje: (dto as any).lens_oi_eje,
        lens_oi_add: (dto as any).lens_oi_add,
        lens_oi_vl: (dto as any).lens_oi_vl,
        lens_oi_vp: (dto as any).lens_oi_vp,

        av_od_vl: (dto as any).av_od_vl,
        av_od_ph: (dto as any).av_od_ph,
        av_od_vp: (dto as any).av_od_vp,

        av_oi_vl: (dto as any).av_oi_vl,
        av_oi_ph: (dto as any).av_oi_ph,
        av_oi_vp: (dto as any).av_oi_vp,

        ker_od: (dto as any).ker_od,
        ker_oi: (dto as any).ker_oi,

        motor_vl: (dto as any).motor_vl,
        motor_vp: (dto as any).motor_vp,

        refr_od_esf: (dto as any).refr_od_esf,
        refr_od_cil: (dto as any).refr_od_cil,
        refr_od_eje: (dto as any).refr_od_eje,

        refr_oi_esf: (dto as any).refr_oi_esf,
        refr_oi_cil: (dto as any).refr_oi_cil,
        refr_oi_eje: (dto as any).refr_oi_eje,

        dp: (dto as any).dp,

        rx_od_esf: (dto as any).rx_od_esf,
        rx_od_cil: (dto as any).rx_od_cil,
        rx_od_eje: (dto as any).rx_od_eje,
        rx_od_add: (dto as any).rx_od_add,
        rx_od_vl: (dto as any).rx_od_vl,
        rx_od_vp: (dto as any).rx_od_vp,

        rx_oi_esf: (dto as any).rx_oi_esf,
        rx_oi_cil: (dto as any).rx_oi_cil,
        rx_oi_eje: (dto as any).rx_oi_eje,
        rx_oi_add: (dto as any).rx_oi_add,
        rx_oi_vl: (dto as any).rx_oi_vl,
        rx_oi_vp: (dto as any).rx_oi_vp,

        sp_od: (dto as any).sp_od,
        sp_oi: (dto as any).sp_oi,

        diagnostico: (dto as any).diagnostico,
        disposicion: (dto as any).disposicion,
      },
      include: { patient: true },
    })
  }

  async remove(id: string) {
    await this.findOne(id)

    return this.prisma.clinicalHistory.delete({
      where: { id },
      include: { patient: true },
    })
  }
}