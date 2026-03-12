import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import { ClinicalHistoryTab } from './clinical-history-tab';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'optica_token';
const USER_KEY = 'optica_user';

type Role = 'ADMIN' | 'ASESOR' | 'OPTOMETRA';

type Tab = 'patients' | 'sales' | 'clinical' | 'users';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface ApiListResponse<T> {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  count: number;
  data: T[];
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  documentNumber: string;
  phone?: string;
  email?: string;
  occupation?: string;
}

interface Frame {
  id: string;
  codigo: number;
  referencia: string;
  precioVenta: number;
  stockActual: number;
}

interface Sale {
  id: string;
  total: number;
  paymentMethod: string;
  notes?: string;
  createdAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  patient?: {
    firstName: string;
    lastName: string;
  } | null;
  items: Array<{
    id: string;
    quantity: number;
    subtotal: number;
    frame: {
      codigo: number;
      referencia: string;
    };
  }>;
}

interface SaleItemDraft {
  frameId: string;
  quantity: number;
}

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiErrorBody {
  message?: string | string[];
}

const emptyPatientForm = {
  firstName: '',
  lastName: '',
  documentNumber: '',
  phone: '',
  email: '',
  occupation: '',
};

const emptyUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'ASESOR' as Role,
};

function formatRoleLabel(role?: string): string {
  if (!role) return 'Sin rol';
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'ASESOR':
      return 'Asesor';
    case 'OPTOMETRA':
      return 'Optometra';
    default:
      return role;
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson
    ? ((await response.json()) as ApiErrorBody | T)
    : undefined;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('__UNAUTHORIZED__');
    }
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = payload.message;
      if (Array.isArray(message)) {
        throw new Error(message.join(' | '));
      }
      if (typeof message === 'string') {
        throw new Error(message);
      }
    }
    throw new Error(`Error ${response.status}`);
  }

  return payload as T;
}

function getSavedUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(getSavedUser());
  const [activeTab, setActiveTab] = useState<Tab>('patients');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState('');

  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [patientSaving, setPatientSaving] = useState(false);
  const [patientDeletingId, setPatientDeletingId] = useState('');
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [patientMessage, setPatientMessage] = useState('');

  const [frames, setFrames] = useState<Frame[]>([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [framesError, setFramesError] = useState('');

  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState('');

  const [salePatientId, setSalePatientId] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState('CASH');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleItems, setSaleItems] = useState<SaleItemDraft[]>([
    { frameId: '', quantity: 1 },
  ]);
  const [saleSaving, setSaleSaving] = useState(false);
  const [saleMessage, setSaleMessage] = useState('');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [userSaving, setUserSaving] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [userStatusSavingId, setUserStatusSavingId] = useState('');

  const canCreateSale =
    user?.role === 'ADMIN' || user?.role === 'ASESOR' || user?.role === 'OPTOMETRA';
  const canCreatePatient =
    user?.role === 'ADMIN' || user?.role === 'ASESOR' || user?.role === 'OPTOMETRA';
  const canDeletePatient = user?.role === 'ADMIN';
  const canCreateClinical =
    user?.role === 'ADMIN' || user?.role === 'OPTOMETRA';
  const canManageUsers = user?.role === 'ADMIN';

  const frameMap = useMemo(() => {
    return new Map(frames.map((frame) => [frame.id, frame]));
  }, [frames]);

  const saleTotal = useMemo(() => {
    return saleItems.reduce((sum, item) => {
      const frame = frameMap.get(item.frameId);
      if (!frame) return sum;
      return sum + frame.precioVenta * item.quantity;
    }, 0);
  }, [frameMap, saleItems]);

  const resetSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setSales([]);
    setPatients([]);
    setFrames([]);
    setUsers([]);
  }, []);

  const handleUnauthorized = useCallback(() => {
    resetSession();
    setAuthError('Sesion expirada. Inicia sesion nuevamente.');
  }, [resetSession]);

  const loadPatients = useCallback(
    async (query = '') => {
      if (!token) return;
      setPatientsLoading(true);
      setPatientsError('');
      try {
        const params = new URLSearchParams({ page: '1', limit: '40' });
        const q = query.trim();
        if (q) {
          params.set('q', q);
        }
        const response = await apiRequest<ApiListResponse<Patient>>(
          `/patients?${params.toString()}`,
          { method: 'GET' },
          token,
        );
        setPatients(response.data);
      } catch (error) {
        if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
          handleUnauthorized();
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Error al cargar pacientes';
        setPatientsError(message);
      } finally {
        setPatientsLoading(false);
      }
    },
    [token, handleUnauthorized],
  );

  const loadFrames = useCallback(async () => {
    if (!token) return;
    setFramesLoading(true);
    setFramesError('');
    try {
      const response = await apiRequest<ApiListResponse<Frame>>(
        '/frames?inStock=true&limit=200',
        { method: 'GET' },
        token,
      );
      setFrames(response.data);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Error al cargar monturas';
      setFramesError(message);
    } finally {
      setFramesLoading(false);
    }
  }, [token, handleUnauthorized]);

  const loadSales = useCallback(async () => {
    if (!token || !canCreateSale) return;
    setSalesLoading(true);
    setSalesError('');
    try {
      const response = await apiRequest<Sale[]>(
        '/sales',
        { method: 'GET' },
        token,
      );
      setSales(response);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Error al cargar ventas';
      setSalesError(message);
    } finally {
      setSalesLoading(false);
    }
  }, [token, canCreateSale, handleUnauthorized]);

  const loadUsers = useCallback(async () => {
    if (!token || !canManageUsers) return;
    setUsersLoading(true);
    setUsersError('');
    try {
      const response = await apiRequest<ManagedUser[]>(
        '/users',
        { method: 'GET' },
        token,
      );
      setUsers(response);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Error al cargar usuarios';
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  }, [token, canManageUsers, handleUnauthorized]);

  useEffect(() => {
    if (!token) return;
    void loadPatients('');
    void loadFrames();
    if (canCreateSale) {
      void loadSales();
    }
    if (canManageUsers) {
      void loadUsers();
    }
  }, [token, canCreateSale, canManageUsers, loadPatients, loadFrames, loadSales, loadUsers]);

  useEffect(() => {
    if (!canManageUsers && activeTab === 'users') {
      setActiveTab('patients');
    }
  }, [canManageUsers, activeTab]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPassword = password.trim();
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPassword,
        }),
      });
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      setToken(response.accessToken);
      setUser(response.user);
      setPassword('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message === '__UNAUTHORIZED__'
            ? 'Credenciales invalidas. Verifica correo y contraseña.'
            : error.message
          : 'No se pudo iniciar sesion';
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const resetPatientEditor = () => {
    setEditingPatientId(null);
    setPatientForm(emptyPatientForm);
  };

  const handleEditPatient = (patient: Patient) => {
    if (!canCreatePatient) return;
    setEditingPatientId(patient.id);
    setPatientMessage('');
    setPatientForm({
      firstName: patient.firstName,
      lastName: patient.lastName,
      documentNumber: patient.documentNumber,
      phone: patient.phone ?? '',
      email: patient.email ?? '',
      occupation: patient.occupation ?? '',
    });
  };

  const handleDeletePatient = async (patient: Patient) => {
    if (!token || !canDeletePatient) return;
    const confirmed = window.confirm(
      `Se eliminara el paciente ${patient.firstName} ${patient.lastName}. Deseas continuar?`,
    );
    if (!confirmed) return;

    setPatientDeletingId(patient.id);
    setPatientMessage('');
    try {
      await apiRequest(
        `/patients/${patient.id}`,
        { method: 'DELETE' },
        token,
      );
      if (editingPatientId === patient.id) {
        resetPatientEditor();
      }
      setPatientMessage('Paciente eliminado correctamente.');
      await loadPatients(patientQuery);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo eliminar paciente';
      setPatientMessage(message);
    } finally {
      setPatientDeletingId('');
    }
  };

  const handleCreatePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    setPatientSaving(true);
    setPatientMessage('');

    const payload: Record<string, string> = {
      firstName: patientForm.firstName.trim(),
      lastName: patientForm.lastName.trim(),
      documentNumber: patientForm.documentNumber.trim(),
      phone: patientForm.phone.trim(),
      email: patientForm.email.trim(),
      occupation: patientForm.occupation.trim(),
    };

    if (!payload.phone) delete payload.phone;
    if (!payload.email) delete payload.email;
    if (!payload.occupation) delete payload.occupation;

    try {
      if (editingPatientId) {
        await apiRequest(
          `/patients/${editingPatientId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
          token,
        );
        setPatientMessage('Paciente actualizado correctamente.');
      } else {
        await apiRequest(
          '/patients',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          token,
        );
        setPatientMessage('Paciente creado correctamente.');
      }
      resetPatientEditor();
      void loadPatients(patientQuery);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo crear paciente';
      setPatientMessage(message);
    } finally {
      setPatientSaving(false);
    }
  };

  const updateSaleItem = (
    index: number,
    field: keyof SaleItemDraft,
    value: string,
  ) => {
    setSaleItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field === 'quantity') {
          const next = Number(value);
          return {
            ...item,
            quantity: Number.isFinite(next) ? Math.max(1, next) : 1,
          };
        }
        return { ...item, frameId: value };
      }),
    );
  };

  const addSaleItem = () => {
    setSaleItems((current) => [...current, { frameId: '', quantity: 1 }]);
  };

  const removeSaleItem = (index: number) => {
    setSaleItems((current) => {
      if (current.length === 1) return current;
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleCreateSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    const normalizedItems = saleItems
      .filter((item) => item.frameId)
      .map((item) => ({ frameId: item.frameId, quantity: item.quantity }));

    if (!normalizedItems.length) {
      setSaleMessage('Agrega al menos una montura para registrar la venta.');
      return;
    }

    setSaleSaving(true);
    setSaleMessage('');

    try {
      await apiRequest(
        '/sales',
        {
          method: 'POST',
          body: JSON.stringify({
            patientId: salePatientId || undefined,
            paymentMethod: salePaymentMethod,
            notes: saleNotes.trim() || undefined,
            items: normalizedItems,
          }),
        },
        token,
      );

      setSaleItems([{ frameId: '', quantity: 1 }]);
      setSaleNotes('');
      setSalePatientId('');
      setSalePaymentMethod('CASH');
      setSaleMessage('Venta registrada correctamente.');

      await Promise.all([loadSales(), loadFrames()]);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo registrar la venta';
      setSaleMessage(message);
    } finally {
      setSaleSaving(false);
    }
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !canManageUsers) return;

    setUserSaving(true);
    setUserMessage('');
    try {
      await apiRequest<ManagedUser>(
        '/users/admin',
        {
          method: 'POST',
          body: JSON.stringify({
            name: userForm.name.trim(),
            email: userForm.email.trim().toLowerCase(),
            password: userForm.password,
            role: userForm.role,
          }),
        },
        token,
      );
      setUserMessage('Usuario creado correctamente.');
      setUserForm(emptyUserForm);
      await loadUsers();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo crear usuario';
      setUserMessage(message);
    } finally {
      setUserSaving(false);
    }
  };

  const handleToggleUserStatus = async (target: ManagedUser) => {
    if (!token || !canManageUsers) return;
    setUserStatusSavingId(target.id);
    setUserMessage('');
    try {
      await apiRequest<ManagedUser>(
        `/users/${target.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !target.isActive }),
        },
        token,
      );
      setUserMessage(
        !target.isActive
          ? 'Usuario activado correctamente.'
          : 'Usuario desactivado correctamente.',
      );
      await loadUsers();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo actualizar usuario';
      setUserMessage(message);
    } finally {
      setUserStatusSavingId('');
    }
  };

  if (!token || !user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <p className="chip">Optica Suite</p>
          <h1>Iniciar sesión</h1>
          <p className="subtitle">
            Usa tus credenciales para entrar al panel comercial.
          </p>

          <form className="stack" onSubmit={handleLogin}>
            <label>
              Correo
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="asesor@optica.com"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </label>

            {authError ? <p className="error">{authError}</p> : null}

            <button type="submit" disabled={authLoading}>
              {authLoading ? 'Ingresando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="chip">Optica Suite</p>
          <h1>Panel operativo</h1>
          <p className="subtitle">
            {user.name} · {user.role}
          </p>
        </div>
        <button type="button" className="ghost" onClick={resetSession}>
          Cerrar sesión
        </button>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={activeTab === 'patients' ? 'active' : ''}
          onClick={() => setActiveTab('patients')}
        >
          Pacientes
        </button>
        <button
          type="button"
          className={activeTab === 'sales' ? 'active' : ''}
          onClick={() => setActiveTab('sales')}
        >
          Ventas
        </button>
        <button
          type="button"
          className={activeTab === 'clinical' ? 'active' : ''}
          onClick={() => setActiveTab('clinical')}
        >
          Historias clinicas
        </button>
        {canManageUsers ? (
          <button
            type="button"
            className={activeTab === 'users' ? 'active' : ''}
            onClick={() => setActiveTab('users')}
          >
            Usuarios
          </button>
        ) : null}
      </nav>

      {activeTab === 'patients' ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>{editingPatientId ? 'Editar paciente' : 'Nuevo paciente'}</h2>
              <div className="inline patient-inline-actions">
                {editingPatientId ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={resetPatientEditor}
                    disabled={patientSaving}
                  >
                    Cancelar edicion
                  </button>
                ) : null}
                {!canCreatePatient ? (
                  <span className="warn">Solo lectura para tu rol</span>
                ) : null}
              </div>
            </div>

            <form className="stack" onSubmit={handleCreatePatient}>
              <label>
                Nombre
                <input
                  value={patientForm.firstName}
                  onChange={(event) =>
                    setPatientForm((state) => ({
                      ...state,
                      firstName: event.target.value,
                    }))
                  }
                  required
                  disabled={!canCreatePatient || patientSaving}
                />
              </label>
              <label>
                Apellido
                <input
                  value={patientForm.lastName}
                  onChange={(event) =>
                    setPatientForm((state) => ({
                      ...state,
                      lastName: event.target.value,
                    }))
                  }
                  required
                  disabled={!canCreatePatient || patientSaving}
                />
              </label>
              <label>
                Documento
                <input
                  value={patientForm.documentNumber}
                  onChange={(event) =>
                    setPatientForm((state) => ({
                      ...state,
                      documentNumber: event.target.value,
                    }))
                  }
                  required
                  disabled={!canCreatePatient || patientSaving}
                />
              </label>
              <label>
                Teléfono
                <input
                  value={patientForm.phone}
                  onChange={(event) =>
                    setPatientForm((state) => ({
                      ...state,
                      phone: event.target.value,
                    }))
                  }
                  disabled={!canCreatePatient || patientSaving}
                />
              </label>
              <label>
                Correo
                <input
                  type="email"
                  value={patientForm.email}
                  onChange={(event) =>
                    setPatientForm((state) => ({
                      ...state,
                      email: event.target.value,
                    }))
                  }
                  disabled={!canCreatePatient || patientSaving}
                />
              </label>
              <label>
                Ocupación
                <input
                  value={patientForm.occupation}
                  onChange={(event) =>
                    setPatientForm((state) => ({
                      ...state,
                      occupation: event.target.value,
                    }))
                  }
                  disabled={!canCreatePatient || patientSaving}
                />
              </label>

              {patientMessage ? <p className="hint">{patientMessage}</p> : null}

              <button type="submit" disabled={!canCreatePatient || patientSaving}>
                {patientSaving
                  ? editingPatientId
                    ? 'Actualizando...'
                    : 'Guardando...'
                  : editingPatientId
                    ? 'Guardar cambios'
                    : 'Guardar paciente'}
              </button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Listado de pacientes</h2>
              <div className="inline">
                <input
                  value={patientQuery}
                  onChange={(event) => setPatientQuery(event.target.value)}
                  placeholder="Buscar por nombre o documento"
                />
                <button type="button" onClick={() => void loadPatients(patientQuery)}>
                  Buscar
                </button>
              </div>
            </div>

            {patientsError ? <p className="error">{patientsError}</p> : null}
            {patientsLoading ? <p className="hint">Cargando pacientes...</p> : null}

            <ul className="list">
              {patients.map((patient) => (
                <li key={patient.id}>
                  <div>
                    <strong>
                      {patient.firstName} {patient.lastName}
                    </strong>
                    <p>{patient.documentNumber}</p>
                  </div>
                  <div className="patient-item-right">
                    <small>{patient.phone || patient.email || 'Sin contacto'}</small>
                    {canCreatePatient ? (
                      <div className="patient-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => handleEditPatient(patient)}
                          disabled={patientSaving || patientDeletingId === patient.id}
                        >
                          {editingPatientId === patient.id ? 'Editando' : 'Editar'}
                        </button>
                        {canDeletePatient ? (
                          <button
                            type="button"
                            className="ghost danger"
                            onClick={() => void handleDeletePatient(patient)}
                            disabled={patientSaving || patientDeletingId === patient.id}
                          >
                            {patientDeletingId === patient.id ? 'Eliminando...' : 'Eliminar'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : activeTab === 'sales' ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Nueva venta</h2>
              {!canCreateSale ? (
                <span className="warn">Tu rol no puede registrar ventas</span>
              ) : null}
            </div>

            <form className="stack" onSubmit={handleCreateSale}>
              <label>
                Paciente (opcional)
                <select
                  value={salePatientId}
                  onChange={(event) => setSalePatientId(event.target.value)}
                  disabled={!canCreateSale || saleSaving}
                >
                  <option value="">Sin paciente</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.firstName} {patient.lastName} · {patient.documentNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Método de pago
                <select
                  value={salePaymentMethod}
                  onChange={(event) => setSalePaymentMethod(event.target.value)}
                  disabled={!canCreateSale || saleSaving}
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="MIXED">Mixto</option>
                </select>
              </label>

              <label>
                Notas
                <textarea
                  value={saleNotes}
                  onChange={(event) => setSaleNotes(event.target.value)}
                  rows={3}
                  disabled={!canCreateSale || saleSaving}
                />
              </label>

              <div className="sale-items">
                <h3>Monturas</h3>
                {framesError ? <p className="error">{framesError}</p> : null}
                {framesLoading ? <p className="hint">Cargando monturas...</p> : null}

                {saleItems.map((item, index) => (
                  <div className="sale-row" key={`item-${index}`}>
                    <select
                      value={item.frameId}
                      onChange={(event) =>
                        updateSaleItem(index, 'frameId', event.target.value)
                      }
                      disabled={!canCreateSale || saleSaving}
                    >
                      <option value="">Seleccionar montura</option>
                      {frames.map((frame) => (
                        <option key={frame.id} value={frame.id}>
                          #{frame.codigo} {frame.referencia} · ${frame.precioVenta.toFixed(2)} · stock {frame.stockActual}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        updateSaleItem(index, 'quantity', event.target.value)
                      }
                      disabled={!canCreateSale || saleSaving}
                    />

                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => removeSaleItem(index)}
                      disabled={!canCreateSale || saleSaving}
                    >
                      Quitar
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="ghost"
                  onClick={addSaleItem}
                  disabled={!canCreateSale || saleSaving}
                >
                  + Agregar montura
                </button>
              </div>

              <p className="hint">Total estimado: ${saleTotal.toFixed(2)}</p>
              {saleMessage ? <p className="hint">{saleMessage}</p> : null}

              <button type="submit" disabled={!canCreateSale || saleSaving}>
                {saleSaving ? 'Registrando...' : 'Registrar venta'}
              </button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Ventas recientes</h2>
              <button type="button" onClick={() => void loadSales()} disabled={!canCreateSale}>
                Actualizar
              </button>
            </div>

            {salesError ? <p className="error">{salesError}</p> : null}
            {salesLoading ? <p className="hint">Cargando ventas...</p> : null}

            <ul className="list">
              {sales.map((sale) => (
                <li key={sale.id}>
                  <div>
                    <strong>${sale.total.toFixed(2)}</strong>
                    <p>
                      {sale.patient
                        ? `${sale.patient.firstName} ${sale.patient.lastName}`
                        : 'Sin paciente'}
                    </p>
                  </div>
                  <div className="sale-item-right">
                    <small>
                      {sale.paymentMethod} · {new Date(sale.createdAt).toLocaleString()}
                    </small>
                    <small>
                      Registrada por:{' '}
                      {sale.createdBy
                        ? `${sale.createdBy.name} (${formatRoleLabel(sale.createdBy.role)})`
                        : 'Usuario no disponible'}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : activeTab === 'clinical' ? (
        <ClinicalHistoryTab
          token={token}
          patients={patients}
          canCreateClinical={Boolean(canCreateClinical)}
          onUnauthorized={handleUnauthorized}
        />
      ) : canManageUsers ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Nuevo usuario</h2>
              <span className="warn">Solo ADMIN</span>
            </div>

            <form className="stack" onSubmit={handleCreateUser}>
              <label>
                Nombre
                <input
                  value={userForm.name}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                  disabled={userSaving}
                />
              </label>
              <label>
                Correo
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                  disabled={userSaving}
                />
              </label>
              <label>
                Rol
                <select
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      role: event.target.value as Role,
                    }))
                  }
                  disabled={userSaving}
                >
                  <option value="ASESOR">Asesor</option>
                  <option value="OPTOMETRA">Optometra</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              <label>
                Contraseña temporal
                <input
                  type="password"
                  minLength={6}
                  value={userForm.password}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  required
                  disabled={userSaving}
                />
              </label>

              {userMessage ? <p className="hint">{userMessage}</p> : null}

              <button type="submit" disabled={userSaving}>
                {userSaving ? 'Guardando...' : 'Crear usuario'}
              </button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Usuarios</h2>
              <button type="button" onClick={() => void loadUsers()}>
                Actualizar
              </button>
            </div>

            {usersError ? <p className="error">{usersError}</p> : null}
            {usersLoading ? <p className="hint">Cargando usuarios...</p> : null}

            <ul className="list">
              {users.map((managedUser) => (
                <li key={managedUser.id}>
                  <div>
                    <strong>{managedUser.name}</strong>
                    <p>{managedUser.email}</p>
                  </div>
                  <div className="user-item-right">
                    <small>
                      {formatRoleLabel(managedUser.role)} ·{' '}
                      {managedUser.isActive ? 'Activo' : 'Inactivo'}
                    </small>
                    <div className="user-actions">
                      <button
                        type="button"
                        className={`ghost ${managedUser.isActive ? 'danger' : ''}`}
                        onClick={() => void handleToggleUserStatus(managedUser)}
                        disabled={
                          userStatusSavingId === managedUser.id ||
                          (managedUser.id === user.id && managedUser.isActive)
                        }
                        title={
                          managedUser.id === user.id && managedUser.isActive
                            ? 'No puedes desactivar tu propio usuario'
                            : ''
                        }
                      >
                        {userStatusSavingId === managedUser.id
                          ? 'Guardando...'
                          : managedUser.isActive
                            ? 'Desactivar'
                            : 'Activar'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}
    </main>
  );
}

export default App;


