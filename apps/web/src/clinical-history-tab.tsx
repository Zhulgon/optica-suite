import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

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
  motivoConsulta?: string | null;
  diagnostico?: string | null;
  disposicion?: string | null;
}

interface ClinicalHistoryApiError {
  message?: string | string[];
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
  Partial<Record<ClinicalFieldKey, string | null>>;

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
  if (!headers.has('Content-Type') && options.body) {
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

export function ClinicalHistoryTab({
  token,
  patients,
  canCreateClinical,
  onUnauthorized,
}: {
  token: string;
  patients: Patient[];
  canCreateClinical: boolean;
  onUnauthorized: () => void;
}) {
  const [historyPatientId, setHistoryPatientId] = useState('');
  const [historyForm, setHistoryForm] = useState<ClinicalHistoryForm>(
    emptyClinicalHistoryForm,
  );
  const [historySaving, setHistorySaving] = useState(false);
  const [historyLoadingDetail, setHistoryLoadingDetail] = useState(false);
  const [historyDeletingId, setHistoryDeletingId] = useState('');
  const [editingHistoryId, setEditingHistoryId] = useState('');
  const [historyMessage, setHistoryMessage] = useState('');
  const [histories, setHistories] = useState<ClinicalHistory[]>([]);
  const [historiesLoading, setHistoriesLoading] = useState(false);
  const [historiesError, setHistoriesError] = useState('');
  const selectedPatient = patients.find((p) => p.id === historyForm.patientId);

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

  const handleClinicalPatientChange = (patientId: string) => {
    setEditingHistoryId('');
    setHistoryMessage('');
    setHistoryPatientId(patientId);
    setHistoryForm({
      ...emptyClinicalHistoryForm,
      patientId,
      visitDate: todayIsoDate,
    });
  };

  const resetClinicalForm = (patientId: string) => {
    setEditingHistoryId('');
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
                    disabled={historyLoadingDetail || historySaving}
                  >
                    {editingHistoryId === history.id ? 'Editando' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => void handleDeleteHistory(history.id)}
                    disabled={
                      historyLoadingDetail ||
                      historySaving ||
                      historyDeletingId === history.id
                    }
                  >
                    {historyDeletingId === history.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              ) : null}
              <small>
                Registro: {new Date(history.createdAt).toLocaleString()}
              </small>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

