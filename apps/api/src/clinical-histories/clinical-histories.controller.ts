import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ClinicalHistoriesService } from './clinical-histories.service';
import { CreateClinicalHistoryDto } from './create-clinical-history.dto';
import { UpdateClinicalHistoryDto } from './update-clinical-history.dto';
import { ClinicalHistoriesQueryDto } from './clinical-histories.query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt-user.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type UploadedDocx = {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
};

type BatchImportCreateBody = {
  items?: Array<{
    patientId: string;
    sourceFileName?: string;
    mappedHistory: Partial<CreateClinicalHistoryDto>;
  }>;
};

@ApiTags('ClinicalHistories')
@Controller('clinical-histories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicalHistoriesController {
  constructor(
    private readonly service: ClinicalHistoriesService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private ensureDocx(file: UploadedDocx | undefined) {
    if (!file?.buffer) {
      throw new BadRequestException('Debes seleccionar un archivo DOCX.');
    }
    const fileName = file.originalname?.trim() || 'archivo.docx';
    const lowerFileName = fileName.toLowerCase();
    const mime = (file.mimetype ?? '').toLowerCase();
    const isDocxMime =
      mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isDocxFile = lowerFileName.endsWith('.docx');
    if (!isDocxMime && !isDocxFile) {
      throw new BadRequestException('Solo se permiten archivos .docx');
    }
    return fileName;
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Post('import/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async importPreview(
    @UploadedFile() file: UploadedDocx | undefined,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const fileName = this.ensureDocx(file);
    const preview = await this.service.previewImportFromDocx(
      file!.buffer,
      fileName,
    );

    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'IMPORT_DOCX_PREVIEW',
      entityType: 'ClinicalHistory',
      payload: {
        fileName,
        rawLineCount: preview.rawLineCount,
        warnings: preview.warnings,
        qualityScore: preview.qualityScore,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });

    return preview;
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Post('import/batch-preview')
  @UseInterceptors(
    FilesInterceptor('files', 100, {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 100,
      },
    }),
  )
  async importBatchPreview(
    @UploadedFiles() files: UploadedDocx[] | undefined,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const validFiles = (files ?? []).filter((file) => {
      try {
        this.ensureDocx(file);
        return true;
      } catch {
        return false;
      }
    });

    if (!validFiles.length) {
      throw new BadRequestException('Debes subir al menos un archivo DOCX valido.');
    }

    const preview = await this.service.previewBatchImportFromDocx(
      validFiles.map((file) => ({
        buffer: file.buffer,
        originalname: file.originalname,
      })),
      user.siteId,
    );

    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'IMPORT_DOCX_BATCH_PREVIEW',
      entityType: 'ClinicalHistory',
      payload: {
        totalFiles: preview.totalFiles,
        matchedPatients: preview.matchedPatients,
        readyToImport: preview.readyToImport,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });

    return preview;
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Post('import/batch-create')
  async importBatchCreate(
    @Body() body: BatchImportCreateBody,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('Debes enviar items para importar');
    }

    const result = await this.service.createBatchFromImport(body.items, user.siteId);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'IMPORT_DOCX_BATCH_CREATE',
      entityType: 'ClinicalHistory',
      payload: {
        total: result.total,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Post()
  async create(
    @Body() dto: CreateClinicalHistoryDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.create(dto, user.siteId);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'CREATE',
      entityType: 'ClinicalHistory',
      entityId: result.id,
      payload: {
        patientId: result.patientId,
        completionScore: result.completionScore,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get()
  @ApiQuery({ name: 'patientId', required: true, type: String })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-02-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-02-28',
  })
  findByPatient(
    @Query() query: ClinicalHistoriesQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.findByPatient(query, user.siteId);
  }

  @Roles('ADMIN', 'ASESOR', 'OPTOMETRA')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user.siteId);
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClinicalHistoryDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.update(id, dto, user.siteId);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'UPDATE',
      entityType: 'ClinicalHistory',
      entityId: id,
      payload: {
        fields: Object.keys(dto),
        completionScore: result.completionScore,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Post(':id/sign')
  async sign(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.sign(id, user.sub, user.siteId);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'SIGN',
      entityType: 'ClinicalHistory',
      entityId: id,
      payload: {
        status: result.status,
        signedAt: result.signedAt,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN')
  @Post(':id/unlock')
  async unlock(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.unlock(id, user.siteId);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'UNLOCK',
      entityType: 'ClinicalHistory',
      entityId: id,
      payload: {
        status: result.status,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }

  @Roles('ADMIN', 'OPTOMETRA')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const result = await this.service.remove(id, user.siteId);
    await this.auditLogs.log({
      actorUserId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      module: 'CLINICAL_HISTORIES',
      action: 'DELETE',
      entityType: 'ClinicalHistory',
      entityId: id,
      payload: { id },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return result;
  }
}
