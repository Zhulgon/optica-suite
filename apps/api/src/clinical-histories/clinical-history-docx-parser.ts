import mammoth from 'mammoth';
import { BadRequestException } from '@nestjs/common';
import type { CreateClinicalHistoryDto } from './create-clinical-history.dto';

type HeadingKey =
  | 'fecha'
  | 'nombre'
  | 'cedula'
  | 'telefono'
  | 'ocupacion'
  | 'fechaNacimiento'
  | 'edad'
  | 'motivoConsulta'
  | 'antecedentes'
  | 'lensometria'
  | 'agudezaVisual'
  | 'queratometria'
  | 'estadoMotor'
  | 'refraccion'
  | 'distanciaPupilar'
  | 'correccionFinal'
  | 'segmentoPosterior'
  | 'diagnostico'
  | 'disposicion';

type ParsedEyesRow = {
  od: string[];
  oi: string[];
};

type ParsedEyesText = {
  od?: string;
  oi?: string;
};

export type ClinicalHistoryDocxPreview = {
  sourceFileName: string;
  rawLineCount: number;
  extractedPatient: {
    name?: string;
    documentNumber?: string;
    phone?: string;
    occupation?: string;
    birthDateRaw?: string;
    birthDateIso?: string;
    age?: string;
    visitDateRaw?: string;
    visitDateIso?: string;
  };
  mappedHistory: Partial<CreateClinicalHistoryDto>;
  warnings: string[];
};

const TABLE_SKIP_TOKENS = new Set([
  'ESF',
  'CIL',
  'EJE',
  'ADD',
  'VL',
  'VP',
  'PH',
]);

const DISPOSITION_LINE_START = /^(SE\b|CONTROL\b|REMIT|RECOM|USAR\b|FORMULA\b)/i;

const MONTHS_ES: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

const HEADING_MATCHERS: Record<HeadingKey, (line: string) => boolean> = {
  fecha: (line) => line === 'FECHA' || line.startsWith('FECHA '),
  nombre: (line) => line === 'NOMBRE',
  cedula: (line) => line === 'CEDULA' || line === 'CEDULA DE CIUDADANIA',
  telefono: (line) => line === 'TELEFONO',
  ocupacion: (line) => line === 'OCUPACION',
  fechaNacimiento: (line) =>
    line === 'FECHA DE NACIMIENTO' || line === 'FEC NACIMIENTO',
  edad: (line) => line === 'EDAD',
  motivoConsulta: (line) => line === 'MOTIVO DE CONSULTA',
  antecedentes: (line) => line === 'ANTECEDENTES',
  lensometria: (line) => line.includes('LENSOMETRIA'),
  agudezaVisual: (line) => line === 'AGUDEZA VISUAL',
  queratometria: (line) => line === 'QUERATOMETRIA',
  estadoMotor: (line) => line === 'ESTADO MOTOR',
  refraccion: (line) => line === 'REFRACCION',
  distanciaPupilar: (line) => line === 'DISTANCIA PUPILAR',
  correccionFinal: (line) => line === 'CORRECCION OPTICA FINAL',
  segmentoPosterior: (line) => line === 'SEGMENTO POSTERIOR',
  diagnostico: (line) => line === 'DIAGNOSTICO',
  disposicion: (line) => line === 'DISPOSICION',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cleanTextLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }
  if (year < 1900 || year > 2100) return undefined;
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }
  const isoMonth = String(month).padStart(2, '0');
  const isoDay = String(day).padStart(2, '0');
  return `${year}-${isoMonth}-${isoDay}`;
}

function parseFlexibleDate(rawValue?: string): string | undefined {
  if (!rawValue) return undefined;
  const base = normalizeText(rawValue).replace(/^FECHA\s*/i, '').trim();
  if (!base) return undefined;

  const tokens = base.match(/[A-Z]+|\d+/g) ?? [];
  if (tokens.length < 3) return undefined;

  const day = Number(tokens[0]);
  const year = Number(tokens[tokens.length - 1]);
  if (!Number.isFinite(day) || !Number.isFinite(year)) {
    return undefined;
  }

  const monthToken = tokens[1];
  if (!monthToken) return undefined;
  if (/^\d+$/.test(monthToken)) {
    return toIsoDate(year, Number(monthToken), day);
  }

  const month = MONTHS_ES[monthToken];
  if (!month) return undefined;
  return toIsoDate(year, month, day);
}

function toNewlineText(lines: string[]): string | undefined {
  const value = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  return value || undefined;
}

function normalizeMissingToken(value: string): string {
  const normalized = normalizeText(value);
  if (normalized === '-' || normalized === '--' || normalized === 'N/A') return '';
  return cleanTextLine(value);
}

function setIfValue(
  target: Partial<CreateClinicalHistoryDto>,
  key: keyof CreateClinicalHistoryDto,
  value?: string,
) {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  target[key] = trimmed;
}

function sanitizeRowValues(values: string[]): string[] {
  return values
    .map((value) => cleanTextLine(value))
    .filter((value) => {
      if (!value) return false;
      const normalized = normalizeText(value);
      if (normalized === 'OD' || normalized === 'OI') return false;
      if (TABLE_SKIP_TOKENS.has(normalized)) return false;
      return true;
    })
    .map(normalizeMissingToken);
}

function fitRowValues(values: string[], expectedLength: number): string[] {
  if (expectedLength <= 0) return [];
  if (values.length === expectedLength) return values;
  if (values.length < expectedLength) {
    return [...values, ...Array(expectedLength - values.length).fill('')];
  }
  const fitted = values.slice(0, expectedLength);
  const overflow = values.slice(expectedLength);
  if (overflow.length > 0) {
    fitted[expectedLength - 1] = [fitted[expectedLength - 1], ...overflow]
      .filter(Boolean)
      .join(' / ');
  }
  return fitted;
}

function parseTwoEyesRows(sectionLines: string[], expectedColumns: number): ParsedEyesRow {
  const normalized = sectionLines.map((line) => normalizeText(line));
  const odIndex = normalized.findIndex((line) => line === 'OD');
  const oiIndex = normalized.findIndex((line, index) => index > odIndex && line === 'OI');

  const odRaw =
    odIndex >= 0
      ? sectionLines.slice(odIndex + 1, oiIndex > odIndex ? oiIndex : sectionLines.length)
      : [];
  const oiRaw = oiIndex >= 0 ? sectionLines.slice(oiIndex + 1) : [];

  return {
    od: fitRowValues(sanitizeRowValues(odRaw), expectedColumns),
    oi: fitRowValues(sanitizeRowValues(oiRaw), expectedColumns),
  };
}

function parseAgudezaRows(sectionLines: string[]): ParsedEyesRow {
  const rows = parseTwoEyesRows(sectionLines, 3);
  const normalizeAvRow = (row: string[]) => {
    const compact = row.filter(Boolean);
    if (compact.length === 2) {
      return [compact[0], '', compact[1]];
    }
    return fitRowValues(row, 3);
  };

  return {
    od: normalizeAvRow(rows.od),
    oi: normalizeAvRow(rows.oi),
  };
}

function parseTwoEyesText(sectionLines: string[]): ParsedEyesText {
  const normalized = sectionLines.map((line) => normalizeText(line));
  const odIndex = normalized.findIndex((line) => line === 'OD');
  const oiIndex = normalized.findIndex((line, index) => index > odIndex && line === 'OI');

  const odLines =
    odIndex >= 0
      ? sectionLines
          .slice(odIndex + 1, oiIndex > odIndex ? oiIndex : sectionLines.length)
          .map((line) => normalizeMissingToken(line))
          .filter(Boolean)
      : [];
  const oiLines =
    oiIndex >= 0
      ? sectionLines
          .slice(oiIndex + 1)
          .map((line) => normalizeMissingToken(line))
          .filter(Boolean)
      : [];

  return {
    od: odLines.join(' ').trim() || undefined,
    oi: oiLines.join(' ').trim() || undefined,
  };
}

function parseMotorValues(sectionLines: string[]): { motorVl?: string; motorVp?: string } {
  if (!sectionLines.length) return {};
  const normalized = sectionLines.map((line) => normalizeText(line));
  const vlIndex = normalized.findIndex((line) => line === 'VL' || line.startsWith('VL '));
  const vpIndex = normalized.findIndex((line) => line === 'VP' || line.startsWith('VP '));

  let motorVl = '';
  let motorVp = '';

  if (vlIndex >= 0) {
    if (normalized[vlIndex].startsWith('VL ') && sectionLines[vlIndex].length > 3) {
      motorVl = normalizeMissingToken(sectionLines[vlIndex].slice(2));
    } else {
      const vlLines = sectionLines.slice(
        vlIndex + 1,
        vpIndex > vlIndex ? vpIndex : sectionLines.length,
      );
      motorVl = vlLines
        .map((line) => normalizeMissingToken(line))
        .filter(Boolean)
        .join(' ')
        .trim();
    }
  }

  if (vpIndex >= 0) {
    if (normalized[vpIndex].startsWith('VP ') && sectionLines[vpIndex].length > 3) {
      motorVp = normalizeMissingToken(sectionLines[vpIndex].slice(2));
    } else {
      const vpLines = sectionLines.slice(vpIndex + 1);
      motorVp = vpLines
        .map((line) => normalizeMissingToken(line))
        .filter(Boolean)
        .join(' ')
        .trim();
    }
  }

  if (!motorVl && !motorVp) {
    const compact = sectionLines.map((line) => normalizeMissingToken(line)).filter(Boolean);
    if (compact.length > 0) {
      motorVl = compact[0];
      motorVp = compact[1] ?? '';
    }
  }

  return {
    motorVl: motorVl || undefined,
    motorVp: motorVp || undefined,
  };
}

function splitDiagnosticoDisposicion(lines: string[]): {
  diagnostico?: string;
  disposicion?: string;
} {
  const clean = lines.map((line) => cleanTextLine(line)).filter(Boolean);
  if (!clean.length) return {};

  const firstDispositionIndex = clean.findIndex((line) =>
    DISPOSITION_LINE_START.test(normalizeText(line)),
  );
  if (firstDispositionIndex > 0) {
    return {
      diagnostico: clean.slice(0, firstDispositionIndex).join('\n'),
      disposicion: clean.slice(firstDispositionIndex).join('\n'),
    };
  }

  if (clean.length > 1) {
    return {
      diagnostico: clean[0],
      disposicion: clean.slice(1).join('\n'),
    };
  }

  return {
    diagnostico: clean[0],
  };
}

function pickSingleValue(lines: string[]): string | undefined {
  const value = lines.map((line) => cleanTextLine(line)).find(Boolean);
  return value || undefined;
}

export async function parseClinicalHistoryDocx(
  buffer: Buffer,
  sourceFileName: string,
): Promise<ClinicalHistoryDocxPreview> {
  let rawText = '';
  try {
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value ?? '';
  } catch {
    throw new BadRequestException(
      'No se pudo leer el archivo DOCX. Verifica que no este danado.',
    );
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(cleanTextLine)
    .filter(Boolean);

  if (!lines.length) {
    throw new BadRequestException(
      'El archivo DOCX no contiene texto util para importar.',
    );
  }

  const normalizedLines = lines.map((line) => normalizeText(line));
  const headingIndex: Partial<Record<HeadingKey, number>> = {};
  (Object.keys(HEADING_MATCHERS) as HeadingKey[]).forEach((key) => {
    const index = normalizedLines.findIndex((line) => HEADING_MATCHERS[key](line));
    if (index >= 0) headingIndex[key] = index;
  });

  const allHeadingIndexes = Object.values(headingIndex)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b);

  const getSectionLines = (key: HeadingKey): string[] => {
    const start = headingIndex[key];
    if (typeof start !== 'number') return [];
    const next = allHeadingIndexes.find((index) => index > start);
    return lines.slice(start + 1, next ?? lines.length);
  };

  const getHeadingLine = (key: HeadingKey): string | undefined => {
    const index = headingIndex[key];
    if (typeof index !== 'number') return undefined;
    return lines[index];
  };

  const warnings: string[] = [];
  const requiredHeadings: HeadingKey[] = [
    'motivoConsulta',
    'antecedentes',
    'lensometria',
    'agudezaVisual',
    'refraccion',
    'correccionFinal',
    'diagnostico',
    'disposicion',
  ];
  requiredHeadings.forEach((key) => {
    if (typeof headingIndex[key] !== 'number') {
      warnings.push(`No se detecto la seccion "${key}".`);
    }
  });

  const visitHeadingLine = getHeadingLine('fecha') ?? '';
  const visitInline = cleanTextLine(visitHeadingLine.replace(/^FECHA\b/i, ''));
  const visitDateRaw = visitInline || pickSingleValue(getSectionLines('fecha'));
  const visitDateIso = parseFlexibleDate(visitDateRaw);
  if (visitDateRaw && !visitDateIso) {
    warnings.push(`No se pudo convertir la fecha de visita "${visitDateRaw}".`);
  }

  const birthDateRaw = pickSingleValue(getSectionLines('fechaNacimiento'));
  const birthDateIso = parseFlexibleDate(birthDateRaw);
  if (birthDateRaw && !birthDateIso) {
    warnings.push(`No se pudo convertir la fecha de nacimiento "${birthDateRaw}".`);
  }

  const extractedPatient = {
    name: pickSingleValue(getSectionLines('nombre')),
    documentNumber: pickSingleValue(getSectionLines('cedula')),
    phone: pickSingleValue(getSectionLines('telefono')),
    occupation: pickSingleValue(getSectionLines('ocupacion')),
    age: pickSingleValue(getSectionLines('edad')),
    birthDateRaw,
    birthDateIso,
    visitDateRaw,
    visitDateIso,
  };

  const mappedHistory: Partial<CreateClinicalHistoryDto> = {};
  if (visitDateIso) {
    mappedHistory.visitDate = visitDateIso;
  }

  setIfValue(mappedHistory, 'motivoConsulta', toNewlineText(getSectionLines('motivoConsulta')));
  setIfValue(mappedHistory, 'antecedentes', toNewlineText(getSectionLines('antecedentes')));

  const lensRows = parseTwoEyesRows(getSectionLines('lensometria'), 6);
  setIfValue(mappedHistory, 'lens_od_esf', lensRows.od[0]);
  setIfValue(mappedHistory, 'lens_od_cil', lensRows.od[1]);
  setIfValue(mappedHistory, 'lens_od_eje', lensRows.od[2]);
  setIfValue(mappedHistory, 'lens_od_add', lensRows.od[3]);
  setIfValue(mappedHistory, 'lens_od_vl', lensRows.od[4]);
  setIfValue(mappedHistory, 'lens_od_vp', lensRows.od[5]);
  setIfValue(mappedHistory, 'lens_oi_esf', lensRows.oi[0]);
  setIfValue(mappedHistory, 'lens_oi_cil', lensRows.oi[1]);
  setIfValue(mappedHistory, 'lens_oi_eje', lensRows.oi[2]);
  setIfValue(mappedHistory, 'lens_oi_add', lensRows.oi[3]);
  setIfValue(mappedHistory, 'lens_oi_vl', lensRows.oi[4]);
  setIfValue(mappedHistory, 'lens_oi_vp', lensRows.oi[5]);

  const avRows = parseAgudezaRows(getSectionLines('agudezaVisual'));
  setIfValue(mappedHistory, 'av_od_vl', avRows.od[0]);
  setIfValue(mappedHistory, 'av_od_ph', avRows.od[1]);
  setIfValue(mappedHistory, 'av_od_vp', avRows.od[2]);
  setIfValue(mappedHistory, 'av_oi_vl', avRows.oi[0]);
  setIfValue(mappedHistory, 'av_oi_ph', avRows.oi[1]);
  setIfValue(mappedHistory, 'av_oi_vp', avRows.oi[2]);

  const ker = parseTwoEyesText(getSectionLines('queratometria'));
  setIfValue(mappedHistory, 'ker_od', ker.od);
  setIfValue(mappedHistory, 'ker_oi', ker.oi);

  const motor = parseMotorValues(getSectionLines('estadoMotor'));
  setIfValue(mappedHistory, 'motor_vl', motor.motorVl);
  setIfValue(mappedHistory, 'motor_vp', motor.motorVp);

  const refrRows = parseTwoEyesRows(getSectionLines('refraccion'), 3);
  setIfValue(mappedHistory, 'refr_od_esf', refrRows.od[0]);
  setIfValue(mappedHistory, 'refr_od_cil', refrRows.od[1]);
  setIfValue(mappedHistory, 'refr_od_eje', refrRows.od[2]);
  setIfValue(mappedHistory, 'refr_oi_esf', refrRows.oi[0]);
  setIfValue(mappedHistory, 'refr_oi_cil', refrRows.oi[1]);
  setIfValue(mappedHistory, 'refr_oi_eje', refrRows.oi[2]);

  setIfValue(mappedHistory, 'dp', pickSingleValue(getSectionLines('distanciaPupilar')));

  const rxRows = parseTwoEyesRows(getSectionLines('correccionFinal'), 6);
  setIfValue(mappedHistory, 'rx_od_esf', rxRows.od[0]);
  setIfValue(mappedHistory, 'rx_od_cil', rxRows.od[1]);
  setIfValue(mappedHistory, 'rx_od_eje', rxRows.od[2]);
  setIfValue(mappedHistory, 'rx_od_add', rxRows.od[3]);
  setIfValue(mappedHistory, 'rx_od_vl', rxRows.od[4]);
  setIfValue(mappedHistory, 'rx_od_vp', rxRows.od[5]);
  setIfValue(mappedHistory, 'rx_oi_esf', rxRows.oi[0]);
  setIfValue(mappedHistory, 'rx_oi_cil', rxRows.oi[1]);
  setIfValue(mappedHistory, 'rx_oi_eje', rxRows.oi[2]);
  setIfValue(mappedHistory, 'rx_oi_add', rxRows.oi[3]);
  setIfValue(mappedHistory, 'rx_oi_vl', rxRows.oi[4]);
  setIfValue(mappedHistory, 'rx_oi_vp', rxRows.oi[5]);

  const posterior = parseTwoEyesText(getSectionLines('segmentoPosterior'));
  setIfValue(mappedHistory, 'sp_od', posterior.od);
  setIfValue(mappedHistory, 'sp_oi', posterior.oi);

  const diagnosticoBetween = getSectionLines('diagnostico');
  const disposicionLines = getSectionLines('disposicion');
  if (diagnosticoBetween.length > 0) {
    setIfValue(mappedHistory, 'diagnostico', toNewlineText(diagnosticoBetween));
    setIfValue(mappedHistory, 'disposicion', toNewlineText(disposicionLines));
  } else {
    const split = splitDiagnosticoDisposicion(disposicionLines);
    setIfValue(mappedHistory, 'diagnostico', split.diagnostico);
    setIfValue(mappedHistory, 'disposicion', split.disposicion);
  }

  if (!mappedHistory.motivoConsulta) {
    warnings.push('No se pudo mapear "Motivo de consulta".');
  }
  if (!mappedHistory.diagnostico) {
    warnings.push('No se pudo mapear "Diagnostico".');
  }

  return {
    sourceFileName,
    rawLineCount: lines.length,
    extractedPatient,
    mappedHistory,
    warnings,
  };
}
