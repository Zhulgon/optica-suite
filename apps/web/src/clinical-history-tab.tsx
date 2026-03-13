import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  documentNumber: string;
  phone?: string;
  occupation?: string;
  birthDate?: string | null;
}

interface ClinicalHistory {
  id: string;
  patientId: string;
  visitDate: string;
  createdAt: string;
  status?: 'DRAFT' | 'SIGNED';
  signedAt?: string | null;
  completionScore?: number;
  completionWarnings?: string | null;
  signedBy?: {
    id: string;
    name: string;
    email?: string;
    role?: string;
  } | null;
  motivoConsulta?: string | null;
  diagnostico?: string | null;
  disposicion?: string | null;
}

interface ClinicalHistoryApiError {
  message?: string | string[];
}

interface ClinicalHistoryImportPreview {
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
  mappedHistory: Record<string, string | undefined>;
  warnings: string[];
  qualityScore?: number;
  qualityWarnings?: string[];
  requiredReady?: boolean;
}

interface ClinicalHistoryBatchPreviewItem {
  sourceFileName: string;
  rawLineCount: number;
  extractedPatient: {
    name?: string;
    documentNumber?: string;
  };
  mappedHistory: Record<string, string | undefined>;
  parseWarnings: string[];
  qualityScore: number;
  qualityWarnings: string[];
  requiredReady: boolean;
  matchedPatient: {
    id: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
  } | null;
}

interface ClinicalHistoryBatchPreview {
  totalFiles: number;
  matchedPatients: number;
  readyToImport: number;
  items: ClinicalHistoryBatchPreviewItem[];
}

type ClinicalHistoryForm = {
  patientId: string;
  visitDate: string;
  motivoConsulta: string;
  antecedentes: string;
  lens_od_esf: string;
  lens_od_cil: string;
  lens_od_eje: string;
  lens_od_add: string;
  lens_od_vl: string;
  lens_od_vp: string;
  lens_oi_esf: string;
  lens_oi_cil: string;
  lens_oi_eje: string;
  lens_oi_add: string;
  lens_oi_vl: string;
  lens_oi_vp: string;
  av_od_vl: string;
  av_od_ph: string;
  av_od_vp: string;
  av_oi_vl: string;
  av_oi_ph: string;
  av_oi_vp: string;
  ker_od: string;
  ker_oi: string;
  motor_vl: string;
  motor_vp: string;
  refr_od_esf: string;
  refr_od_cil: string;
  refr_od_eje: string;
  refr_oi_esf: string;
  refr_oi_cil: string;
  refr_oi_eje: string;
  dp: string;
  rx_od_esf: string;
  rx_od_cil: string;
  rx_od_eje: string;
  rx_od_add: string;
  rx_od_vl: string;
  rx_od_vp: string;
  rx_oi_esf: string;
  rx_oi_cil: string;
  rx_oi_eje: string;
  rx_oi_add: string;
  rx_oi_vl: string;
  rx_oi_vp: string;
  sp_od: string;
  sp_oi: string;
  diagnostico: string;
  disposicion: string;
};

type ClinicalFieldKey = keyof ClinicalHistoryForm;

type ClinicalField = {
  key: ClinicalFieldKey;
  label: string;
  multiline?: boolean;
};

type FieldColumns = 'two' | 'three';

type ClinicalHistoryDetail = ClinicalHistory &
  Partial<Record<ClinicalFieldKey, string | null>> & {
    patient?: {
      firstName?: string;
      lastName?: string;
      documentNumber?: string;
      phone?: string | null;
      occupation?: string | null;
      birthDate?: string | null;
    } | null;
  };

const todayIsoDate = new Date().toISOString().slice(0, 10);

const emptyClinicalHistoryForm: ClinicalHistoryForm = {
  patientId: '',
  visitDate: todayIsoDate,
  motivoConsulta: '',
  antecedentes: '',
  lens_od_esf: '',
  lens_od_cil: '',
  lens_od_eje: '',
  lens_od_add: '',
  lens_od_vl: '',
  lens_od_vp: '',
  lens_oi_esf: '',
  lens_oi_cil: '',
  lens_oi_eje: '',
  lens_oi_add: '',
  lens_oi_vl: '',
  lens_oi_vp: '',
  av_od_vl: '',
  av_od_ph: '',
  av_od_vp: '',
  av_oi_vl: '',
  av_oi_ph: '',
  av_oi_vp: '',
  ker_od: '',
  ker_oi: '',
  motor_vl: '',
  motor_vp: '',
  refr_od_esf: '',
  refr_od_cil: '',
  refr_od_eje: '',
  refr_oi_esf: '',
  refr_oi_cil: '',
  refr_oi_eje: '',
  dp: '',
  rx_od_esf: '',
  rx_od_cil: '',
  rx_od_eje: '',
  rx_od_add: '',
  rx_od_vl: '',
  rx_od_vp: '',
  rx_oi_esf: '',
  rx_oi_cil: '',
  rx_oi_eje: '',
  rx_oi_add: '',
  rx_oi_vl: '',
  rx_oi_vp: '',
  sp_od: '',
  sp_oi: '',
  diagnostico: '',
  disposicion: '',
};

const generalFields: ClinicalField[] = [
  { key: 'motivoConsulta', label: 'Motivo de consulta', multiline: true },
  { key: 'antecedentes', label: 'Antecedentes', multiline: true },
];

const lensometriaFields: ClinicalField[] = [
  { key: 'lens_od_esf', label: 'Lens OD ESF' },
  { key: 'lens_od_cil', label: 'Lens OD CIL' },
  { key: 'lens_od_eje', label: 'Lens OD EJE' },
  { key: 'lens_od_add', label: 'Lens OD ADD' },
  { key: 'lens_od_vl', label: 'Lens OD VL' },
  { key: 'lens_od_vp', label: 'Lens OD VP' },
  { key: 'lens_oi_esf', label: 'Lens OI ESF' },
  { key: 'lens_oi_cil', label: 'Lens OI CIL' },
  { key: 'lens_oi_eje', label: 'Lens OI EJE' },
  { key: 'lens_oi_add', label: 'Lens OI ADD' },
  { key: 'lens_oi_vl', label: 'Lens OI VL' },
  { key: 'lens_oi_vp', label: 'Lens OI VP' },
];

const agudezaVisualFields: ClinicalField[] = [
  { key: 'av_od_vl', label: 'AV OD VL' },
  { key: 'av_od_ph', label: 'AV OD PH' },
  { key: 'av_od_vp', label: 'AV OD VP' },
  { key: 'av_oi_vl', label: 'AV OI VL' },
  { key: 'av_oi_ph', label: 'AV OI PH' },
  { key: 'av_oi_vp', label: 'AV OI VP' },
];

const queratoMotorFields: ClinicalField[] = [
  { key: 'ker_od', label: 'Queratometria OD' },
  { key: 'ker_oi', label: 'Queratometria OI' },
  { key: 'motor_vl', label: 'Motor VL' },
  { key: 'motor_vp', label: 'Motor VP' },
  { key: 'dp', label: 'Distancia pupilar' },
];

const refraccionFields: ClinicalField[] = [
  { key: 'refr_od_esf', label: 'Refraccion OD ESF' },
  { key: 'refr_od_cil', label: 'Refraccion OD CIL' },
  { key: 'refr_od_eje', label: 'Refraccion OD EJE' },
  { key: 'refr_oi_esf', label: 'Refraccion OI ESF' },
  { key: 'refr_oi_cil', label: 'Refraccion OI CIL' },
  { key: 'refr_oi_eje', label: 'Refraccion OI EJE' },
];

const correccionFinalFields: ClinicalField[] = [
  { key: 'rx_od_esf', label: 'RX OD ESF' },
  { key: 'rx_od_cil', label: 'RX OD CIL' },
  { key: 'rx_od_eje', label: 'RX OD EJE' },
  { key: 'rx_od_add', label: 'RX OD ADD' },
  { key: 'rx_od_vl', label: 'RX OD VL' },
  { key: 'rx_od_vp', label: 'RX OD VP' },
  { key: 'rx_oi_esf', label: 'RX OI ESF' },
  { key: 'rx_oi_cil', label: 'RX OI CIL' },
  { key: 'rx_oi_eje', label: 'RX OI EJE' },
  { key: 'rx_oi_add', label: 'RX OI ADD' },
  { key: 'rx_oi_vl', label: 'RX OI VL' },
  { key: 'rx_oi_vp', label: 'RX OI VP' },
];

const segmentoPosteriorFields: ClinicalField[] = [
  { key: 'sp_od', label: 'Segmento posterior OD' },
  { key: 'sp_oi', label: 'Segmento posterior OI' },
];

const cierreFields: ClinicalField[] = [
  { key: 'diagnostico', label: 'Diagnostico', multiline: true },
  { key: 'disposicion', label: 'Conducta / Disposicion', multiline: true },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readPrintableValue(
  history: ClinicalHistoryDetail,
  key: ClinicalFieldKey,
): string {
  const rawValue = history[key];
  if (typeof rawValue !== 'string') return '-';
  const trimmedValue = rawValue.trim();
  return trimmedValue || '-';
}

function toHtmlText(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br />');
}

function renderPrintableTable(
  headers: string[],
  rows: string[][],
  className = '',
): string {
  const headerHtml = headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join('');
  const rowsHtml = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${toHtmlText(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('');

  return `<table class="grid-table ${className}"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function buildClinicalHistoryPrintHtml(
  history: ClinicalHistoryDetail,
  fallbackPatient?: Patient,
): string {
  const patient = history.patient ?? null;
  const firstName = patient?.firstName ?? fallbackPatient?.firstName ?? '';
  const lastName = patient?.lastName ?? fallbackPatient?.lastName ?? '';
  const fullName = `${firstName} ${lastName}`.trim() || '-';
  const documentNumber =
    patient?.documentNumber ?? fallbackPatient?.documentNumber ?? '-';
  const phone = patient?.phone ?? fallbackPatient?.phone ?? '-';
  const occupation = patient?.occupation ?? fallbackPatient?.occupation ?? '-';
  const birthDate = formatAsDate(patient?.birthDate ?? fallbackPatient?.birthDate);
  const age = getAgeFromBirthDate(patient?.birthDate ?? fallbackPatient?.birthDate);
  const visitDate = formatAsDate(history.visitDate);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Historia clinica</title>
  <style>
    @page { size: A4 portrait; margin: 6mm; }
    body { font-family: Arial, sans-serif; color: #1b2440; margin: 0; font-size: 10px; line-height: 1.2; }
    h1 { margin: 0; font-size: 15px; }
    h2 { margin: 0; font-size: 11px; color: #0f3f99; text-transform: uppercase; letter-spacing: 0.02em; }
    .muted { color: #4f5d76; font-size: 9px; }
    .sheet { display: grid; gap: 4px; }
    .sheet-head { border: 1px solid #6f89be; padding: 5px 6px; display: flex; justify-content: space-between; align-items: baseline; }
    .box { border: 1px solid #90a9dc; padding: 4px; break-inside: avoid; page-break-inside: avoid; }
    .box-title { margin-bottom: 4px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .grid-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .grid-table th, .grid-table td { border: 1px solid #9cb2df; padding: 2px 3px; vertical-align: top; }
    .grid-table th { background: #edf3ff; font-size: 9px; font-weight: 700; text-align: left; }
    .grid-table td { font-size: 9px; white-space: pre-wrap; word-break: break-word; }
    .patient-table td { font-size: 9px; }
    .patient-label { font-weight: 700; }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="sheet-head">
      <h1>Historia clinica optometrica</h1>
      <p class="muted">Fecha visita: ${escapeHtml(visitDate)}</p>
    </header>

    <section class="box">
      <h2 class="box-title">Datos del paciente</h2>
      <table class="grid-table patient-table">
        <tbody>
          <tr>
            <td><span class="patient-label">Nombre:</span> ${escapeHtml(fullName)}</td>
            <td><span class="patient-label">Cedula:</span> ${escapeHtml(documentNumber)}</td>
            <td><span class="patient-label">Telefono:</span> ${escapeHtml(phone)}</td>
          </tr>
          <tr>
            <td><span class="patient-label">Ocupacion:</span> ${escapeHtml(occupation)}</td>
            <td><span class="patient-label">Nacimiento:</span> ${escapeHtml(birthDate)}</td>
            <td><span class="patient-label">Edad:</span> ${escapeHtml(age)}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="box">
      <h2 class="box-title">Datos generales</h2>
      <table class="grid-table">
        <tbody>
          <tr>
            <th>Motivo de consulta</th>
            <td>${toHtmlText(readPrintableValue(history, 'motivoConsulta'))}</td>
          </tr>
          <tr>
            <th>Antecedentes</th>
            <td>${toHtmlText(readPrintableValue(history, 'antecedentes'))}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="two-col">
      <article class="box">
        <h2 class="box-title">Lensometria</h2>
        ${renderPrintableTable(
          ['Ojo', 'ESF', 'CIL', 'EJE', 'ADD', 'VL', 'VP'],
          [
            [
              'OD',
              readPrintableValue(history, 'lens_od_esf'),
              readPrintableValue(history, 'lens_od_cil'),
              readPrintableValue(history, 'lens_od_eje'),
              readPrintableValue(history, 'lens_od_add'),
              readPrintableValue(history, 'lens_od_vl'),
              readPrintableValue(history, 'lens_od_vp'),
            ],
            [
              'OI',
              readPrintableValue(history, 'lens_oi_esf'),
              readPrintableValue(history, 'lens_oi_cil'),
              readPrintableValue(history, 'lens_oi_eje'),
              readPrintableValue(history, 'lens_oi_add'),
              readPrintableValue(history, 'lens_oi_vl'),
              readPrintableValue(history, 'lens_oi_vp'),
            ],
          ],
        )}
      </article>

      <article class="box">
        <h2 class="box-title">Agudeza visual</h2>
        ${renderPrintableTable(
          ['Ojo', 'VL', 'PH', 'VP'],
          [
            [
              'OD',
              readPrintableValue(history, 'av_od_vl'),
              readPrintableValue(history, 'av_od_ph'),
              readPrintableValue(history, 'av_od_vp'),
            ],
            [
              'OI',
              readPrintableValue(history, 'av_oi_vl'),
              readPrintableValue(history, 'av_oi_ph'),
              readPrintableValue(history, 'av_oi_vp'),
            ],
          ],
        )}
      </article>
    </section>

    <section class="two-col">
      <article class="box">
        <h2 class="box-title">Queratometria y estado motor</h2>
        <table class="grid-table">
          <tbody>
            <tr>
              <th>Queratometria OD</th>
              <td>${toHtmlText(readPrintableValue(history, 'ker_od'))}</td>
            </tr>
            <tr>
              <th>Queratometria OI</th>
              <td>${toHtmlText(readPrintableValue(history, 'ker_oi'))}</td>
            </tr>
            <tr>
              <th>Motor VL</th>
              <td>${toHtmlText(readPrintableValue(history, 'motor_vl'))}</td>
            </tr>
            <tr>
              <th>Motor VP</th>
              <td>${toHtmlText(readPrintableValue(history, 'motor_vp'))}</td>
            </tr>
            <tr>
              <th>Distancia pupilar</th>
              <td>${toHtmlText(readPrintableValue(history, 'dp'))}</td>
            </tr>
          </tbody>
        </table>
      </article>

      <article class="box">
        <h2 class="box-title">Refraccion subjetiva</h2>
        ${renderPrintableTable(
          ['Ojo', 'ESF', 'CIL', 'EJE'],
          [
            [
              'OD',
              readPrintableValue(history, 'refr_od_esf'),
              readPrintableValue(history, 'refr_od_cil'),
              readPrintableValue(history, 'refr_od_eje'),
            ],
            [
              'OI',
              readPrintableValue(history, 'refr_oi_esf'),
              readPrintableValue(history, 'refr_oi_cil'),
              readPrintableValue(history, 'refr_oi_eje'),
            ],
          ],
        )}
      </article>
    </section>

    <section class="box">
      <h2 class="box-title">Correccion optica final</h2>
      ${renderPrintableTable(
        ['Ojo', 'ESF', 'CIL', 'EJE', 'ADD', 'VL', 'VP'],
        [
          [
            'OD',
            readPrintableValue(history, 'rx_od_esf'),
            readPrintableValue(history, 'rx_od_cil'),
            readPrintableValue(history, 'rx_od_eje'),
            readPrintableValue(history, 'rx_od_add'),
            readPrintableValue(history, 'rx_od_vl'),
            readPrintableValue(history, 'rx_od_vp'),
          ],
          [
            'OI',
            readPrintableValue(history, 'rx_oi_esf'),
            readPrintableValue(history, 'rx_oi_cil'),
            readPrintableValue(history, 'rx_oi_eje'),
            readPrintableValue(history, 'rx_oi_add'),
            readPrintableValue(history, 'rx_oi_vl'),
            readPrintableValue(history, 'rx_oi_vp'),
          ],
        ],
      )}
    </section>

    <section class="two-col">
      <article class="box">
        <h2 class="box-title">Segmento posterior</h2>
        <table class="grid-table">
          <tbody>
            <tr>
              <th>Segmento posterior OD</th>
              <td>${toHtmlText(readPrintableValue(history, 'sp_od'))}</td>
            </tr>
            <tr>
              <th>Segmento posterior OI</th>
              <td>${toHtmlText(readPrintableValue(history, 'sp_oi'))}</td>
            </tr>
          </tbody>
        </table>
      </article>

      <article class="box">
        <h2 class="box-title">Diagnostico y conducta</h2>
        <table class="grid-table">
          <tbody>
            <tr>
              <th>Diagnostico</th>
              <td>${toHtmlText(readPrintableValue(history, 'diagnostico'))}</td>
            </tr>
            <tr>
              <th>Conducta / Disposicion</th>
              <td>${toHtmlText(readPrintableValue(history, 'disposicion'))}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </section>
  </main>
</body>
</html>`;
}

function sanitizeClinicalPayload(form: ClinicalHistoryForm): Record<string, string> {
  const payload: Record<string, string> = {
    patientId: form.patientId,
  };

  (Object.keys(form) as ClinicalFieldKey[]).forEach((key) => {
    if (key === 'patientId') return;
    const value = form[key].trim();
    if (value) payload[key] = value;
  });

  return payload;
}

function sanitizeClinicalUpdatePayload(
  form: ClinicalHistoryForm,
): Record<string, string> {
  const payload: Record<string, string> = {};

  (Object.keys(form) as ClinicalFieldKey[]).forEach((key) => {
    if (key === 'patientId') return;
    const value = form[key].trim();
    if (key === 'visitDate') {
      if (value) payload[key] = value;
      return;
    }
    payload[key] = value;
  });

  return payload;
}

async function apiRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  const isFormDataBody =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!headers.has('Content-Type') && options.body && !isFormDataBody) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson
    ? ((await response.json()) as ClinicalHistoryApiError | T)
    : undefined;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('__UNAUTHORIZED__');
    }
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = payload.message;
      if (Array.isArray(message)) throw new Error(message.join(' | '));
      if (typeof message === 'string') throw new Error(message);
    }
    throw new Error(`Error ${response.status}`);
  }

  return payload as T;
}

function formatAsDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getAgeFromBirthDate(value?: string | null): string {
  if (!value) return '-';
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) return '-';
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? String(age) : '-';
}

function toIsoDateInput(value?: string | null): string {
  if (!value) return todayIsoDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayIsoDate;
  return date.toISOString().slice(0, 10);
}

function mapHistoryToForm(history: ClinicalHistoryDetail): ClinicalHistoryForm {
  const form: ClinicalHistoryForm = {
    ...emptyClinicalHistoryForm,
    patientId: history.patientId,
    visitDate: toIsoDateInput(history.visitDate),
  };

  (Object.keys(emptyClinicalHistoryForm) as ClinicalFieldKey[]).forEach((key) => {
    if (key === 'patientId' || key === 'visitDate') return;
    const rawValue = history[key];
    form[key] = typeof rawValue === 'string' ? rawValue : '';
  });

  return form;
}

function mergeImportedHistoryIntoForm(
  currentForm: ClinicalHistoryForm,
  mappedHistory: Record<string, string | undefined>,
): ClinicalHistoryForm {
  const nextForm: ClinicalHistoryForm = { ...currentForm };

  (Object.keys(emptyClinicalHistoryForm) as ClinicalFieldKey[]).forEach((key) => {
    if (key === 'patientId') return;
    const incoming = mappedHistory[key];
    if (typeof incoming !== 'string') return;
    const trimmed = incoming.trim();
    if (!trimmed) return;
    if (key === 'visitDate') {
      nextForm.visitDate = toIsoDateInput(trimmed);
      return;
    }
    nextForm[key] = trimmed;
  });

  return nextForm;
}

function normalizeDocumentValue(value?: string | null): string {
  if (!value) return '';
  const digits = value.replace(/\D+/g, '');
  return digits || value.trim().toUpperCase();
}

export function ClinicalHistoryTab({
  token,
  patients,
  canCreateClinical,
  currentUserRole,
  onUnauthorized,
}: {
  token: string;
  patients: Patient[];
  canCreateClinical: boolean;
  currentUserRole: 'ADMIN' | 'ASESOR' | 'OPTOMETRA';
  onUnauthorized: () => void;
}) {
  const [historyPatientId, setHistoryPatientId] = useState('');
  const [historyForm, setHistoryForm] = useState<ClinicalHistoryForm>(
    emptyClinicalHistoryForm,
  );
  const [historySaving, setHistorySaving] = useState(false);
  const [historyLoadingDetail, setHistoryLoadingDetail] = useState(false);
  const [historyPrintingId, setHistoryPrintingId] = useState('');
  const [historyDeletingId, setHistoryDeletingId] = useState('');
  const [historySigningId, setHistorySigningId] = useState('');
  const [historyUnlockingId, setHistoryUnlockingId] = useState('');
  const [editingHistoryId, setEditingHistoryId] = useState('');
  const [historyMessage, setHistoryMessage] = useState('');
  const [histories, setHistories] = useState<ClinicalHistory[]>([]);
  const [historiesLoading, setHistoriesLoading] = useState(false);
  const [historiesError, setHistoriesError] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingDocx, setImportingDocx] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importPreview, setImportPreview] =
    useState<ClinicalHistoryImportPreview | null>(null);
  const [batchImportFiles, setBatchImportFiles] = useState<File[]>([]);
  const [batchImportLoading, setBatchImportLoading] = useState(false);
  const [batchImportMessage, setBatchImportMessage] = useState('');
  const [batchImportPreview, setBatchImportPreview] =
    useState<ClinicalHistoryBatchPreview | null>(null);
  const [batchImporting, setBatchImporting] = useState(false);
  const selectedPatient = patients.find((p) => p.id === historyForm.patientId);
  const selectedDocument = normalizeDocumentValue(selectedPatient?.documentNumber);
  const importedDocument = normalizeDocumentValue(
    importPreview?.extractedPatient.documentNumber,
  );
  const hasImportedDocumentMismatch = Boolean(
    selectedDocument && importedDocument && selectedDocument !== importedDocument,
  );

  const loadClinicalHistories = useCallback(
    async (patientId: string) => {
      if (!patientId) {
        setHistories([]);
        return;
      }

      setHistoriesLoading(true);
      setHistoriesError('');
      try {
        const response = await apiRequest<ClinicalHistory[]>(
          `/clinical-histories?patientId=${patientId}`,
          token,
          { method: 'GET' },
        );
        setHistories(response);
      } catch (error) {
        if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
          onUnauthorized();
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Error al cargar historias clinicas';
        setHistoriesError(message);
      } finally {
        setHistoriesLoading(false);
      }
    },
    [token, onUnauthorized],
  );

  useEffect(() => {
    if (!patients.length) return;

    setHistoryPatientId((current) => current || patients[0].id);
    setHistoryForm((current) =>
      current.patientId ? current : { ...current, patientId: patients[0].id },
    );
  }, [patients]);

  useEffect(() => {
    if (!historyPatientId) {
      setHistories([]);
      return;
    }
    void loadClinicalHistories(historyPatientId);
  }, [historyPatientId, loadClinicalHistories]);

  const updateHistoryField = (key: ClinicalFieldKey, value: string) => {
    setHistoryForm((current) => ({ ...current, [key]: value }));
  };

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
    setImportMessage('');
  };

  const handleImportDocxPreview = async () => {
    if (!canCreateClinical) return;
    if (!importFile) {
      setImportMessage('Selecciona un archivo DOCX para analizar.');
      return;
    }

    setImportingDocx(true);
    setImportMessage('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const preview = await apiRequest<ClinicalHistoryImportPreview>(
        '/clinical-histories/import/preview',
        token,
        {
          method: 'POST',
          body: formData,
        },
      );

      setImportPreview(preview);
      setHistoryForm((current) =>
        mergeImportedHistoryIntoForm(current, preview.mappedHistory),
      );
      setHistoryMessage(
        'Campos autocompletados desde el DOCX. Revisa los datos antes de guardar.',
      );
      setImportMessage(`Archivo analizado: ${preview.sourceFileName}`);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo analizar el DOCX';
      setImportMessage(message);
    } finally {
      setImportingDocx(false);
    }
  };

  const handleBatchImportFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setBatchImportFiles(files);
    setBatchImportMessage('');
  };

  const handleBatchImportPreview = async () => {
    if (!canCreateClinical) return;
    if (!batchImportFiles.length) {
      setBatchImportMessage('Selecciona uno o varios archivos DOCX para analizar.');
      return;
    }

    setBatchImportLoading(true);
    setBatchImportMessage('');
    try {
      const formData = new FormData();
      batchImportFiles.forEach((file) => {
        formData.append('files', file);
      });

      const preview = await apiRequest<ClinicalHistoryBatchPreview>(
        '/clinical-histories/import/batch-preview',
        token,
        {
          method: 'POST',
          body: formData,
        },
      );
      setBatchImportPreview(preview);
      setBatchImportMessage(
        `Lote analizado: ${preview.totalFiles} archivo(s), ${preview.readyToImport} listo(s) para importar.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      setBatchImportMessage(
        error instanceof Error ? error.message : 'No se pudo analizar el lote DOCX',
      );
    } finally {
      setBatchImportLoading(false);
    }
  };

  const handleBatchImportCreate = async () => {
    if (!canCreateClinical || !batchImportPreview) return;
    const items = batchImportPreview.items
      .filter((item) => item.matchedPatient && item.requiredReady)
      .map((item) => ({
        patientId: item.matchedPatient!.id,
        sourceFileName: item.sourceFileName,
        mappedHistory: item.mappedHistory,
      }));

    if (!items.length) {
      setBatchImportMessage('No hay items validos para importar en el lote.');
      return;
    }

    setBatchImporting(true);
    setBatchImportMessage('');
    try {
      const result = await apiRequest<{
        success: boolean;
        createdCount: number;
        skippedCount: number;
      }>('/clinical-histories/import/batch-create', token, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });

      setBatchImportMessage(
        `Importacion completada. Creadas: ${result.createdCount}. Omitidas: ${result.skippedCount}.`,
      );
      if (historyPatientId) {
        await loadClinicalHistories(historyPatientId);
      }
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      setBatchImportMessage(
        error instanceof Error ? error.message : 'No se pudo importar el lote',
      );
    } finally {
      setBatchImporting(false);
    }
  };

  const handleClinicalPatientChange = (patientId: string) => {
    setEditingHistoryId('');
    setHistoryMessage('');
    setImportMessage('');
    setImportPreview(null);
    setImportFile(null);
    setBatchImportMessage('');
    setBatchImportPreview(null);
    setBatchImportFiles([]);
    setHistoryPatientId(patientId);
    setHistoryForm({
      ...emptyClinicalHistoryForm,
      patientId,
      visitDate: todayIsoDate,
    });
  };

  const resetClinicalForm = (patientId: string) => {
    setEditingHistoryId('');
    setImportMessage('');
    setImportPreview(null);
    setImportFile(null);
    setBatchImportMessage('');
    setBatchImportPreview(null);
    setBatchImportFiles([]);
    setHistoryForm({
      ...emptyClinicalHistoryForm,
      patientId,
      visitDate: todayIsoDate,
    });
  };

  const handleEditHistory = async (historyId: string) => {
    if (!canCreateClinical) return;
    setHistoryLoadingDetail(true);
    setHistoryMessage('');
    try {
      const history = await apiRequest<ClinicalHistoryDetail>(
        `/clinical-histories/${historyId}`,
        token,
        { method: 'GET' },
      );
      if (history.status === 'SIGNED') {
        setHistoryMessage(
          'Esta historia esta firmada y bloqueada. Debes desbloquearla antes de editar.',
        );
        return;
      }
      setImportMessage('');
      setImportPreview(null);
      setImportFile(null);
      setEditingHistoryId(historyId);
      setHistoryPatientId(history.patientId);
      setHistoryForm(mapHistoryToForm(history));
      setHistoryMessage('Editando historia clinica seleccionada.');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo cargar la historia clinica';
      setHistoryMessage(message);
    } finally {
      setHistoryLoadingDetail(false);
    }
  };

  const handleDeleteHistory = async (historyId: string) => {
    if (!canCreateClinical) return;
    const current = histories.find((item) => item.id === historyId);
    if (current?.status === 'SIGNED') {
      setHistoryMessage(
        'La historia esta firmada. Debes desbloquearla antes de eliminar.',
      );
      return;
    }
    const confirmed = window.confirm(
      'Se eliminara esta historia clinica de forma permanente. Deseas continuar?',
    );
    if (!confirmed) return;

    setHistoryDeletingId(historyId);
    setHistoryMessage('');
    try {
      await apiRequest(`/clinical-histories/${historyId}`, token, {
        method: 'DELETE',
      });

      if (editingHistoryId === historyId) {
        resetClinicalForm(historyPatientId);
      }

      setHistoryMessage('Historia clinica eliminada correctamente.');
      await loadClinicalHistories(historyPatientId);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar la historia clinica';
      setHistoryMessage(message);
    } finally {
      setHistoryDeletingId('');
    }
  };

  const handleSignHistory = async (historyId: string) => {
    if (!canCreateClinical) return;
    setHistorySigningId(historyId);
    setHistoryMessage('');
    try {
      await apiRequest(`/clinical-histories/${historyId}/sign`, token, {
        method: 'POST',
      });
      if (editingHistoryId === historyId) {
        setEditingHistoryId('');
      }
      setHistoryMessage('Historia clinica firmada y bloqueada correctamente.');
      await loadClinicalHistories(historyPatientId);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      setHistoryMessage(
        error instanceof Error ? error.message : 'No se pudo firmar la historia',
      );
    } finally {
      setHistorySigningId('');
    }
  };

  const handleUnlockHistory = async (historyId: string) => {
    if (currentUserRole !== 'ADMIN') return;
    const confirmed = window.confirm(
      'Desbloquear una historia firmada permite su edicion. Deseas continuar?',
    );
    if (!confirmed) return;

    setHistoryUnlockingId(historyId);
    setHistoryMessage('');
    try {
      await apiRequest(`/clinical-histories/${historyId}/unlock`, token, {
        method: 'POST',
      });
      setHistoryMessage('Historia clinica desbloqueada correctamente.');
      await loadClinicalHistories(historyPatientId);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      setHistoryMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo desbloquear la historia',
      );
    } finally {
      setHistoryUnlockingId('');
    }
  };

  const handlePrintHistory = async (historyId: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setHistoryMessage(
        'No se pudo abrir la ventana de impresion. Habilita ventanas emergentes.',
      );
      return;
    }

    setHistoryPrintingId(historyId);
    setHistoryMessage('');
    try {
      const history = await apiRequest<ClinicalHistoryDetail>(
        `/clinical-histories/${historyId}`,
        token,
        { method: 'GET' },
      );
      const fallbackPatient = patients.find((patient) => patient.id === history.patientId);
      const html = buildClinicalHistoryPrintHtml(history, fallbackPatient);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 120);
    } catch (error) {
      printWindow.close();
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo generar la impresion de la historia clinica';
      setHistoryMessage(message);
    } finally {
      setHistoryPrintingId('');
    }
  };

  const handleSubmitHistory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!historyForm.patientId) {
      setHistoryMessage('Selecciona un paciente para registrar la historia.');
      return;
    }

    setHistorySaving(true);
    setHistoryMessage('');
    try {
      const patientId = historyForm.patientId;
      if (editingHistoryId) {
        await apiRequest(`/clinical-histories/${editingHistoryId}`, token, {
          method: 'PATCH',
          body: JSON.stringify(sanitizeClinicalUpdatePayload(historyForm)),
        });
        setHistoryMessage('Historia clinica actualizada correctamente.');
      } else {
        await apiRequest('/clinical-histories', token, {
          method: 'POST',
          body: JSON.stringify(sanitizeClinicalPayload(historyForm)),
        });
        setHistoryMessage('Historia clinica creada correctamente.');
      }

      resetClinicalForm(patientId);
      await loadClinicalHistories(historyForm.patientId);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        onUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la historia clinica';
      setHistoryMessage(message);
    } finally {
      setHistorySaving(false);
    }
  };

  const renderClinicalFields = (
    title: string,
    fields: ClinicalField[],
    columns: FieldColumns = 'three',
  ) => (
    <section className="section-card">
      <h3>{title}</h3>
      <div className={`field-grid ${columns}`}>
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.multiline ? (
              <textarea
                rows={3}
                value={historyForm[field.key]}
                onChange={(event) =>
                  updateHistoryField(field.key, event.target.value)
                }
                disabled={!canCreateClinical || historySaving}
              />
            ) : (
              <input
                value={historyForm[field.key]}
                onChange={(event) =>
                  updateHistoryField(field.key, event.target.value)
                }
                disabled={!canCreateClinical || historySaving}
              />
            )}
          </label>
        ))}
      </div>
    </section>
  );

  return (
    <section className="history-grid">
      <article className="panel history-form-panel">
        <div className="panel-head">
          <h2>{editingHistoryId ? 'Editar historia clinica' : 'Nueva historia clinica'}</h2>
          <div className="inline history-inline-actions">
            {editingHistoryId ? (
              <button
                type="button"
                className="ghost"
                onClick={() => resetClinicalForm(historyPatientId)}
                disabled={historySaving || historyLoadingDetail}
              >
                Cancelar edicion
              </button>
            ) : null}
            {!canCreateClinical ? (
              <span className="warn">Tu rol solo puede consultar</span>
            ) : null}
          </div>
        </div>

        <form className="stack" onSubmit={handleSubmitHistory}>
          <div className="field-grid two">
            <label>
              Paciente
              <select
                value={historyForm.patientId}
                onChange={(event) =>
                  handleClinicalPatientChange(event.target.value)
                }
                disabled={historySaving || Boolean(editingHistoryId)}
                required
              >
                <option value="">Selecciona un paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.firstName} {patient.lastName} - {patient.documentNumber}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha de visita
              <input
                type="date"
                value={historyForm.visitDate}
                onChange={(event) =>
                  updateHistoryField('visitDate', event.target.value)
                }
                disabled={!canCreateClinical || historySaving}
              />
            </label>
          </div>

          <section className="section-card patient-meta">
            <h3>Datos del paciente (formato historia)</h3>
            <div className="field-grid three">
              <label>
                Nombre
                <input
                  value={
                    selectedPatient
                      ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                      : ''
                  }
                  readOnly
                />
              </label>
              <label>
                Cedula
                <input value={selectedPatient?.documentNumber ?? ''} readOnly />
              </label>
              <label>
                Telefono
                <input value={selectedPatient?.phone ?? ''} readOnly />
              </label>
              <label>
                Ocupacion
                <input value={selectedPatient?.occupation ?? ''} readOnly />
              </label>
              <label>
                Fecha de nacimiento
                <input value={formatAsDate(selectedPatient?.birthDate)} readOnly />
              </label>
              <label>
                Edad
                <input value={getAgeFromBirthDate(selectedPatient?.birthDate)} readOnly />
              </label>
            </div>
          </section>

          <section className="section-card import-docx-card">
            <h3>Importar desde DOCX (plantilla)</h3>
            <p className="hint">
              Sube un archivo .docx con la plantilla de historia clinica para autocompletar
              el formulario.
            </p>
            <div className="field-grid two">
              <label>
                Archivo DOCX
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleImportFileChange}
                  disabled={!canCreateClinical || historySaving || historyLoadingDetail}
                />
              </label>
              <div className="import-docx-actions">
                <button
                  type="button"
                  onClick={() => void handleImportDocxPreview()}
                  disabled={
                    !canCreateClinical ||
                    !importFile ||
                    importingDocx ||
                    historySaving ||
                    historyLoadingDetail
                  }
                >
                  {importingDocx ? 'Analizando DOCX...' : 'Analizar DOCX'}
                </button>
                <small className="hint">
                  El archivo no se guarda automaticamente. Revisa y luego guarda la historia.
                </small>
              </div>
            </div>

            {importMessage ? <p className="hint">{importMessage}</p> : null}

            {importPreview ? (
              <div className="import-preview">
                <p>
                  <strong>Archivo:</strong> {importPreview.sourceFileName}
                </p>
                <p>
                  <strong>Lineas detectadas:</strong> {importPreview.rawLineCount}
                </p>
                <p>
                  <strong>Paciente detectado:</strong>{' '}
                  {importPreview.extractedPatient.name ?? 'No detectado'}
                </p>
                <p>
                  <strong>Documento detectado:</strong>{' '}
                  {importPreview.extractedPatient.documentNumber ?? 'No detectado'}
                </p>
                <p>
                  <strong>Calidad estimada:</strong>{' '}
                  {typeof importPreview.qualityScore === 'number'
                    ? `${importPreview.qualityScore}%`
                    : 'N/D'}
                </p>
                {hasImportedDocumentMismatch ? (
                  <p className="status warning">
                    El documento del archivo no coincide con el paciente seleccionado.
                    Verifica antes de guardar.
                  </p>
                ) : null}
                {importPreview.requiredReady === false ? (
                  <p className="status warning">
                    Faltan campos clinicos obligatorios (motivo, diagnostico o
                    disposicion).
                  </p>
                ) : null}
                {importPreview.qualityWarnings?.length ? (
                  <ul className="import-warning-list">
                    {importPreview.qualityWarnings.map((warning, index) => (
                      <li key={`q-${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {importPreview.warnings.length ? (
                  <ul className="import-warning-list">
                    {importPreview.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="status success">
                    Importacion limpia. Campos autocompletados sin advertencias.
                  </p>
                )}
              </div>
            ) : null}

            <div className="import-batch-divider" />

            <h4>Importacion masiva (lote DOCX)</h4>
            <div className="field-grid two">
              <label>
                Archivos DOCX (multiples)
                <input
                  type="file"
                  multiple
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleBatchImportFilesChange}
                  disabled={!canCreateClinical || historySaving || historyLoadingDetail}
                />
              </label>
              <div className="import-docx-actions">
                <button
                  type="button"
                  onClick={() => void handleBatchImportPreview()}
                  disabled={
                    !canCreateClinical ||
                    !batchImportFiles.length ||
                    batchImportLoading ||
                    historySaving ||
                    historyLoadingDetail
                  }
                >
                  {batchImportLoading ? 'Analizando lote...' : 'Analizar lote'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void handleBatchImportCreate()}
                  disabled={
                    !batchImportPreview ||
                    batchImporting ||
                    !batchImportPreview.readyToImport
                  }
                >
                  {batchImporting ? 'Importando lote...' : 'Importar lote'}
                </button>
              </div>
            </div>

            {batchImportMessage ? <p className="hint">{batchImportMessage}</p> : null}

            {batchImportPreview ? (
              <div className="import-preview">
                <p>
                  <strong>Resumen lote:</strong> {batchImportPreview.totalFiles} archivo(s) ·
                  Pacientes detectados: {batchImportPreview.matchedPatients} · Listos para
                  importar: {batchImportPreview.readyToImport}
                </p>
                <ul className="import-batch-list">
                  {batchImportPreview.items.map((item, index) => (
                    <li key={`${item.sourceFileName}-${index}`}>
                      <strong>{item.sourceFileName}</strong> · Calidad {item.qualityScore}%
                      {' · '}
                      {item.matchedPatient
                        ? `${item.matchedPatient.firstName} ${item.matchedPatient.lastName} (${item.matchedPatient.documentNumber})`
                        : 'Sin paciente detectado'}
                      {item.requiredReady ? '' : ' · Faltan campos obligatorios'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {renderClinicalFields('Datos generales', generalFields, 'two')}
          {renderClinicalFields('Lensometria', lensometriaFields)}
          {renderClinicalFields('Agudeza visual', agudezaVisualFields)}
          {renderClinicalFields('Queratometria y estado motor', queratoMotorFields)}
          {renderClinicalFields('Refraccion subjetiva', refraccionFields)}
          {renderClinicalFields('Correccion optica final', correccionFinalFields)}
          {renderClinicalFields('Segmento posterior', segmentoPosteriorFields, 'two')}
          {renderClinicalFields('Diagnostico y conducta', cierreFields, 'two')}

          {historyMessage ? <p className="hint">{historyMessage}</p> : null}
          {historyLoadingDetail ? <p className="hint">Cargando historia clinica...</p> : null}

          <button
            type="submit"
            disabled={
              !canCreateClinical ||
              historySaving ||
              historyLoadingDetail ||
              !historyForm.patientId
            }
          >
            {historySaving
              ? editingHistoryId
                ? 'Guardando cambios...'
                : 'Guardando...'
              : editingHistoryId
                ? 'Guardar cambios'
                : 'Guardar historia clinica'}
          </button>
        </form>
      </article>

      <article className="panel history-list-panel">
        <div className="panel-head">
          <h2>Historias registradas</h2>
          <button
            type="button"
            onClick={() =>
              historyPatientId && void loadClinicalHistories(historyPatientId)
            }
            disabled={!historyPatientId}
          >
            Actualizar
          </button>
        </div>

        <label>
          Ver historias de
          <select
            value={historyPatientId}
            onChange={(event) =>
              handleClinicalPatientChange(event.target.value)
            }
          >
            <option value="">Selecciona un paciente</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.firstName} {patient.lastName} - {patient.documentNumber}
              </option>
            ))}
          </select>
        </label>

        {historiesError ? <p className="error">{historiesError}</p> : null}
        {historiesLoading ? <p className="hint">Cargando historias clinicas...</p> : null}

        <ul className="history-list">
          {histories.map((history) => (
            <li key={history.id} className="history-item">
              <div className="history-head">
                <strong>{new Date(history.visitDate).toLocaleDateString()}</strong>
                <span className="pill">{history.diagnostico || 'Sin diagnostico'}</span>
              </div>
              <div className="inline history-inline-actions">
                <span
                  className={`sale-status ${
                    history.status === 'SIGNED' ? 'active' : 'voided'
                  }`}
                >
                  {history.status === 'SIGNED' ? 'FIRMADA' : 'BORRADOR'}
                </span>
                <small>
                  Calidad:{' '}
                  {typeof history.completionScore === 'number'
                    ? `${history.completionScore}%`
                    : 'N/D'}
                </small>
              </div>
              {history.completionWarnings ? (
                <small className="warn">{history.completionWarnings}</small>
              ) : null}
              <p>
                {history.motivoConsulta ||
                  history.disposicion ||
                  'Sin resumen registrado.'}
              </p>
              {canCreateClinical ? (
                <div className="history-item-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void handleEditHistory(history.id)}
                    disabled={
                      history.status === 'SIGNED' ||
                      historyLoadingDetail ||
                      historySaving
                    }
                  >
                    {editingHistoryId === history.id ? 'Editando' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => void handleDeleteHistory(history.id)}
                    disabled={
                      history.status === 'SIGNED' ||
                      historyLoadingDetail ||
                      historySaving ||
                      historyDeletingId === history.id
                    }
                  >
                    {historyDeletingId === history.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void handleSignHistory(history.id)}
                    disabled={
                      history.status === 'SIGNED' ||
                      historySigningId === history.id ||
                      historySaving ||
                      historyLoadingDetail
                    }
                  >
                    {historySigningId === history.id ? 'Firmando...' : 'Firmar'}
                  </button>
                  {currentUserRole === 'ADMIN' ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void handleUnlockHistory(history.id)}
                      disabled={
                        history.status !== 'SIGNED' ||
                        historyUnlockingId === history.id ||
                        historySaving ||
                        historyLoadingDetail
                      }
                    >
                      {historyUnlockingId === history.id
                        ? 'Desbloqueando...'
                        : 'Desbloquear'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="ghost"
                onClick={() => void handlePrintHistory(history.id)}
                disabled={historyPrintingId === history.id}
              >
                {historyPrintingId === history.id ? 'Generando...' : 'Imprimir'}
              </button>
              <small>
                Registro: {new Date(history.createdAt).toLocaleString()}
                {history.status === 'SIGNED' && history.signedAt
                  ? ` · Firmada: ${new Date(history.signedAt).toLocaleString()}`
                  : ''}
              </small>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

