import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClinicalHistoryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicalHistoryDto } from './create-clinical-history.dto';
import { UpdateClinicalHistoryDto } from './update-clinical-history.dto';
import {
  ClinicalHistoryDocxPreview,
  parseClinicalHistoryDocx,
} from './clinical-history-docx-parser';

type ClinicalHistoryImportBatchPreviewItem = {
  sourceFileName: string;
  rawLineCount: number;
  extractedPatient: ClinicalHistoryDocxPreview['extractedPatient'];
  mappedHistory: Partial<CreateClinicalHistoryDto>;
  parseWarnings: string[];
  qualityScore: number;
  qualityWarnings: string[];
  requiredReady: boolean;
  matchedPatient: null | {
    id: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    siteId?: string | null;
  };
};

type ClinicalHistoryImportBatchPreview = {
  totalFiles: number;
  matchedPatients: number;
  readyToImport: number;
  items: ClinicalHistoryImportBatchPreviewItem[];
};

type ClinicalHistoryBatchCreatePayloadItem = {
  patientId: string;
  sourceFileName?: string;
  mappedHistory: Partial<CreateClinicalHistoryDto>;
};

type ClinicalQualityResult = {
  score: number;
  warnings: string[];
  requiredReady: boolean;
};

@Injectable()
export class ClinicalHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDocument(value?: string | null): string {
    if (!value) return '';
    const digits = value.replace(/\D+/g, '');
    if (digits) return digits;
    return value.trim().toUpperCase();
  }

  private ensureSiteAccess(entitySiteId?: string | null, actorSiteId?: string | null) {
    if (!actorSiteId) return;
    if (entitySiteId && entitySiteId !== actorSiteId) {
      throw new NotFoundException('Registro no encontrado en tu sede');
    }
  }

  private evaluateClinicalQuality(
    data: Partial<CreateClinicalHistoryDto>,
  ): ClinicalQualityResult {
    let score = 0;
    const warnings: string[] = [];
    const has = (value?: string | null) => Boolean(value && value.trim());
    const hasAny = (values: Array<string | null | undefined>) =>
      values.some((value) => has(value));

    const blocks = [
      has(data.visitDate) || Boolean(data.visitDate),
      has(data.motivoConsulta),
      has(data.antecedentes),
      hasAny([
        data.lens_od_esf,
        data.lens_od_cil,
        data.lens_od_eje,
        data.lens_oi_esf,
        data.lens_oi_cil,
        data.lens_oi_eje,
      ]),
      hasAny([data.av_od_vl, data.av_od_vp, data.av_oi_vl, data.av_oi_vp]),
      hasAny([
        data.refr_od_esf,
        data.refr_od_cil,
        data.refr_od_eje,
        data.refr_oi_esf,
        data.refr_oi_cil,
        data.refr_oi_eje,
      ]),
      hasAny([
        data.rx_od_esf,
        data.rx_od_cil,
        data.rx_od_eje,
        data.rx_oi_esf,
        data.rx_oi_cil,
        data.rx_oi_eje,
      ]),
      hasAny([data.ker_od, data.ker_oi, data.motor_vl, data.motor_vp, data.dp]),
      has(data.diagnostico),
      has(data.disposicion),
    ];

    blocks.forEach((ok) => {
      if (ok) score += 10;
    });

    if (!has(data.motivoConsulta)) {
      warnings.push('Falta motivo de consulta');
    }
    if (!has(data.diagnostico)) {
      warnings.push('Falta diagnostico');
    }
    if (!has(data.disposicion)) {
      warnings.push('Falta disposicion / conducta');
    }
    if (!hasAny([data.av_od_vl, data.av_oi_vl])) {
      warnings.push('Agudeza visual incompleta');
    }
    if (!hasAny([data.refr_od_esf, data.refr_oi_esf])) {
      warnings.push('Refraccion subjetiva incompleta');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      warnings,
      requiredReady:
        has(data.motivoConsulta) && has(data.diagnostico) && has(data.disposicion),
    };
  }

  private buildCreateData(
    dto: Partial<CreateClinicalHistoryDto>,
    options: {
      patientId: string;
      siteId?: string | null;
      sourceFileName?: string;
    },
  ) {
    const quality = this.evaluateClinicalQuality(dto);
    return {
      patientId: options.patientId,
      siteId: options.siteId ?? null,
      sourceFileName: options.sourceFileName?.trim() || null,
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
      completionScore: quality.score,
      completionWarnings: quality.warnings.length
        ? quality.warnings.join(' | ')
        : null,
      status: ClinicalHistoryStatus.DRAFT,
      signedAt: null,
      signedById: null,
    };
  }

  private mergeDtoForQuality(
    existing: Record<string, unknown>,
    dto: UpdateClinicalHistoryDto,
  ): Partial<CreateClinicalHistoryDto> {
    const merged: Partial<CreateClinicalHistoryDto> = {};
    const keys = [
      'visitDate',
      'motivoConsulta',
      'antecedentes',
      'lens_od_esf',
      'lens_od_cil',
      'lens_od_eje',
      'lens_od_add',
      'lens_od_vl',
      'lens_od_vp',
      'lens_oi_esf',
      'lens_oi_cil',
      'lens_oi_eje',
      'lens_oi_add',
      'lens_oi_vl',
      'lens_oi_vp',
      'av_od_vl',
      'av_od_ph',
      'av_od_vp',
      'av_oi_vl',
      'av_oi_ph',
      'av_oi_vp',
      'ker_od',
      'ker_oi',
      'motor_vl',
      'motor_vp',
      'refr_od_esf',
      'refr_od_cil',
      'refr_od_eje',
      'refr_oi_esf',
      'refr_oi_cil',
      'refr_oi_eje',
      'dp',
      'rx_od_esf',
      'rx_od_cil',
      'rx_od_eje',
      'rx_od_add',
      'rx_od_vl',
      'rx_od_vp',
      'rx_oi_esf',
      'rx_oi_cil',
      'rx_oi_eje',
      'rx_oi_add',
      'rx_oi_vl',
      'rx_oi_vp',
      'sp_od',
      'sp_oi',
      'diagnostico',
      'disposicion',
    ] as const;

    keys.forEach((key) => {
      const incoming = dto[key];
      if (typeof incoming === 'string') {
        merged[key] = incoming;
        return;
      }
      const current = existing[key];
      if (typeof current === 'string') {
        merged[key] = current;
      }
    });

    const dtoVisitDate = dto.visitDate;
    if (typeof dtoVisitDate === 'string' && dtoVisitDate.trim()) {
      merged.visitDate = dtoVisitDate.trim();
    } else {
      const existingVisitDate = existing.visitDate;
      if (existingVisitDate instanceof Date) {
        merged.visitDate = existingVisitDate.toISOString().slice(0, 10);
      }
    }

    return merged;
  }

  async previewImportFromDocx(
    fileBuffer: Buffer,
    sourceFileName: string,
  ): Promise<
    ClinicalHistoryDocxPreview & {
      qualityScore: number;
      qualityWarnings: string[];
      requiredReady: boolean;
    }
  > {
    const parsed = await parseClinicalHistoryDocx(fileBuffer, sourceFileName);
    const quality = this.evaluateClinicalQuality(parsed.mappedHistory);
    return {
      ...parsed,
      qualityScore: quality.score,
      qualityWarnings: quality.warnings,
      requiredReady: quality.requiredReady,
    };
  }

  async previewBatchImportFromDocx(
    files: Array<{ buffer: Buffer; originalname: string }>,
    siteId?: string | null,
  ): Promise<ClinicalHistoryImportBatchPreview> {
    const patients = await this.prisma.patient.findMany({
      where: siteId ? { siteId } : {},
      select: {
        id: true,
        firstName: true,
        lastName: true,
        documentNumber: true,
        siteId: true,
      },
    });
    const patientByDocument = new Map<string, (typeof patients)[number]>();
    patients.forEach((patient) => {
      const normalized = this.normalizeDocument(patient.documentNumber);
      if (normalized) patientByDocument.set(normalized, patient);
    });

    const items: ClinicalHistoryImportBatchPreviewItem[] = [];
    for (const file of files) {
      try {
        const parsed = await parseClinicalHistoryDocx(file.buffer, file.originalname);
        const quality = this.evaluateClinicalQuality(parsed.mappedHistory);
        const document = this.normalizeDocument(
          parsed.extractedPatient.documentNumber,
        );
        const matchedPatient = document ? patientByDocument.get(document) ?? null : null;
        items.push({
          sourceFileName: parsed.sourceFileName,
          rawLineCount: parsed.rawLineCount,
          extractedPatient: parsed.extractedPatient,
          mappedHistory: parsed.mappedHistory,
          parseWarnings: parsed.warnings,
          qualityScore: quality.score,
          qualityWarnings: quality.warnings,
          requiredReady: quality.requiredReady,
          matchedPatient: matchedPatient
            ? {
                id: matchedPatient.id,
                firstName: matchedPatient.firstName,
                lastName: matchedPatient.lastName,
                documentNumber: matchedPatient.documentNumber,
                siteId: matchedPatient.siteId,
              }
            : null,
        });
      } catch (error) {
        items.push({
          sourceFileName: file.originalname,
          rawLineCount: 0,
          extractedPatient: {},
          mappedHistory: {},
          parseWarnings: [
            error instanceof Error
              ? error.message
              : 'No se pudo procesar el archivo DOCX',
          ],
          qualityScore: 0,
          qualityWarnings: ['No se pudo evaluar calidad'],
          requiredReady: false,
          matchedPatient: null,
        });
      }
    }

    return {
      totalFiles: items.length,
      matchedPatients: items.filter((item) => item.matchedPatient).length,
      readyToImport: items.filter(
        (item) => item.matchedPatient && item.requiredReady,
      ).length,
      items,
    };
  }

  async createBatchFromImport(
    items: ClinicalHistoryBatchCreatePayloadItem[],
    actorSiteId?: string | null,
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Debes enviar al menos un item para importar');
    }
    if (items.length > 100) {
      throw new BadRequestException(
        'El lote supera el maximo permitido (100 historias por importacion)',
      );
    }

    const created = [];
    const skipped: Array<{ index: number; reason: string }> = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const patientId = item.patientId?.trim();
      if (!patientId) {
        skipped.push({ index, reason: 'patientId requerido' });
        continue;
      }
      try {
        const createdHistory = await this.create(
          {
            ...(item.mappedHistory ?? {}),
            patientId,
          },
          actorSiteId,
          item.sourceFileName,
        );
        created.push(createdHistory);
      } catch (error) {
        skipped.push({
          index,
          reason: error instanceof Error ? error.message : 'Error importando item',
        });
      }
    }

    return {
      success: true,
      total: items.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      skipped,
      data: created,
    };
  }

  async create(
    dto: CreateClinicalHistoryDto,
    actorSiteId?: string | null,
    sourceFileName?: string,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { id: true, siteId: true },
    });

    if (!patient) throw new NotFoundException('Patient not found');
    this.ensureSiteAccess(patient.siteId, actorSiteId);

    const data = this.buildCreateData(dto, {
      patientId: dto.patientId,
      siteId: patient.siteId ?? actorSiteId ?? null,
      sourceFileName,
    });

    return this.prisma.clinicalHistory.create({
      data,
      include: {
        patient: true,
        signedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async findByPatient(
    query: {
      patientId: string;
      from?: string;
      to?: string;
    },
    actorSiteId?: string | null,
  ) {
    const { patientId, from, to } = query;

    if (from && to && from > to) {
      throw new BadRequestException(
        'El parametro "from" no puede ser mayor que "to"',
      );
    }

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : undefined;

    return this.prisma.clinicalHistory.findMany({
      where: {
        patientId,
        ...(actorSiteId ? { siteId: actorSiteId } : {}),
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
      include: {
        patient: true,
        signedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async findOne(id: string, actorSiteId?: string | null) {
    const item = await this.prisma.clinicalHistory.findFirst({
      where: {
        id,
        ...(actorSiteId ? { siteId: actorSiteId } : {}),
      },
      include: {
        patient: true,
        signedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!item) throw new NotFoundException('Clinical history not found');

    return item;
  }

  async update(
    id: string,
    dto: UpdateClinicalHistoryDto,
    actorSiteId?: string | null,
  ) {
    const current = await this.findOne(id, actorSiteId);
    if (current.status === ClinicalHistoryStatus.SIGNED) {
      throw new BadRequestException(
        'La historia esta firmada y bloqueada. Debes desbloquearla primero.',
      );
    }

    const mergedForQuality = this.mergeDtoForQuality(
      current as unknown as Record<string, unknown>,
      dto,
    );
    const quality = this.evaluateClinicalQuality(mergedForQuality);

    return this.prisma.clinicalHistory.update({
      where: { id },
      data: {
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
        completionScore: quality.score,
        completionWarnings: quality.warnings.length
          ? quality.warnings.join(' | ')
          : null,
      },
      include: {
        patient: true,
        signedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async sign(id: string, actorUserId: string, actorSiteId?: string | null) {
    const current = await this.findOne(id, actorSiteId);
    if (current.status === ClinicalHistoryStatus.SIGNED) {
      throw new BadRequestException('La historia ya esta firmada');
    }

    return this.prisma.clinicalHistory.update({
      where: { id },
      data: {
        status: ClinicalHistoryStatus.SIGNED,
        signedAt: new Date(),
        signedById: actorUserId,
      },
      include: {
        patient: true,
        signedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async unlock(id: string, actorSiteId?: string | null) {
    const current = await this.findOne(id, actorSiteId);
    if (current.status !== ClinicalHistoryStatus.SIGNED) {
      throw new BadRequestException('La historia ya esta en borrador');
    }

    return this.prisma.clinicalHistory.update({
      where: { id },
      data: {
        status: ClinicalHistoryStatus.DRAFT,
        signedAt: null,
        signedById: null,
      },
      include: {
        patient: true,
        signedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async remove(id: string, actorSiteId?: string | null) {
    const current = await this.findOne(id, actorSiteId);
    if (current.status === ClinicalHistoryStatus.SIGNED) {
      throw new BadRequestException(
        'La historia esta firmada y no puede eliminarse sin desbloquearla',
      );
    }

    return this.prisma.clinicalHistory.delete({
      where: { id },
      include: {
        patient: true,
        signedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }
}
