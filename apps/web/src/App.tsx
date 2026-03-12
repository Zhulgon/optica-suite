import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import { ClinicalHistoryTab } from './clinical-history-tab';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'optica_token';
const REFRESH_TOKEN_KEY = 'optica_refresh_token';
const USER_KEY = 'optica_user';
const ACTIVE_TAB_KEY = 'optica_active_tab';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const INACTIVITY_WARNING_MS = 60 * 1000;
let refreshPromise: Promise<string | null> | null = null;

type Role = 'ADMIN' | 'ASESOR' | 'OPTOMETRA';

type Tab =
  | 'patients'
  | 'sales'
  | 'lab'
  | 'cash'
  | 'clinical'
  | 'sessions'
  | 'users'
  | 'audit'
  | 'reports';

const TAB_COPY: Record<Tab, { title: string; description: string }> = {
  patients: {
    title: 'Gestion de pacientes',
    description:
      'Registra, edita y consulta pacientes. Mantiene la base comercial limpia y actualizada.',
  },
  sales: {
    title: 'Flujo de ventas',
    description:
      'Registra ventas con trazabilidad de usuario, monturas y metodo de pago.',
  },
  lab: {
    title: 'Ordenes de laboratorio',
    description:
      'Controla ordenes de lentes por estado: pendiente, enviada, recibida y entregada.',
  },
  cash: {
    title: 'Cierre de caja',
    description:
      'Genera arqueos diarios por usuario y controla diferencias de efectivo.',
  },
  clinical: {
    title: 'Historias clinicas',
    description:
      'Documenta consulta optometrica completa y conserva historial por paciente.',
  },
  sessions: {
    title: 'Sesiones activas',
    description:
      'Consulta tus sesiones abiertas y revoca accesos especificos por seguridad.',
  },
  users: {
    title: 'Administracion de usuarios',
    description:
      'Crea usuarios, ajusta estado y controla seguridad de acceso por rol.',
  },
  audit: {
    title: 'Auditoria del sistema',
    description:
      'Consulta acciones sensibles para control interno y trazabilidad operativa.',
  },
  reports: {
    title: 'Reportes comerciales',
    description:
      'Analiza ventas, ticket promedio y desempeno por usuario o montura.',
  },
};

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface PasswordResetRequestResponse {
  success: boolean;
  message: string;
  debugToken?: string;
}

interface PasswordResetConfirmResponse {
  success: boolean;
  message: string;
}

interface ActiveSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  isCurrent: boolean;
}

interface SalesSummaryReport {
  range: {
    from: string;
    to: string;
  };
  totals: {
    salesCount: number;
    totalRevenue: number;
    averageTicket: number;
    totalItems: number;
    uniquePatients: number;
  };
  byPaymentMethod: Array<{
    paymentMethod: string;
    salesCount: number;
    total: number;
  }>;
  byUser: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    salesCount: number;
    total: number;
  }>;
  byRole: Array<{
    role: string;
    salesCount: number;
    total: number;
  }>;
  topFrames: Array<{
    frameId: string;
    codigo: number;
    referencia: string;
    quantity: number;
    revenue: number;
  }>;
  dailySeries: Array<{
    date: string;
    salesCount: number;
    total: number;
  }>;
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
  status: 'ACTIVE' | 'VOIDED';
  notes?: string;
  voidReason?: string | null;
  voidedAt?: string | null;
  voidedBy?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
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

type LabOrderStatus =
  | 'PENDING'
  | 'SENT_TO_LAB'
  | 'RECEIVED'
  | 'DELIVERED'
  | 'CANCELLED';

interface LabOrder {
  id: string;
  patientId?: string | null;
  saleId?: string | null;
  status: LabOrderStatus;
  reference: string;
  lensDetails?: string | null;
  labName?: string | null;
  responsible?: string | null;
  promisedDate?: string | null;
  notes?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
  } | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  updatedBy?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
}

interface CashClosure {
  id: string;
  userId: string;
  closedById: string;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  mixedSales: number;
  expectedCash: number;
  declaredCash: number;
  difference: number;
  notes?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  closedBy?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
}

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuditLog {
  id: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: Role | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  payloadJson?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  actorUser?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
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

const emptyLabOrderForm = {
  patientId: '',
  saleId: '',
  reference: '',
  lensDetails: '',
  labName: '',
  responsible: '',
  promisedDate: '',
  notes: '',
};

function isTab(value: string | null): value is Tab {
  return (
    value === 'patients' ||
    value === 'sales' ||
    value === 'lab' ||
    value === 'cash' ||
    value === 'clinical' ||
    value === 'sessions' ||
    value === 'users' ||
    value === 'audit' ||
    value === 'reports'
  );
}

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
  const parseErrorFromPayload = (payload: ApiErrorBody | T | undefined) => {
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = payload.message;
      if (Array.isArray(message)) {
        return message.join(' | ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return null;
  };

  const runRefreshTokenFlow = async (): Promise<string | null> => {
    const currentRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!currentRefreshToken) return null;

    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });

    if (!refreshResponse.ok) return null;

    const contentType = refreshResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const payload = (await refreshResponse.json()) as LoginResponse;
    if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
      return null;
    }

    localStorage.setItem(TOKEN_KEY, payload.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    return payload.accessToken;
  };

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const latestToken = localStorage.getItem(TOKEN_KEY) || token;
  if (latestToken) {
    headers.set('Authorization', `Bearer ${latestToken}`);
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
    if (response.status === 401 && latestToken && path !== '/auth/refresh') {
      if (!refreshPromise) {
        refreshPromise = runRefreshTokenFlow().finally(() => {
          refreshPromise = null;
        });
      }
      const refreshedToken = await refreshPromise;
      if (refreshedToken) {
        return apiRequest<T>(path, options, refreshedToken);
      }
      throw new Error('__UNAUTHORIZED__');
    }
    const apiMessage = parseErrorFromPayload(payload);
    if (apiMessage) {
      throw new Error(apiMessage);
    }
    throw new Error(`Error ${response.status}`);
  }

  return payload as T;
}

function getSavedUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed.id || !parsed.email || !parsed.name || !parsed.role) {
      return null;
    }
    return {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name,
      role: parsed.role,
      mustChangePassword: Boolean(parsed.mustChangePassword),
    };
  } catch {
    return null;
  }
}

function formatLabOrderStatus(status: LabOrderStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pendiente';
    case 'SENT_TO_LAB':
      return 'Enviada al lab';
    case 'RECEIVED':
      return 'Recibida';
    case 'DELIVERED':
      return 'Entregada';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return status;
  }
}

function getNextLabOrderStatus(status: LabOrderStatus): LabOrderStatus | null {
  if (status === 'PENDING') return 'SENT_TO_LAB';
  if (status === 'SENT_TO_LAB') return 'RECEIVED';
  if (status === 'RECEIVED') return 'DELIVERED';
  return null;
}

function getFeedbackClass(message: string): string {
  const text = message.toLowerCase();
  if (
    text.includes('error') ||
    text.includes('no se pudo') ||
    text.includes('unauthorized') ||
    text.includes('inval') ||
    text.includes('expirad') ||
    text.includes('bloquead')
  ) {
    return 'status error';
  }
  if (
    text.includes('solo lectura') ||
    text.includes('no puedes') ||
    text.includes('advertencia')
  ) {
    return 'status warning';
  }
  if (text.includes('cargando') || text.includes('consultando')) {
    return 'status info';
  }
  return 'status success';
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatInputDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toCsvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  const escaped = text.replaceAll('"', '""');
  return `"${escaped}"`;
}

function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="list skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={`skeleton-row-${index}`}>
          <div className="skeleton-block">
            <span className="skeleton-line title" />
            <span className="skeleton-line" />
          </div>
          <div className="skeleton-block right">
            <span className="skeleton-line short" />
            <span className="skeleton-line short" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  return Boolean(target.closest('[contenteditable="true"]'));
}

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(getSavedUser());
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const savedTab = localStorage.getItem(ACTIVE_TAB_KEY);
    return isTab(savedTab) ? savedTab : 'patients';
  });
  const [lastSyncByTab, setLastSyncByTab] = useState<Partial<Record<Tab, string>>>(
    {},
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeMessage, setPasswordChangeMessage] = useState('');
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);
  const [sessionWarning, setSessionWarning] = useState('');
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionActionId, setSessionActionId] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');

  const inactivityTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const inactivityWarningRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );

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
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [labOrdersLoading, setLabOrdersLoading] = useState(false);
  const [labOrdersError, setLabOrdersError] = useState('');
  const [labOrderForm, setLabOrderForm] = useState(emptyLabOrderForm);
  const [labOrderSaving, setLabOrderSaving] = useState(false);
  const [labOrderUpdatingId, setLabOrderUpdatingId] = useState('');
  const [labOrderMessage, setLabOrderMessage] = useState('');
  const [labStatusFilter, setLabStatusFilter] = useState('');
  const [labPatientFilter, setLabPatientFilter] = useState('');

  const [salePatientId, setSalePatientId] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState('CASH');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleItems, setSaleItems] = useState<SaleItemDraft[]>([
    { frameId: '', quantity: 1 },
  ]);
  const [saleSaving, setSaleSaving] = useState(false);
  const [saleVoidingId, setSaleVoidingId] = useState('');
  const [saleMessage, setSaleMessage] = useState('');

  const [cashClosures, setCashClosures] = useState<CashClosure[]>([]);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState('');
  const [cashMessage, setCashMessage] = useState('');
  const [cashUserId, setCashUserId] = useState('');
  const [cashFromDate, setCashFromDate] = useState(() => formatInputDate(new Date()));
  const [cashToDate, setCashToDate] = useState(() => formatInputDate(new Date()));
  const [cashDeclared, setCashDeclared] = useState('');
  const [cashNotes, setCashNotes] = useState('');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [userSaving, setUserSaving] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [userStatusSavingId, setUserStatusSavingId] = useState('');
  const [userPasswordResetId, setUserPasswordResetId] = useState('');

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditMessage, setAuditMessage] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportData, setReportData] = useState<SalesSummaryReport | null>(null);
  const [reportFrom, setReportFrom] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return formatInputDate(start);
  });
  const [reportTo, setReportTo] = useState(() => formatInputDate(new Date()));

  const canCreateSale =
    user?.role === 'ADMIN' || user?.role === 'ASESOR' || user?.role === 'OPTOMETRA';
  const canCreatePatient =
    user?.role === 'ADMIN' || user?.role === 'ASESOR' || user?.role === 'OPTOMETRA';
  const canDeletePatient = user?.role === 'ADMIN';
  const canCreateClinical =
    user?.role === 'ADMIN' || user?.role === 'OPTOMETRA';
  const canManageUsers = user?.role === 'ADMIN';
  const canViewReports = user?.role === 'ADMIN';
  const activeTabMeta = TAB_COPY[activeTab];
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('resetToken')?.trim() ?? '';
  });

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

  const cashSummary = useMemo(() => {
    return cashClosures.reduce(
      (acc, closure) => {
        acc.count += 1;
        acc.totalSales += closure.totalSales;
        acc.expectedCash += closure.expectedCash;
        acc.declaredCash += closure.declaredCash;
        acc.difference += closure.difference;
        return acc;
      },
      {
        count: 0,
        totalSales: 0,
        expectedCash: 0,
        declaredCash: 0,
        difference: 0,
      },
    );
  }, [cashClosures]);

  const activeTabLastSyncLabel = useMemo(() => {
    const lastSync = lastSyncByTab[activeTab];
    if (!lastSync) return '';
    return formatDateTime(lastSync);
  }, [activeTab, lastSyncByTab]);

  const markTabSynced = useCallback((tab: Tab) => {
    setLastSyncByTab((current) => ({ ...current, [tab]: new Date().toISOString() }));
  }, []);

  const clearInactivityTimers = useCallback(() => {
    if (inactivityTimeoutRef.current) {
      window.clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    if (inactivityWarningRef.current) {
      window.clearTimeout(inactivityWarningRef.current);
      inactivityWarningRef.current = null;
    }
  }, []);

  const resetSession = useCallback((message?: string) => {
    clearInactivityTimers();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setSessionWarning('');
    setSales([]);
    setLabOrders([]);
    setCashClosures([]);
    setPatients([]);
    setFrames([]);
    setSessions([]);
    setUsers([]);
    setAuditLogs([]);
    setAuditError('');
    setAuditMessage('');
    setReportData(null);
    setReportError('');
    setCashError('');
    setCashMessage('');
    setLabOrdersError('');
    setLabOrderMessage('');
    setLabOrderUpdatingId('');
    setLabOrderForm(emptyLabOrderForm);
    setLabStatusFilter('');
    setLabPatientFilter('');
    setLastSyncByTab({});
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setAuthError(message ?? '');
    setForgotMessage('');
    setResetMessage('');
    setSessionMessage('');
    setSessionActionId('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setPasswordChangeError('');
    setPasswordChangeMessage('');
  }, [clearInactivityTimers]);

  const handleUnauthorized = useCallback(() => {
    resetSession('Sesion expirada. Inicia sesion nuevamente.');
  }, [resetSession]);

  useEffect(() => {
    if (!token || !user) {
      clearInactivityTimers();
      setSessionWarning('');
      return;
    }

    const warningDelayMs = Math.max(
      INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS,
      0,
    );

    const scheduleInactivityTimers = () => {
      clearInactivityTimers();
      setSessionWarning('');
      if (warningDelayMs > 0) {
        inactivityWarningRef.current = window.setTimeout(() => {
          setSessionWarning(
            'Tu sesion se cerrara en 1 minuto por inactividad.',
          );
        }, warningDelayMs);
      }

      inactivityTimeoutRef.current = window.setTimeout(() => {
        resetSession('Sesion cerrada por inactividad. Inicia sesion nuevamente.');
      }, INACTIVITY_TIMEOUT_MS);
    };

    const handleUserActivity = () => {
      scheduleInactivityTimers();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];

    scheduleInactivityTimers();
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, handleUserActivity, { passive: true }),
    );

    return () => {
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, handleUserActivity),
      );
      clearInactivityTimers();
      setSessionWarning('');
    };
  }, [token, user, resetSession, clearInactivityTimers]);

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
        markTabSynced('patients');
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
    [token, handleUnauthorized, markTabSynced],
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
      markTabSynced('sales');
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
  }, [token, canCreateSale, handleUnauthorized, markTabSynced]);

  const loadLabOrders = useCallback(async () => {
    if (!token) return;
    setLabOrdersLoading(true);
    setLabOrdersError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '60',
      });
      if (labStatusFilter) params.set('status', labStatusFilter);
      if (labPatientFilter) params.set('patientId', labPatientFilter);

      const response = await apiRequest<ApiListResponse<LabOrder>>(
        `/lab-orders?${params.toString()}`,
        { method: 'GET' },
        token,
      );
      setLabOrders(response.data);
      markTabSynced('lab');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Error al cargar ordenes de laboratorio';
      setLabOrdersError(message);
    } finally {
      setLabOrdersLoading(false);
    }
  }, [
    token,
    labStatusFilter,
    labPatientFilter,
    handleUnauthorized,
    markTabSynced,
  ]);

  const loadCashClosures = useCallback(async () => {
    if (!token || !canCreateSale) return;

    setCashLoading(true);
    setCashError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '40',
      });
      if (cashFromDate) params.set('fromDate', cashFromDate);
      if (cashToDate) params.set('toDate', cashToDate);
      if (canManageUsers && cashUserId) params.set('userId', cashUserId);

      const response = await apiRequest<ApiListResponse<CashClosure>>(
        `/cash-closures?${params.toString()}`,
        { method: 'GET' },
        token,
      );
      setCashClosures(response.data);
      setCashMessage(`Cierres cargados: ${response.count} de ${response.total}`);
      markTabSynced('cash');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Error al cargar cierres de caja';
      setCashError(message);
    } finally {
      setCashLoading(false);
    }
  }, [
    token,
    canCreateSale,
    cashFromDate,
    cashToDate,
    canManageUsers,
    cashUserId,
    handleUnauthorized,
    markTabSynced,
  ]);

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
      markTabSynced('users');
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
  }, [token, canManageUsers, handleUnauthorized, markTabSynced]);

  const loadSessions = useCallback(async () => {
    if (!token || !user) return;
    setSessionsLoading(true);
    setSessionMessage('');
    try {
      const response = await apiRequest<{
        success: boolean;
        count: number;
        data: ActiveSession[];
      }>(
        '/auth/sessions',
        {
          method: 'POST',
          body: JSON.stringify({
            currentRefreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) ?? undefined,
          }),
        },
        token,
      );
      setSessions(response.data);
      markTabSynced('sessions');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Error al cargar sesiones activas';
      setSessionMessage(message);
    } finally {
      setSessionsLoading(false);
    }
  }, [token, user, handleUnauthorized, markTabSynced]);

  const loadAuditLogs = useCallback(async () => {
    if (!token || !canManageUsers) return;

    setAuditLoading(true);
    setAuditError('');
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '200',
      });
      if (auditModuleFilter) params.set('module', auditModuleFilter);
      if (auditActionFilter) params.set('action', auditActionFilter);
      if (auditUserFilter) params.set('actorUserId', auditUserFilter);
      if (auditSearch.trim()) params.set('q', auditSearch.trim());
      if (auditFrom) params.set('from', auditFrom);
      if (auditTo) params.set('to', auditTo);

      const response = await apiRequest<ApiListResponse<AuditLog>>(
        `/audit-logs?${params.toString()}`,
        { method: 'GET' },
        token,
      );
      setAuditLogs(response.data);
      setAuditMessage(`Registros cargados: ${response.count} de ${response.total}`);
      markTabSynced('audit');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Error al cargar auditoria';
      setAuditError(message);
    } finally {
      setAuditLoading(false);
    }
  }, [
    token,
    canManageUsers,
    handleUnauthorized,
    auditModuleFilter,
    auditActionFilter,
    auditUserFilter,
    auditSearch,
    auditFrom,
    auditTo,
    markTabSynced,
  ]);

  const loadReports = useCallback(async () => {
    if (!token || !canViewReports) return;

    setReportLoading(true);
    setReportError('');
    try {
      const params = new URLSearchParams();
      if (reportFrom) params.set('from', reportFrom);
      if (reportTo) params.set('to', reportTo);

      const response = await apiRequest<SalesSummaryReport>(
        `/reports/sales-summary?${params.toString()}`,
        { method: 'GET' },
        token,
      );
      setReportData(response);
      markTabSynced('reports');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      setReportError(
        error instanceof Error ? error.message : 'Error al cargar reportes',
      );
    } finally {
      setReportLoading(false);
    }
  }, [token, canViewReports, reportFrom, reportTo, handleUnauthorized, markTabSynced]);

  const refreshActiveTab = useCallback(() => {
    switch (activeTab) {
      case 'patients':
        void loadPatients(patientQuery);
        break;
      case 'sales':
        if (canCreateSale) {
          void Promise.all([loadSales(), loadFrames()]);
        }
        break;
      case 'lab':
        void loadLabOrders();
        break;
      case 'cash':
        if (canCreateSale) {
          void loadCashClosures();
        }
        break;
      case 'clinical':
        void loadPatients('');
        break;
      case 'sessions':
        void loadSessions();
        break;
      case 'users':
        if (canManageUsers) {
          void loadUsers();
        }
        break;
      case 'audit':
        if (canManageUsers) {
          void loadAuditLogs();
        }
        break;
      case 'reports':
        if (canViewReports) {
          void loadReports();
        }
        break;
      default:
        break;
    }
  }, [
    activeTab,
    canCreateSale,
    canManageUsers,
    canViewReports,
    loadAuditLogs,
    loadCashClosures,
    loadFrames,
    loadLabOrders,
    loadPatients,
    loadReports,
    loadSales,
    loadSessions,
    loadUsers,
    patientQuery,
  ]);

  useEffect(() => {
    if (!token) return;
    void loadPatients('');
    void loadFrames();
    void loadLabOrders();
    if (canCreateSale) {
      void loadSales();
    }
    if (canManageUsers) {
      void loadUsers();
    }
  }, [
    token,
    canCreateSale,
    canManageUsers,
    loadPatients,
    loadFrames,
    loadLabOrders,
    loadSales,
    loadUsers,
  ]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (
      (!canCreateSale && activeTab === 'cash') ||
      (!canManageUsers && (activeTab === 'users' || activeTab === 'audit')) ||
      (!canViewReports && activeTab === 'reports')
    ) {
      setActiveTab('patients');
    }
  }, [canCreateSale, canManageUsers, canViewReports, activeTab]);

  useEffect(() => {
    if (activeTab === 'reports' && canViewReports) {
      void loadReports();
    }
  }, [activeTab, canViewReports, loadReports]);

  useEffect(() => {
    if (activeTab === 'cash' && canCreateSale) {
      void loadCashClosures();
    }
  }, [activeTab, canCreateSale, loadCashClosures]);

  useEffect(() => {
    if (activeTab === 'lab') {
      void loadLabOrders();
    }
  }, [activeTab, loadLabOrders]);

  useEffect(() => {
    if (activeTab === 'sessions') {
      void loadSessions();
    }
  }, [activeTab, loadSessions]);

  useEffect(() => {
    if (!token || !user) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isFormFieldTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (!['p', 'v', 'o', 'c', 'h', 's', 'u', 'a', 'r'].includes(key)) return;

      let nextTab: Tab | null = null;
      if (key === 'p') nextTab = 'patients';
      if (key === 'v') nextTab = 'sales';
      if (key === 'o') nextTab = 'lab';
      if (key === 'c' && canCreateSale) nextTab = 'cash';
      if (key === 'h') nextTab = 'clinical';
      if (key === 's') nextTab = 'sessions';
      if (key === 'u' && canManageUsers) nextTab = 'users';
      if (key === 'a' && canManageUsers) nextTab = 'audit';
      if (key === 'r' && canViewReports) nextTab = 'reports';

      if (!nextTab) return;

      event.preventDefault();
      setActiveTab(nextTab);
      if (nextTab === 'audit') {
        void loadAuditLogs();
      }
      if (nextTab === 'reports') {
        void loadReports();
      }
      if (nextTab === 'cash') {
        void loadCashClosures();
      }
      if (nextTab === 'lab') {
        void loadLabOrders();
      }
      if (nextTab === 'sessions') {
        void loadSessions();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    token,
    user,
    canCreateSale,
    canManageUsers,
    canViewReports,
    loadAuditLogs,
    loadCashClosures,
    loadLabOrders,
    loadSessions,
    loadReports,
  ]);

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
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
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

  const removeResetTokenFromUrl = () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('resetToken');
    window.history.replaceState(
      {},
      document.title,
      `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
    );
  };

  const handleRequestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setForgotLoading(true);
    setForgotMessage('');
    try {
      const normalizedEmail = forgotEmail.trim().toLowerCase();
      if (!normalizedEmail) {
        setForgotMessage('Ingresa tu correo para recuperar la contraseña.');
        return;
      }

      const response = await apiRequest<PasswordResetRequestResponse>(
        '/auth/request-password-reset',
        {
          method: 'POST',
          body: JSON.stringify({ email: normalizedEmail }),
        },
      );

      if (response.debugToken) {
        setForgotMessage(
          `${response.message} Token demo: ${response.debugToken} (solo desarrollo).`,
        );
      } else {
        setForgotMessage(response.message);
      }
      setForgotEmail('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar el flujo de recuperacion.';
      setForgotMessage(message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPasswordWithToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetLoading(true);
    setResetMessage('');
    try {
      if (resetNewPassword !== resetConfirmPassword) {
        setResetMessage('La confirmacion de contraseña no coincide.');
        return;
      }

      if (!resetTokenFromUrl) {
        setResetMessage('No hay token de recuperacion en la URL.');
        return;
      }

      const response = await apiRequest<PasswordResetConfirmResponse>(
        '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            token: resetTokenFromUrl,
            newPassword: resetNewPassword.trim(),
          }),
        },
      );

      setResetMessage(response.message);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setResetTokenFromUrl('');
      removeResetTokenFromUrl();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo restablecer la contraseña.';
      setResetMessage(message);
    } finally {
      setResetLoading(false);
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

  const handleVoidSale = async (sale: Sale) => {
    if (!token || sale.status === 'VOIDED') return;
    const reasonInput = window.prompt(
      `Motivo de anulacion para la venta ${sale.id.slice(0, 8)}:`,
      'Cliente cancelo la compra en caja',
    );
    if (reasonInput === null) return;

    const reason = reasonInput.trim();
    if (reason.length < 5) {
      setSaleMessage('El motivo de anulacion debe tener al menos 5 caracteres.');
      return;
    }

    setSaleVoidingId(sale.id);
    setSaleMessage('');
    try {
      await apiRequest<Sale>(
        `/sales/${sale.id}/void`,
        {
          method: 'PATCH',
          body: JSON.stringify({ reason }),
        },
        token,
      );
      setSaleMessage('Venta anulada correctamente. El stock fue repuesto.');
      await Promise.all([loadSales(), loadFrames()]);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo anular la venta';
      setSaleMessage(message);
    } finally {
      setSaleVoidingId('');
    }
  };

  const handleCreateLabOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    if (!labOrderForm.patientId) {
      setLabOrderMessage('Debes seleccionar un paciente para crear la orden.');
      return;
    }

    setLabOrderSaving(true);
    setLabOrderMessage('');
    try {
      await apiRequest<{ success: boolean; data: LabOrder }>(
        '/lab-orders',
        {
          method: 'POST',
          body: JSON.stringify({
            patientId: labOrderForm.patientId,
            saleId: labOrderForm.saleId.trim() || undefined,
            reference: labOrderForm.reference.trim(),
            lensDetails: labOrderForm.lensDetails.trim() || undefined,
            labName: labOrderForm.labName.trim() || undefined,
            responsible: labOrderForm.responsible.trim() || undefined,
            promisedDate: labOrderForm.promisedDate || undefined,
            notes: labOrderForm.notes.trim() || undefined,
          }),
        },
        token,
      );

      setLabOrderForm(emptyLabOrderForm);
      setLabOrderMessage('Orden de laboratorio creada correctamente.');
      await loadLabOrders();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo crear la orden de laboratorio';
      setLabOrderMessage(message);
    } finally {
      setLabOrderSaving(false);
    }
  };

  const handleUpdateLabOrderStatus = async (
    order: LabOrder,
    nextStatus: LabOrderStatus,
  ) => {
    if (!token) return;
    setLabOrderUpdatingId(order.id);
    setLabOrderMessage('');
    try {
      await apiRequest<{ success: boolean; data: LabOrder }>(
        `/lab-orders/${order.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
        token,
      );
      setLabOrderMessage(
        `Orden ${order.reference} actualizada a ${formatLabOrderStatus(nextStatus)}.`,
      );
      await loadLabOrders();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el estado de la orden';
      setLabOrderMessage(message);
    } finally {
      setLabOrderUpdatingId('');
    }
  };

  const handleCreateCashClosure = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !canCreateSale) return;

    const declaredCash = Number(cashDeclared);
    if (!Number.isFinite(declaredCash) || declaredCash < 0) {
      setCashMessage('El efectivo declarado debe ser un numero mayor o igual a 0.');
      return;
    }

    setCashSaving(true);
    setCashMessage('');
    try {
      const response = await apiRequest<CashClosure>(
        '/cash-closures/close',
        {
          method: 'POST',
          body: JSON.stringify({
            declaredCash,
            userId: canManageUsers && cashUserId ? cashUserId : undefined,
            fromDate: cashFromDate || undefined,
            toDate: cashToDate || undefined,
            notes: cashNotes.trim() || undefined,
          }),
        },
        token,
      );

      setCashMessage(
        `Cierre guardado. Diferencia: $${response.difference.toFixed(2)} (esperado $${response.expectedCash.toFixed(2)}).`,
      );
      setCashDeclared('');
      setCashNotes('');
      await loadCashClosures();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo registrar cierre de caja';
      setCashMessage(message);
    } finally {
      setCashSaving(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !user) return;
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError('La confirmacion de contraseña no coincide.');
      return;
    }

    setPasswordChangeLoading(true);
    setPasswordChangeError('');
    setPasswordChangeMessage('');
    try {
      const response = await apiRequest<{
        success: boolean;
        message: string;
        user: AuthUser;
        accessToken: string;
        refreshToken: string;
      }>(
        '/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        },
        token,
      );

      const updatedUser: AuthUser = {
        ...user,
        ...response.user,
        mustChangePassword: false,
      };
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      setToken(response.accessToken);
      setUser(updatedUser);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordChangeMessage(response.message || 'Contraseña actualizada.');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar la contraseña';
      setPasswordChangeError(message);
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      try {
        await apiRequest(
          '/auth/logout',
          {
            method: 'POST',
            body: JSON.stringify({
              refreshToken: refreshToken ?? undefined,
            }),
          },
          token,
        );
      } catch {
        // Ignore network/auth errors here and close local session anyway.
      }
    }
    resetSession();
  };

  const handleLogoutAllDevices = async () => {
    if (!token) return;
    const confirmed = window.confirm(
      'Se cerrara tu sesion en todos tus dispositivos. Deseas continuar?',
    );
    if (!confirmed) return;

    setLogoutAllLoading(true);
    try {
      await apiRequest(
        '/auth/logout-all',
        {
          method: 'POST',
        },
        token,
      );
      resetSession('Sesion cerrada en todos los dispositivos.');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      setAuthError(
        error instanceof Error
          ? error.message
          : 'No se pudo cerrar sesion en todos los dispositivos',
      );
    } finally {
      setLogoutAllLoading(false);
    }
  };

  const handleRevokeActiveSession = async (session: ActiveSession) => {
    if (!token) return;
    if (session.isCurrent) {
      setSessionMessage('Para cerrar la sesion actual usa "Cerrar sesion".');
      return;
    }

    setSessionActionId(session.id);
    setSessionMessage('');
    try {
      const response = await apiRequest<{ success: boolean; message: string }>(
        '/auth/sessions/revoke',
        {
          method: 'POST',
          body: JSON.stringify({
            sessionId: session.id,
          }),
        },
        token,
      );
      setSessionMessage(response.message);
      await loadSessions();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'No se pudo revocar la sesion';
      setSessionMessage(message);
    } finally {
      setSessionActionId('');
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

  const handleResetUserPassword = async (target: ManagedUser) => {
    if (!token || !canManageUsers) return;
    if (target.id === user?.id) {
      setUserMessage('No puedes resetear tu propia contraseña desde aqui.');
      return;
    }

    const newPassword = window.prompt(
      `Nueva contraseña temporal para ${target.name} (minimo 8, mayuscula, minuscula y numero):`,
    );
    if (!newPassword) return;

    setUserPasswordResetId(target.id);
    setUserMessage('');
    try {
      await apiRequest<ManagedUser>(
        `/users/${target.id}/reset-password`,
        {
          method: 'PATCH',
          body: JSON.stringify({ newPassword }),
        },
        token,
      );
      setUserMessage('Contraseña temporal actualizada. El usuario debe cambiarla al entrar.');
      await loadUsers();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo resetear la contraseña';
      setUserMessage(message);
    } finally {
      setUserPasswordResetId('');
    }
  };

  const handleExportAuditCsv = () => {
    if (!auditLogs.length) {
      setAuditMessage('No hay registros para exportar.');
      return;
    }

    const headers = [
      'Fecha',
      'Modulo',
      'Accion',
      'Entidad',
      'EntityId',
      'Usuario',
      'Correo',
      'Rol',
      'IP',
      'UserAgent',
      'Payload',
    ];

    const lines = auditLogs.map((log) =>
      [
        formatDateTime(log.createdAt),
        log.module,
        log.action,
        log.entityType ?? '',
        log.entityId ?? '',
        log.actorUser?.name ?? '',
        log.actorEmail ?? '',
        log.actorRole ?? '',
        log.ipAddress ?? '',
        log.userAgent ?? '',
        log.payloadJson ?? '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );

    const content = [headers.map((header) => toCsvCell(header)).join(','), ...lines].join(
      '\n',
    );
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `auditoria-optica-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setAuditMessage('CSV exportado correctamente.');
  };

  const handleExportReportCsv = () => {
    if (!reportData) {
      setReportError('No hay reporte cargado para exportar.');
      return;
    }

    const headers = ['Fecha', 'Cantidad ventas', 'Total'];
    const lines = reportData.dailySeries.map((row) =>
      [row.date, row.salesCount, row.total.toFixed(2)]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    const content = [headers.map((header) => toCsvCell(header)).join(','), ...lines].join(
      '\n',
    );
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reporte-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!token || !user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          {resetTokenFromUrl ? (
            <>
              <p className="chip">Recuperacion</p>
              <h1>Restablecer contraseña</h1>
              <p className="subtitle">
                Define una nueva contraseña para recuperar el acceso.
              </p>

              <form className="stack" onSubmit={handleResetPasswordWithToken}>
                <label>
                  Nueva contraseña
                  <input
                    type="password"
                    value={resetNewPassword}
                    onChange={(event) => setResetNewPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                </label>
                <label>
                  Confirmar nueva contraseña
                  <input
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(event) => setResetConfirmPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                </label>
                <p className="hint">
                  Requisitos: minimo 8 caracteres, mayuscula, minuscula y numero.
                </p>

                {resetMessage ? (
                  <p className={getFeedbackClass(resetMessage)}>{resetMessage}</p>
                ) : null}

                <button type="submit" disabled={resetLoading}>
                  {resetLoading ? 'Guardando...' : 'Guardar nueva contraseña'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setResetTokenFromUrl('');
                    setResetMessage('');
                    removeResetTokenFromUrl();
                  }}
                >
                  Volver a iniciar sesion
                </button>
              </form>
            </>
          ) : (
            <>
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
                    minLength={8}
                  />
                </label>

                {authError ? <p className="error">{authError}</p> : null}

                <button type="submit" disabled={authLoading}>
                  {authLoading ? 'Ingresando...' : 'Entrar'}
                </button>
              </form>

              <div className="auth-divider" />

              <form className="stack" onSubmit={handleRequestPasswordReset}>
                <h3>Olvide mi contraseña</h3>
                <label>
                  Correo de recuperación
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    required
                    placeholder="demo@optica.local"
                  />
                </label>
                {forgotMessage ? (
                  <p className={getFeedbackClass(forgotMessage)}>{forgotMessage}</p>
                ) : null}
                <button type="submit" className="ghost" disabled={forgotLoading}>
                  {forgotLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    );
  }

  if (user.mustChangePassword) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <p className="chip">Seguridad</p>
          <h1>Cambia tu contraseña</h1>
          <p className="subtitle">
            Debes actualizar tu contraseña temporal para continuar.
          </p>

          <form className="stack" onSubmit={handleChangePassword}>
            <label>
              Contraseña actual
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Nueva contraseña
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Confirmar nueva contraseña
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>

            <p className="hint">
              Requisitos: minimo 8 caracteres, mayuscula, minuscula y numero.
            </p>
            {sessionWarning ? <p className="session-warning">{sessionWarning}</p> : null}
            {passwordChangeError ? (
              <p className="error">{passwordChangeError}</p>
            ) : null}
            {passwordChangeMessage ? (
              <p className={getFeedbackClass(passwordChangeMessage)}>
                {passwordChangeMessage}
              </p>
            ) : null}

            <button type="submit" disabled={passwordChangeLoading}>
              {passwordChangeLoading ? 'Actualizando...' : 'Actualizar contraseña'}
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
          {sessionWarning ? <p className="session-warning">{sessionWarning}</p> : null}
        </div>
        <div className="user-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => void handleLogoutAllDevices()}
            disabled={logoutAllLoading}
          >
            {logoutAllLoading ? 'Cerrando...' : 'Cerrar en todos'}
          </button>
          <button type="button" className="ghost" onClick={() => void handleLogout()}>
            Cerrar sesión
          </button>
        </div>
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
          className={activeTab === 'lab' ? 'active' : ''}
          onClick={() => {
            setActiveTab('lab');
            void loadLabOrders();
          }}
        >
          Laboratorio
        </button>
        {canCreateSale ? (
          <button
            type="button"
            className={activeTab === 'cash' ? 'active' : ''}
            onClick={() => {
              setActiveTab('cash');
              void loadCashClosures();
            }}
          >
            Caja
          </button>
        ) : null}
        <button
          type="button"
          className={activeTab === 'clinical' ? 'active' : ''}
          onClick={() => setActiveTab('clinical')}
        >
          Historias clinicas
        </button>
        <button
          type="button"
          className={activeTab === 'sessions' ? 'active' : ''}
          onClick={() => {
            setActiveTab('sessions');
            void loadSessions();
          }}
        >
          Sesiones
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
        {canManageUsers ? (
          <button
            type="button"
            className={activeTab === 'audit' ? 'active' : ''}
            onClick={() => {
              setActiveTab('audit');
              void loadAuditLogs();
            }}
          >
            Auditoria
          </button>
        ) : null}
        {canViewReports ? (
          <button
            type="button"
            className={activeTab === 'reports' ? 'active' : ''}
            onClick={() => {
              setActiveTab('reports');
              void loadReports();
            }}
          >
            Reportes
          </button>
        ) : null}
      </nav>

      <section className="view-intro">
        <h2>{activeTabMeta.title}</h2>
        <p>{activeTabMeta.description}</p>
        <div className="view-intro-foot">
          <small className="hint">
            Atajos: Alt+P Pacientes · Alt+V Ventas · Alt+O Laboratorio · Alt+C Caja
            · Alt+H Historias · Alt+S Sesiones · Alt+U Usuarios · Alt+A Auditoria ·
            Alt+R Reportes
          </small>
          <div className="view-intro-actions">
            {activeTabLastSyncLabel ? <small>Actualizado: {activeTabLastSyncLabel}</small> : null}
            <button type="button" className="ghost" onClick={refreshActiveTab}>
              Recargar vista
            </button>
          </div>
        </div>
      </section>

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

              {patientMessage ? (
                <p className={getFeedbackClass(patientMessage)}>{patientMessage}</p>
              ) : null}

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
            {patientsLoading ? <SkeletonList rows={5} /> : null}

            {!patientsLoading && patients.length > 0 ? (
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
            ) : null}

            {!patientsLoading && patients.length === 0 ? (
              <EmptyState
                title="No hay pacientes para mostrar"
                description="Prueba con otra busqueda o registra un nuevo paciente."
              />
            ) : null}
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
              {saleMessage ? (
                <p className={getFeedbackClass(saleMessage)}>{saleMessage}</p>
              ) : null}

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
            {salesLoading ? <SkeletonList rows={4} /> : null}

            {!salesLoading && sales.length > 0 ? (
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
                      <small className={`sale-status ${sale.status === 'VOIDED' ? 'voided' : 'active'}`}>
                        {sale.status === 'VOIDED' ? 'ANULADA' : 'ACTIVA'}
                      </small>
                      <small>
                        {sale.paymentMethod} · {new Date(sale.createdAt).toLocaleString()}
                      </small>
                      <small>
                        Registrada por:{' '}
                        {sale.createdBy
                          ? `${sale.createdBy.name} (${formatRoleLabel(sale.createdBy.role)})`
                          : 'Usuario no disponible'}
                      </small>
                      {sale.status === 'VOIDED' ? (
                        <>
                          <small>
                            Anulada:{' '}
                            {sale.voidedAt ? new Date(sale.voidedAt).toLocaleString() : '-'} ·{' '}
                            {sale.voidedBy
                              ? `${sale.voidedBy.name} (${formatRoleLabel(sale.voidedBy.role)})`
                              : 'Usuario no disponible'}
                          </small>
                          <small>Motivo: {sale.voidReason || '-'}</small>
                        </>
                      ) : (
                        <div className="sale-actions">
                          <button
                            type="button"
                            className="ghost danger"
                            onClick={() => void handleVoidSale(sale)}
                            disabled={saleVoidingId === sale.id}
                          >
                            {saleVoidingId === sale.id ? 'Anulando...' : 'Anular'}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {!salesLoading && sales.length === 0 ? (
              <EmptyState
                title="Aun no hay ventas registradas"
                description="Registra la primera venta para ver trazabilidad comercial aqui."
              />
            ) : null}
          </article>
        </section>
      ) : activeTab === 'lab' ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Nueva orden de laboratorio</h2>
            </div>

            <form className="stack" onSubmit={handleCreateLabOrder}>
              <label>
                Paciente
                <select
                  value={labOrderForm.patientId}
                  onChange={(event) =>
                    setLabOrderForm((current) => ({
                      ...current,
                      patientId: event.target.value,
                    }))
                  }
                  required
                  disabled={labOrderSaving}
                >
                  <option value="">Seleccionar paciente</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.firstName} {patient.lastName} · {patient.documentNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Referencia de orden
                <input
                  value={labOrderForm.reference}
                  onChange={(event) =>
                    setLabOrderForm((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  placeholder="Ej: Progresivo antirreflejo + filtro azul"
                  required
                  minLength={3}
                  disabled={labOrderSaving}
                />
              </label>
              <label>
                Detalle de lentes
                <textarea
                  rows={3}
                  value={labOrderForm.lensDetails}
                  onChange={(event) =>
                    setLabOrderForm((current) => ({
                      ...current,
                      lensDetails: event.target.value,
                    }))
                  }
                  disabled={labOrderSaving}
                />
              </label>
              <div className="field-grid two">
                <label>
                  Laboratorio
                  <input
                    value={labOrderForm.labName}
                    onChange={(event) =>
                      setLabOrderForm((current) => ({
                        ...current,
                        labName: event.target.value,
                      }))
                    }
                    placeholder="Nombre del laboratorio"
                    disabled={labOrderSaving}
                  />
                </label>
                <label>
                  Responsable
                  <input
                    value={labOrderForm.responsible}
                    onChange={(event) =>
                      setLabOrderForm((current) => ({
                        ...current,
                        responsible: event.target.value,
                      }))
                    }
                    placeholder="Quien gestiona esta orden"
                    disabled={labOrderSaving}
                  />
                </label>
              </div>
              <div className="field-grid two">
                <label>
                  Fecha promesa
                  <input
                    type="date"
                    value={labOrderForm.promisedDate}
                    onChange={(event) =>
                      setLabOrderForm((current) => ({
                        ...current,
                        promisedDate: event.target.value,
                      }))
                    }
                    disabled={labOrderSaving}
                  />
                </label>
                <label>
                  ID de venta (opcional)
                  <input
                    value={labOrderForm.saleId}
                    onChange={(event) =>
                      setLabOrderForm((current) => ({
                        ...current,
                        saleId: event.target.value,
                      }))
                    }
                    placeholder="UUID de la venta"
                    disabled={labOrderSaving}
                  />
                </label>
              </div>
              <label>
                Notas
                <textarea
                  rows={3}
                  value={labOrderForm.notes}
                  onChange={(event) =>
                    setLabOrderForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  disabled={labOrderSaving}
                />
              </label>

              {labOrderMessage ? (
                <p className={getFeedbackClass(labOrderMessage)}>{labOrderMessage}</p>
              ) : null}

              <button type="submit" disabled={labOrderSaving}>
                {labOrderSaving ? 'Guardando...' : 'Crear orden'}
              </button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Ordenes registradas</h2>
              <button type="button" onClick={() => void loadLabOrders()}>
                Actualizar
              </button>
            </div>

            <div className="field-grid two">
              <label>
                Estado
                <select
                  value={labStatusFilter}
                  onChange={(event) => setLabStatusFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="PENDING">Pendiente</option>
                  <option value="SENT_TO_LAB">Enviada al lab</option>
                  <option value="RECEIVED">Recibida</option>
                  <option value="DELIVERED">Entregada</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
              </label>
              <label>
                Paciente
                <select
                  value={labPatientFilter}
                  onChange={(event) => setLabPatientFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.firstName} {patient.lastName} · {patient.documentNumber}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {labOrdersError ? <p className="error">{labOrdersError}</p> : null}
            {labOrdersLoading ? <SkeletonList rows={5} /> : null}

            {!labOrdersLoading && labOrders.length > 0 ? (
              <ul className="list">
                {labOrders.map((order) => {
                  const nextStatus = getNextLabOrderStatus(order.status);
                  return (
                    <li key={order.id}>
                      <div>
                        <strong>{order.reference}</strong>
                        <p>
                          {order.patient
                            ? `${order.patient.firstName} ${order.patient.lastName} · ${order.patient.documentNumber}`
                            : 'Paciente no disponible'}
                        </p>
                        <p>
                          Estado:{' '}
                          <span
                            className={`lab-order-status ${order.status.toLowerCase()}`}
                          >
                            {formatLabOrderStatus(order.status)}
                          </span>
                        </p>
                        <p>Promesa: {formatDateTime(order.promisedDate)}</p>
                        {order.labName ? <p>Lab: {order.labName}</p> : null}
                        {order.responsible ? <p>Responsable: {order.responsible}</p> : null}
                      </div>
                      <div className="sale-item-right">
                        <small>Creada: {formatDateTime(order.createdAt)}</small>
                        {nextStatus ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void handleUpdateLabOrderStatus(order, nextStatus)}
                            disabled={labOrderUpdatingId === order.id}
                          >
                            {labOrderUpdatingId === order.id
                              ? 'Actualizando...'
                              : `Marcar ${formatLabOrderStatus(nextStatus)}`}
                          </button>
                        ) : null}
                        {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' ? (
                          <button
                            type="button"
                            className="ghost danger"
                            onClick={() =>
                              void handleUpdateLabOrderStatus(order, 'CANCELLED')
                            }
                            disabled={labOrderUpdatingId === order.id}
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {!labOrdersLoading && labOrders.length === 0 ? (
              <EmptyState
                title="No hay ordenes de laboratorio"
                description="Crea una orden para empezar trazabilidad operativa."
              />
            ) : null}
          </article>
        </section>
      ) : activeTab === 'cash' && canCreateSale ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Nuevo cierre de caja</h2>
            </div>

            <form className="stack" onSubmit={handleCreateCashClosure}>
              {canManageUsers ? (
                <label>
                  Usuario objetivo
                  <select
                    value={cashUserId}
                    onChange={(event) => setCashUserId(event.target.value)}
                    disabled={cashSaving}
                  >
                    <option value="">Mi usuario</option>
                    {users.map((managedUser) => (
                      <option key={managedUser.id} value={managedUser.id}>
                        {managedUser.name} ({managedUser.email})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="field-grid two">
                <label>
                  Desde
                  <input
                    type="date"
                    value={cashFromDate}
                    onChange={(event) => setCashFromDate(event.target.value)}
                    disabled={cashSaving}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={cashToDate}
                    onChange={(event) => setCashToDate(event.target.value)}
                    disabled={cashSaving}
                  />
                </label>
              </div>

              <label>
                Efectivo declarado
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cashDeclared}
                  onChange={(event) => setCashDeclared(event.target.value)}
                  placeholder="0.00"
                  disabled={cashSaving}
                  required
                />
              </label>

              <label>
                Notas (opcional)
                <textarea
                  rows={3}
                  value={cashNotes}
                  onChange={(event) => setCashNotes(event.target.value)}
                  disabled={cashSaving}
                />
              </label>

              {cashMessage ? (
                <p className={getFeedbackClass(cashMessage)}>{cashMessage}</p>
              ) : null}

              <button type="submit" disabled={cashSaving}>
                {cashSaving ? 'Guardando cierre...' : 'Registrar cierre'}
              </button>
            </form>

            <div className="section-card">
              <h3>Arqueo acumulado del filtro</h3>
              <p>Cierres: {cashSummary.count}</p>
              <p>Total ventas: ${cashSummary.totalSales.toFixed(2)}</p>
              <p>Efectivo esperado: ${cashSummary.expectedCash.toFixed(2)}</p>
              <p>Efectivo declarado: ${cashSummary.declaredCash.toFixed(2)}</p>
              <p>Diferencia total: ${cashSummary.difference.toFixed(2)}</p>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Cierres recientes</h2>
              <button type="button" onClick={() => void loadCashClosures()} disabled={cashLoading}>
                Actualizar
              </button>
            </div>

            {cashError ? <p className="error">{cashError}</p> : null}
            {cashLoading ? <SkeletonList rows={5} /> : null}

            {!cashLoading && cashClosures.length > 0 ? (
              <ul className="list">
                {cashClosures.map((closure) => (
                  <li key={closure.id}>
                    <div>
                      <strong>
                        {closure.user
                          ? `${closure.user.name} (${formatRoleLabel(closure.user.role)})`
                          : closure.userId}
                      </strong>
                      <p>
                        Periodo: {formatDateTime(closure.periodStart)} -{' '}
                        {formatDateTime(closure.periodEnd)}
                      </p>
                      <p>
                        Ventas: {closure.salesCount} · Total: ${closure.totalSales.toFixed(2)}
                      </p>
                      {closure.notes ? <p>Nota: {closure.notes}</p> : null}
                    </div>
                    <div className="cash-closure-right">
                      <small>Cierre: {formatDateTime(closure.createdAt)}</small>
                      <small>
                        Cerrado por:{' '}
                        {closure.closedBy
                          ? `${closure.closedBy.name} (${formatRoleLabel(closure.closedBy.role)})`
                          : closure.closedById}
                      </small>
                      <small>Esperado: ${closure.expectedCash.toFixed(2)}</small>
                      <small>Declarado: ${closure.declaredCash.toFixed(2)}</small>
                      <small
                        className={`cash-diff ${
                          closure.difference > 0
                            ? 'up'
                            : closure.difference < 0
                              ? 'down'
                              : 'even'
                        }`}
                      >
                        Diferencia: ${closure.difference.toFixed(2)}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {!cashLoading && cashClosures.length === 0 ? (
              <EmptyState
                title="Sin cierres de caja para este filtro"
                description="Registra un cierre para iniciar el historial de arqueos."
              />
            ) : null}
          </article>
        </section>
      ) : activeTab === 'clinical' ? (
        <ClinicalHistoryTab
          token={token}
          patients={patients}
          canCreateClinical={Boolean(canCreateClinical)}
          onUnauthorized={handleUnauthorized}
        />
      ) : activeTab === 'sessions' ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Sesiones abiertas</h2>
              <button
                type="button"
                onClick={() => void loadSessions()}
                disabled={sessionsLoading}
              >
                {sessionsLoading ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>

            {sessionMessage ? (
              <p className={getFeedbackClass(sessionMessage)}>{sessionMessage}</p>
            ) : null}
            {sessionsLoading ? <SkeletonList rows={4} /> : null}

            {!sessionsLoading && sessions.length > 0 ? (
              <ul className="list">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>{session.isCurrent ? 'Sesion actual' : 'Sesion activa'}</strong>
                      <p>Iniciada: {formatDateTime(session.createdAt)}</p>
                      <p>Expira: {formatDateTime(session.expiresAt)}</p>
                      <p>IP: {session.ipAddress || 'No registrada'}</p>
                      <p>
                        Dispositivo:{' '}
                        {session.userAgent ? session.userAgent.slice(0, 84) : 'No registrado'}
                      </p>
                    </div>
                    <div className="session-item-right">
                      <small>ID: {session.id.slice(0, 8)}...</small>
                      {session.isCurrent ? (
                        <span className="warn">Actual</span>
                      ) : (
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => void handleRevokeActiveSession(session)}
                          disabled={sessionActionId === session.id}
                        >
                          {sessionActionId === session.id ? 'Revocando...' : 'Revocar'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {!sessionsLoading && sessions.length === 0 ? (
              <EmptyState
                title="No hay sesiones activas adicionales"
                description="Solo veras aqui tus refresh tokens aun vigentes."
              />
            ) : null}
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Seguridad de acceso</h2>
            </div>
            <div className="stack">
              <p className="hint">
                Revoca sesiones antiguas si ingresaste desde un equipo que ya no usas.
              </p>
              <button
                type="button"
                className="ghost"
                onClick={() => void handleLogoutAllDevices()}
                disabled={logoutAllLoading}
              >
                {logoutAllLoading
                  ? 'Cerrando sesiones...'
                  : 'Cerrar en todos los dispositivos'}
              </button>
              <p className="hint">
                Para salir solo del equipo actual usa el boton "Cerrar sesion" arriba.
              </p>
            </div>
          </article>
        </section>
      ) : activeTab === 'users' && canManageUsers ? (
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
                  minLength={8}
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
              <p className="hint">
                Requisitos: minimo 8 caracteres, mayuscula, minuscula y numero.
              </p>

              {userMessage ? (
                <p className={getFeedbackClass(userMessage)}>{userMessage}</p>
              ) : null}

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
            {usersLoading ? <SkeletonList rows={4} /> : null}

            {!usersLoading && users.length > 0 ? (
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
                        {managedUser.mustChangePassword
                          ? ' · Cambio clave pendiente'
                          : ''}
                      </small>
                      <div className="user-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void handleResetUserPassword(managedUser)}
                          disabled={
                            userPasswordResetId === managedUser.id ||
                            managedUser.id === user.id
                          }
                          title={
                            managedUser.id === user.id
                              ? 'Usa el cambio de contraseña de tu sesion'
                              : ''
                          }
                        >
                          {userPasswordResetId === managedUser.id
                            ? 'Reseteando...'
                            : 'Reset clave'}
                        </button>
                        <button
                          type="button"
                          className={`ghost ${managedUser.isActive ? 'danger' : ''}`}
                          onClick={() => void handleToggleUserStatus(managedUser)}
                          disabled={
                            userStatusSavingId === managedUser.id ||
                            userPasswordResetId === managedUser.id ||
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
            ) : null}

            {!usersLoading && users.length === 0 ? (
              <EmptyState
                title="No hay usuarios cargados"
                description="Crea un usuario nuevo o usa actualizar para consultar de nuevo."
              />
            ) : null}
          </article>
        </section>
      ) : activeTab === 'audit' && canManageUsers ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Filtros de auditoria</h2>
            </div>
            <div className="stack">
              <label>
                Modulo
                <input
                  value={auditModuleFilter}
                  onChange={(event) => setAuditModuleFilter(event.target.value)}
                  placeholder="AUTH, SALES, PATIENTS..."
                />
              </label>
              <label>
                Accion
                <input
                  value={auditActionFilter}
                  onChange={(event) => setAuditActionFilter(event.target.value)}
                  placeholder="CREATE, UPDATE, LOGIN_SUCCESS..."
                />
              </label>
              <label>
                Usuario
                <select
                  value={auditUserFilter}
                  onChange={(event) => setAuditUserFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  {users.map((managedUser) => (
                    <option key={managedUser.id} value={managedUser.id}>
                      {managedUser.name} ({managedUser.email})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Busqueda
                <input
                  value={auditSearch}
                  onChange={(event) => setAuditSearch(event.target.value)}
                  placeholder="correo, modulo, accion, entidad..."
                />
              </label>
              <div className="field-grid two">
                <label>
                  Desde
                  <input
                    type="date"
                    value={auditFrom}
                    onChange={(event) => setAuditFrom(event.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={auditTo}
                    onChange={(event) => setAuditTo(event.target.value)}
                  />
                </label>
              </div>
              <div className="user-actions">
                <button type="button" onClick={() => void loadAuditLogs()} disabled={auditLoading}>
                  {auditLoading ? 'Consultando...' : 'Aplicar filtros'}
                </button>
                <button type="button" className="ghost" onClick={handleExportAuditCsv}>
                  Exportar CSV
                </button>
              </div>
              {auditMessage ? (
                <p className={getFeedbackClass(auditMessage)}>{auditMessage}</p>
              ) : null}
              {auditError ? <p className="error">{auditError}</p> : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Eventos</h2>
              <button type="button" onClick={() => void loadAuditLogs()} disabled={auditLoading}>
                Actualizar
              </button>
            </div>

            {auditLoading ? <SkeletonList rows={6} /> : null}

            {!auditLoading && auditLogs.length > 0 ? (
              <ul className="list audit-list">
                {auditLogs.map((log) => (
                  <li key={log.id} className="audit-item">
                    <div>
                      <strong>
                        {log.module} · {log.action}
                      </strong>
                      <p>
                        {log.entityType || 'Entidad'} {log.entityId ? `#${log.entityId}` : ''}
                      </p>
                    </div>
                    <div className="audit-item-right">
                      <small>{formatDateTime(log.createdAt)}</small>
                      <small>
                        {log.actorUser?.name || log.actorEmail || 'Sistema'} ·{' '}
                        {formatRoleLabel(log.actorRole || undefined)}
                      </small>
                      <small>{log.ipAddress || '-'}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {!auditLoading && auditLogs.length === 0 ? (
              <EmptyState
                title="Sin eventos para estos filtros"
                description="Ajusta filtros o amplia el rango de fechas para ver actividad."
              />
            ) : null}
          </article>
        </section>
      ) : activeTab === 'reports' && canViewReports ? (
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Filtros de reporte</h2>
            </div>
            <div className="stack">
              <div className="field-grid two">
                <label>
                  Desde
                  <input
                    type="date"
                    value={reportFrom}
                    onChange={(event) => setReportFrom(event.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={reportTo}
                    onChange={(event) => setReportTo(event.target.value)}
                  />
                </label>
              </div>
              <div className="user-actions">
                <button type="button" onClick={() => void loadReports()} disabled={reportLoading}>
                  {reportLoading ? 'Generando...' : 'Generar reporte'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleExportReportCsv}
                  disabled={!reportData}
                >
                  Exportar CSV
                </button>
              </div>
              {reportError ? <p className="error">{reportError}</p> : null}
              {reportLoading ? (
                <div className="section-card">
                  <div className="skeleton-block">
                    <span className="skeleton-line title" />
                    <span className="skeleton-line" />
                    <span className="skeleton-line" />
                    <span className="skeleton-line short" />
                  </div>
                </div>
              ) : null}
              {!reportLoading && reportData ? (
                <div className="section-card">
                  <h3>Resumen general</h3>
                  <p>
                    Periodo: {formatDateTime(reportData.range.from)} -{' '}
                    {formatDateTime(reportData.range.to)}
                  </p>
                  <p>Ventas: {reportData.totals.salesCount}</p>
                  <p>Ingresos: ${reportData.totals.totalRevenue.toFixed(2)}</p>
                  <p>Ticket promedio: ${reportData.totals.averageTicket.toFixed(2)}</p>
                  <p>Items vendidos: {reportData.totals.totalItems}</p>
                  <p>Pacientes unicos: {reportData.totals.uniquePatients}</p>
                </div>
              ) : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Top asesores y monturas</h2>
              <button type="button" onClick={() => void loadReports()} disabled={reportLoading}>
                Actualizar
              </button>
            </div>
            {reportLoading ? (
              <>
                <div className="section-card">
                  <h3>Por usuario</h3>
                  <SkeletonList rows={4} />
                </div>
                <div className="section-card">
                  <h3>Top monturas</h3>
                  <SkeletonList rows={4} />
                </div>
              </>
            ) : null}
            {!reportLoading && reportData ? (
              <>
                <div className="section-card">
                  <h3>Por usuario</h3>
                  {reportData.byUser.length > 0 ? (
                    <ul className="list">
                      {reportData.byUser.slice(0, 8).map((row) => (
                        <li key={row.userId}>
                          <div>
                            <strong>{row.name}</strong>
                            <p>
                              {row.email} · {formatRoleLabel(row.role)}
                            </p>
                          </div>
                          <div className="audit-item-right">
                            <small>{row.salesCount} ventas</small>
                            <small>${row.total.toFixed(2)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Sin ventas por usuario"
                      description="No hay ventas para el rango seleccionado."
                    />
                  )}
                </div>
                <div className="section-card">
                  <h3>Top monturas</h3>
                  {reportData.topFrames.length > 0 ? (
                    <ul className="list">
                      {reportData.topFrames.map((row) => (
                        <li key={row.frameId}>
                          <div>
                            <strong>
                              #{row.codigo} {row.referencia}
                            </strong>
                            <p>{row.quantity} unidades</p>
                          </div>
                          <div className="audit-item-right">
                            <small>${row.revenue.toFixed(2)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Sin monturas destacadas"
                      description="Aun no hay unidades vendidas en este rango."
                    />
                  )}
                </div>
              </>
            ) : (
              !reportLoading && (
                <EmptyState
                  title="Sin reporte cargado"
                  description="Genera el reporte para ver datos de negocio."
                />
              )
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}

export default App;


