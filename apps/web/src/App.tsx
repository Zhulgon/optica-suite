import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import './App.css';
import { ClinicalHistoryTab } from './clinical-history-tab';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const API_UNREACHABLE_MESSAGE =
  'No se pudo conectar con la API. Verifica que el backend este corriendo en http://localhost:3000.';
const BUSINESS_NAME = import.meta.env.VITE_BUSINESS_NAME ?? 'Optica Suite';
const BUSINESS_NIT = import.meta.env.VITE_BUSINESS_NIT ?? 'NIT 900000000-0';
const BUSINESS_PHONE = import.meta.env.VITE_BUSINESS_PHONE ?? '+57 300 000 0000';
const BUSINESS_ADDRESS =
  import.meta.env.VITE_BUSINESS_ADDRESS ?? 'Direccion comercial no configurada';
const TOKEN_KEY = 'optica_token';
const USER_KEY = 'optica_user';
const DEVICE_FINGERPRINT_KEY = 'optica_device_fingerprint';
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
  twoFactorEnabled?: boolean;
}

interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  trustedDeviceToken?: string;
  twoFactorUsedRecoveryCode?: boolean;
  user: AuthUser;
}

interface LoginTwoFactorChallengeResponse {
  requiresTwoFactor: true;
  twoFactorChallengeToken: string;
  message: string;
  reason?: 'NEW_DEVICE' | 'NEW_IP' | 'UNKNOWN_DEVICE' | 'REQUIRED';
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}

type AuthLoginResponse = LoginResponse | LoginTwoFactorChallengeResponse;

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

interface TwoFactorStatusResponse {
  success: boolean;
  enabled: boolean;
  required: boolean;
  role: Role;
  recoveryCodesRemaining?: number;
}

interface TwoFactorSetupResponse {
  success: boolean;
  secret: string;
  otpauthUrl: string;
  manualEntryKey: string;
  message: string;
  recoveryCodes?: string[];
}

interface SalesSummaryReport {
  range: {
    from: string;
    to: string;
  };
  previousRange: {
    from: string;
    to: string;
  };
  totals: {
    salesCount: number;
    totalRevenue: number;
    averageTicket: number;
    totalItems: number;
    uniquePatients: number;
    totalLensRevenue: number;
    totalLensCost: number;
    estimatedGrossProfit: number;
  };
  risk: {
    negativeMarginSalesCount: number;
    negativeMarginTotalLoss: number;
    negativeMarginRevenueExposure: number;
    topNegativeSales: Array<{
      saleId: string;
      saleNumber: number;
      createdAt: string;
      total: number;
      grossProfit: number;
      marginPercent: number;
      createdBy: {
        id: string;
        name: string;
        email: string;
        role: string;
      } | null;
      patient: {
        id: string;
        firstName: string;
        lastName: string;
        documentNumber: string;
      } | null;
    }>;
  };
  comparison: {
    salesCount: {
      current: number;
      previous: number;
      delta: number;
      deltaPercent: number;
    };
    totalRevenue: {
      current: number;
      previous: number;
      delta: number;
      deltaPercent: number;
    };
    grossProfit: {
      current: number;
      previous: number;
      delta: number;
      deltaPercent: number;
    };
    averageTicket: {
      current: number;
      previous: number;
      delta: number;
      deltaPercent: number;
    };
  };
  lab: {
    totalOrders: number;
    pendingOrders: number;
    sentToLabOrders: number;
    receivedOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    overdueOpenOrders: number;
    onTimeDeliveries: number;
    lateDeliveries: number;
    onTimeDeliveryRate: number;
    avgDaysSentToReceived: number;
    avgDaysSentToDelivered: number;
  };
  voided: {
    count: number;
    totalAmount: number;
    byVoider: Array<{
      userId: string | null;
      name: string;
      email: string;
      role: string;
      count: number;
      totalAmount: number;
      averageAmount: number;
    }>;
    topReasons: Array<{
      reason: string;
      count: number;
      totalAmount: number;
      averageAmount: number;
    }>;
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
    grossProfit: number;
    totalItems: number;
    lensRevenue: number;
    lensCost: number;
    averageTicket: number;
    marginPercent: number;
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
  stagnantFrames: Array<{
    frameId: string;
    codigo: number;
    referencia: string;
    stockActual: number;
    soldQty: number;
    stockValue: number;
  }>;
  topPatients: Array<{
    patientId: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    salesCount: number;
    total: number;
    averageTicket: number;
    lastSaleAt: string;
  }>;
  dailySeries: Array<{
    date: string;
    salesCount: number;
    total: number;
  }>;
}

interface OperationalAlert {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
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
  saleNumber: number;
  frameSubtotal: number;
  lensSubtotal: number;
  subtotal: number;
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  lensCostTotal: number;
  grossProfit: number;
  total: number;
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
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
    documentNumber?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    frame: {
      codigo: number;
      referencia: string;
    };
  }>;
  lensItems: Array<{
    id: string;
    labOrderId?: string | null;
    description: string;
    quantity: number;
    unitSalePrice: number;
    unitLabCost: number;
    subtotalSale: number;
    subtotalCost: number;
    labOrder?: {
      id: string;
      reference: string;
      status: LabOrderStatus;
    } | null;
  }>;
}

interface SaleItemDraft {
  frameId: string;
  quantity: number;
}

interface SaleLensItemDraft {
  labOrderId: string;
  description: string;
  quantity: number;
  unitSalePrice: string;
  unitLabCost: string;
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

interface CashDailySummaryRow {
  date: string;
  activeSalesCount: number;
  activeSalesTotal: number;
  voidedSalesCount: number;
  voidedSalesTotal: number;
  estimatedProfit: number;
  closuresCount: number;
  expectedCash: number;
  declaredCash: number;
  closureDifference: number;
}

interface CashDailySummaryReport {
  success: boolean;
  range: {
    from: string;
    to: string;
  };
  targetUserId: string | null;
  totals: {
    days: number;
    activeSalesCount: number;
    activeSalesTotal: number;
    voidedSalesCount: number;
    voidedSalesTotal: number;
    estimatedProfit: number;
    closuresCount: number;
    expectedCash: number;
    declaredCash: number;
    closureDifference: number;
  };
  rows: CashDailySummaryRow[];
}

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled?: boolean;
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
    let refreshResponse: Response;
    try {
      refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });
    } catch {
      return null;
    }

    if (!refreshResponse.ok) return null;

    const contentType = refreshResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const payload = (await refreshResponse.json()) as LoginResponse;
    if (!payload?.accessToken || !payload?.user) {
      return null;
    }

    localStorage.setItem(TOKEN_KEY, payload.accessToken);
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

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: options.credentials ?? 'include',
      headers,
    });
  } catch {
    throw new Error(API_UNREACHABLE_MESSAGE);
  }

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
      twoFactorEnabled: Boolean(parsed.twoFactorEnabled),
    };
  } catch {
    return null;
  }
}

function getOrCreateDeviceFingerprint(): string {
  const existing = localStorage.getItem(DEVICE_FINGERPRINT_KEY)?.trim();
  if (existing) {
    return existing;
  }

  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const fingerprint = [
    randomId,
    navigator.userAgent || 'unknown-agent',
    navigator.language || 'unknown-lang',
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown-timezone',
  ].join('|');

  localStorage.setItem(DEVICE_FINGERPRINT_KEY, fingerprint);
  return fingerprint;
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

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isLabOrderOverdue(order: LabOrder, now = new Date()): boolean {
  if (!order.promisedDate) return false;
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') return false;
  const promised = new Date(order.promisedDate);
  if (Number.isNaN(promised.getTime())) return false;
  promised.setHours(23, 59, 59, 999);
  return promised.getTime() < now.getTime();
}

function getLabOrderDelayDays(order: LabOrder, now = new Date()): number {
  if (!order.promisedDate) return 0;
  const promised = new Date(order.promisedDate);
  if (Number.isNaN(promised.getTime())) return 0;
  promised.setHours(0, 0, 0, 0);
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const diffMs = current.getTime() - promised.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function formatInputDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDatePresetRange(
  preset: 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CURRENT_MONTH',
) {
  const end = new Date();
  const from = new Date(end);

  if (preset === 'TODAY') {
    return {
      from: formatInputDate(from),
      to: formatInputDate(end),
    };
  }

  if (preset === 'LAST_7_DAYS') {
    from.setDate(from.getDate() - 6);
    return {
      from: formatInputDate(from),
      to: formatInputDate(end),
    };
  }

  if (preset === 'LAST_30_DAYS') {
    from.setDate(from.getDate() - 29);
    return {
      from: formatInputDate(from),
      to: formatInputDate(end),
    };
  }

  const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    from: formatInputDate(monthStart),
    to: formatInputDate(end),
  };
}

function formatSaleNumber(saleNumber?: number | null): string {
  if (!saleNumber || !Number.isFinite(saleNumber)) {
    return 'V-SIN-NUMERO';
  }
  return `V-${String(Math.trunc(saleNumber)).padStart(6, '0')}`;
}

function formatPaymentMethod(method: Sale['paymentMethod'] | string): string {
  switch (method) {
    case 'CASH':
      return 'Efectivo';
    case 'CARD':
      return 'Tarjeta';
    case 'TRANSFER':
      return 'Transferencia';
    case 'MIXED':
      return 'Mixto';
    default:
      return method;
  }
}

function formatAlertSeverity(value: OperationalAlert['severity']): string {
  switch (value) {
    case 'HIGH':
      return 'Alta';
    case 'MEDIUM':
      return 'Media';
    case 'LOW':
      return 'Baja';
    default:
      return value;
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatSigned(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

function calculateSalePreview(
  subtotal: number,
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT',
  discountValue: number,
  taxPercent: number,
) {
  const safeSubtotal = roundMoney(Math.max(0, subtotal));
  const safeDiscountValue = roundMoney(Math.max(0, discountValue));
  const safeTaxPercent = roundMoney(Math.max(0, taxPercent));

  let discountAmount = 0;
  if (discountType === 'PERCENT') {
    discountAmount = roundMoney((safeSubtotal * Math.min(100, safeDiscountValue)) / 100);
  } else if (discountType === 'AMOUNT') {
    discountAmount = roundMoney(Math.min(safeSubtotal, safeDiscountValue));
  }

  const taxableBase = roundMoney(Math.max(0, safeSubtotal - discountAmount));
  const taxAmount = roundMoney((taxableBase * Math.min(100, safeTaxPercent)) / 100);
  const total = roundMoney(taxableBase + taxAmount);

  return {
    subtotal: safeSubtotal,
    discountAmount,
    taxPercent: Math.min(100, safeTaxPercent),
    taxAmount,
    total,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toHtmlText(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br />');
}

function buildSaleReceiptHtml(sale: Sale): string {
  const numberLabel = formatSaleNumber(sale.saleNumber);
  const saleDate = new Date(sale.createdAt).toLocaleString('es-CO');
  const patientName = sale.patient
    ? `${sale.patient.firstName} ${sale.patient.lastName}`.trim()
    : 'Consumidor final';
  const patientDocument = sale.patient?.documentNumber?.trim() || 'Sin documento';
  const patientPhone = sale.patient?.phone?.trim() || '-';
  const seller = sale.createdBy?.name?.trim() || 'Usuario no disponible';
  const sellerRole = sale.createdBy ? formatRoleLabel(sale.createdBy.role) : '-';
  const notes = sale.notes?.trim() || '-';
  const statusLabel = sale.status === 'VOIDED' ? 'ANULADA' : 'ACTIVA';
  const statusClass = sale.status === 'VOIDED' ? 'status-voided' : 'status-active';
  const discountLabel =
    sale.discountType === 'PERCENT'
      ? `${sale.discountValue.toFixed(2)}%`
      : sale.discountType === 'AMOUNT'
        ? `$${sale.discountValue.toFixed(2)}`
        : 'No aplica';
  const taxLabel = `${sale.taxPercent.toFixed(2)}%`;
  const frameRows = sale.items
    .map((item, index) => {
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(String(item.frame.codigo))}</td>
        <td>${escapeHtml(item.frame.referencia)}</td>
        <td>${item.quantity}</td>
        <td>$${item.unitPrice.toFixed(2)}</td>
        <td>$${item.subtotal.toFixed(2)}</td>
      </tr>`;
    })
    .join('');
  const lensRows = sale.lensItems
    .map((item, index) => {
      const labRef = item.labOrder?.reference
        ? ` · ${item.labOrder.reference}`
        : '';
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.description)}${escapeHtml(labRef)}</td>
        <td>${item.quantity}</td>
        <td>$${item.unitSalePrice.toFixed(2)}</td>
        <td>$${item.subtotalSale.toFixed(2)}</td>
        <td>$${item.subtotalCost.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  const voidInfo =
    sale.status === 'VOIDED'
      ? `<p class="void-note">Venta anulada: ${
          sale.voidedAt ? escapeHtml(new Date(sale.voidedAt).toLocaleString('es-CO')) : '-'
        }${sale.voidReason ? ` · Motivo: ${toHtmlText(sale.voidReason)}` : ''}</p>`
      : '';

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Comprobante ${escapeHtml(numberLabel)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { margin: 0; font-family: 'Segoe UI', Tahoma, sans-serif; color: #12213f; font-size: 12px; }
    .sheet { border: 1px solid #b8c7eb; border-radius: 10px; padding: 14px; }
    .head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .title { font-size: 18px; margin: 0; }
    .muted { color: #4b5b79; margin: 2px 0; }
    .meta { text-align: right; }
    .status { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 700; margin-top: 4px; }
    .status-active { color: #0f6a4d; background: rgba(19, 167, 111, 0.17); }
    .status-voided { color: #9b2c2c; background: rgba(197, 48, 48, 0.18); }
    .box { border: 1px solid #d8e3ff; border-radius: 8px; padding: 9px; margin-top: 8px; }
    .box h2 { margin: 0 0 6px 0; font-size: 12px; color: #0a3f9c; text-transform: uppercase; letter-spacing: 0.03em; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d6e1fb; padding: 6px; text-align: left; }
    th { background: #edf3ff; font-size: 11px; }
    td { font-size: 11px; vertical-align: top; word-break: break-word; }
    .totals { margin-top: 8px; display: flex; justify-content: flex-end; }
    .totals table { width: 260px; }
    .totals th, .totals td { font-size: 12px; }
    .totals tr:last-child th, .totals tr:last-child td { font-size: 14px; font-weight: 700; }
    .void-note { color: #9b2c2c; font-weight: 700; margin: 8px 0 0; }
    .foot { margin-top: 10px; color: #4b5b79; font-size: 10px; text-align: center; }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="head">
      <div>
        <h1 class="title">${escapeHtml(BUSINESS_NAME)}</h1>
        <p class="muted">${escapeHtml(BUSINESS_NIT)}</p>
        <p class="muted">${escapeHtml(BUSINESS_ADDRESS)}</p>
        <p class="muted">Tel: ${escapeHtml(BUSINESS_PHONE)}</p>
      </div>
      <div class="meta">
        <p class="muted"><strong>Comprobante:</strong> ${escapeHtml(numberLabel)}</p>
        <p class="muted"><strong>Fecha:</strong> ${escapeHtml(saleDate)}</p>
        <p class="muted"><strong>Pago:</strong> ${escapeHtml(formatPaymentMethod(sale.paymentMethod))}</p>
        <span class="status ${statusClass}">${statusLabel}</span>
      </div>
    </header>

    <section class="box">
      <h2>Cliente y vendedor</h2>
      <table>
        <tbody>
          <tr>
            <th>Cliente</th>
            <td>${escapeHtml(patientName)}</td>
            <th>Documento</th>
            <td>${escapeHtml(patientDocument)}</td>
          </tr>
          <tr>
            <th>Telefono</th>
            <td>${escapeHtml(patientPhone)}</td>
            <th>Vendedor</th>
            <td>${escapeHtml(`${seller} (${sellerRole})`)}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="box">
      <h2>Detalle monturas</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Codigo</th>
            <th>Referencia</th>
            <th>Cant.</th>
            <th>Valor unit.</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${
            frameRows ||
            '<tr><td colspan="6">Sin monturas asociadas a esta venta</td></tr>'
          }
        </tbody>
      </table>
    </section>

    <section class="box">
      <h2>Detalle lentes laboratorio</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Descripcion</th>
            <th>Cant.</th>
            <th>Venta unit.</th>
            <th>Subtotal venta</th>
            <th>Costo lab</th>
          </tr>
        </thead>
        <tbody>
          ${
            lensRows ||
            '<tr><td colspan="6">Sin lentes de laboratorio en esta venta</td></tr>'
          }
        </tbody>
      </table>
      <div class="totals">
        <table>
          <tbody>
            <tr>
              <th>Subtotal monturas</th>
              <td>$${sale.frameSubtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Subtotal lentes</th>
              <td>$${sale.lensSubtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Subtotal</th>
              <td>$${sale.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Descuento (${escapeHtml(discountLabel)})</th>
              <td>-$${sale.discountAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Impuesto (${escapeHtml(taxLabel)})</th>
              <td>$${sale.taxAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Costo laboratorio</th>
              <td>-$${sale.lensCostTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Total</th>
              <td>$${sale.total.toFixed(2)}</td>
            </tr>
            <tr>
              <th>Utilidad estimada</th>
              <td>$${sale.grossProfit.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="box">
      <h2>Observaciones</h2>
      <p>${toHtmlText(notes)}</p>
      ${voidInfo}
    </section>

    <footer class="foot">
      Documento generado por Optica Suite.
    </footer>
  </main>
</body>
</html>`;
}

function buildSalesReportPrintHtml(
  report: SalesSummaryReport,
  generatedBy: string,
): string {
  const generatedAt = new Date().toLocaleString('es-CO');
  const paymentRows = report.byPaymentMethod
    .map(
      (row) => `<tr>
      <td>${escapeHtml(formatPaymentMethod(row.paymentMethod))}</td>
      <td>${row.salesCount}</td>
      <td>$${row.total.toFixed(2)}</td>
    </tr>`,
    )
    .join('');
  const userRows = report.byUser
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(formatRoleLabel(row.role))}</td>
      <td>${row.salesCount}</td>
      <td>$${row.total.toFixed(2)}</td>
      <td>$${row.grossProfit.toFixed(2)}</td>
      <td>${row.marginPercent.toFixed(2)}%</td>
    </tr>`,
    )
    .join('');
  const dayRows = report.dailySeries
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${row.salesCount}</td>
      <td>$${row.total.toFixed(2)}</td>
    </tr>`,
    )
    .join('');
  const patientRows = report.topPatients
    .map(
      (row) => `<tr>
      <td>${escapeHtml(`${row.firstName} ${row.lastName}`)}</td>
      <td>${escapeHtml(row.documentNumber)}</td>
      <td>${row.salesCount}</td>
      <td>$${row.total.toFixed(2)}</td>
      <td>$${row.averageTicket.toFixed(2)}</td>
      <td>${escapeHtml(formatDateTime(row.lastSaleAt))}</td>
    </tr>`,
    )
    .join('');
  const stagnantFrameRows = report.stagnantFrames
    .map(
      (row) => `<tr>
      <td>${escapeHtml(`#${row.codigo} ${row.referencia}`)}</td>
      <td>${row.stockActual}</td>
      <td>${row.soldQty}</td>
      <td>$${row.stockValue.toFixed(2)}</td>
    </tr>`,
    )
    .join('');
  const negativeSalesRows = report.risk.topNegativeSales
    .map(
      (row) => `<tr>
      <td>${escapeHtml(formatSaleNumber(row.saleNumber))}</td>
      <td>${escapeHtml(
        row.patient
          ? `${row.patient.firstName} ${row.patient.lastName} (${row.patient.documentNumber})`
          : 'Sin paciente',
      )}</td>
      <td>${escapeHtml(row.createdBy?.name ?? 'Usuario no disponible')}</td>
      <td>$${row.total.toFixed(2)}</td>
      <td>$${row.grossProfit.toFixed(2)}</td>
      <td>${row.marginPercent.toFixed(2)}%</td>
    </tr>`,
    )
    .join('');
  const voiderRows = report.voided.byVoider
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(formatRoleLabel(row.role))}</td>
      <td>${row.count}</td>
      <td>$${row.totalAmount.toFixed(2)}</td>
      <td>$${row.averageAmount.toFixed(2)}</td>
    </tr>`,
    )
    .join('');
  const voidReasonRows = report.voided.topReasons
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.reason)}</td>
      <td>${row.count}</td>
      <td>$${row.totalAmount.toFixed(2)}</td>
      <td>$${row.averageAmount.toFixed(2)}</td>
    </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte Comercial</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { margin: 0; font-family: 'Segoe UI', Tahoma, sans-serif; color: #12213f; font-size: 12px; }
    .sheet { border: 1px solid #b8c7eb; border-radius: 10px; padding: 14px; }
    .head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .title { font-size: 18px; margin: 0; }
    .muted { color: #4b5b79; margin: 2px 0; }
    .box { border: 1px solid #d8e3ff; border-radius: 8px; padding: 9px; margin-top: 8px; }
    .box h2 { margin: 0 0 6px 0; font-size: 12px; color: #0a3f9c; text-transform: uppercase; letter-spacing: 0.03em; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d6e1fb; padding: 6px; text-align: left; }
    th { background: #edf3ff; font-size: 11px; }
    td { font-size: 11px; vertical-align: top; word-break: break-word; }
    .totals td, .totals th { font-size: 12px; }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="head">
      <div>
        <h1 class="title">${escapeHtml(BUSINESS_NAME)}</h1>
        <p class="muted">Reporte comercial consolidado</p>
        <p class="muted">Periodo: ${escapeHtml(formatDateTime(report.range.from))} - ${escapeHtml(
          formatDateTime(report.range.to),
        )}</p>
      </div>
      <div>
        <p class="muted"><strong>Generado por:</strong> ${escapeHtml(generatedBy)}</p>
        <p class="muted"><strong>Fecha:</strong> ${escapeHtml(generatedAt)}</p>
      </div>
    </header>

    <section class="box">
      <h2>Resumen general</h2>
      <table class="totals">
        <tbody>
          <tr><th>Ventas</th><td>${report.totals.salesCount}</td><th>Ingresos</th><td>$${report.totals.totalRevenue.toFixed(2)}</td></tr>
          <tr><th>Ticket promedio</th><td>$${report.totals.averageTicket.toFixed(2)}</td><th>Items vendidos</th><td>${report.totals.totalItems}</td></tr>
          <tr><th>Pacientes unicos</th><td>${report.totals.uniquePatients}</td><th>Utilidad estimada</th><td>$${report.totals.estimatedGrossProfit.toFixed(2)}</td></tr>
          <tr><th>Venta lentes</th><td>$${report.totals.totalLensRevenue.toFixed(2)}</td><th>Costo lentes</th><td>$${report.totals.totalLensCost.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="box">
      <h2>Comparativo vs periodo anterior</h2>
      <p class="muted">Anterior: ${escapeHtml(formatDateTime(report.previousRange.from))} - ${escapeHtml(
        formatDateTime(report.previousRange.to),
      )}</p>
      <table>
        <thead><tr><th>Indicador</th><th>Actual</th><th>Anterior</th><th>Delta</th><th>Delta %</th></tr></thead>
        <tbody>
          <tr><td>Ventas</td><td>${report.comparison.salesCount.current}</td><td>${report.comparison.salesCount.previous}</td><td>${formatSigned(report.comparison.salesCount.delta, 0)}</td><td>${formatSigned(report.comparison.salesCount.deltaPercent)}%</td></tr>
          <tr><td>Ingresos</td><td>$${report.comparison.totalRevenue.current.toFixed(2)}</td><td>$${report.comparison.totalRevenue.previous.toFixed(2)}</td><td>$${formatSigned(report.comparison.totalRevenue.delta)}</td><td>${formatSigned(report.comparison.totalRevenue.deltaPercent)}%</td></tr>
          <tr><td>Utilidad</td><td>$${report.comparison.grossProfit.current.toFixed(2)}</td><td>$${report.comparison.grossProfit.previous.toFixed(2)}</td><td>$${formatSigned(report.comparison.grossProfit.delta)}</td><td>${formatSigned(report.comparison.grossProfit.deltaPercent)}%</td></tr>
          <tr><td>Ticket promedio</td><td>$${report.comparison.averageTicket.current.toFixed(2)}</td><td>$${report.comparison.averageTicket.previous.toFixed(2)}</td><td>$${formatSigned(report.comparison.averageTicket.delta)}</td><td>${formatSigned(report.comparison.averageTicket.deltaPercent)}%</td></tr>
        </tbody>
      </table>
    </section>

    <section class="box">
      <h2>Por metodo de pago</h2>
      <table>
        <thead><tr><th>Metodo</th><th>Ventas</th><th>Total</th></tr></thead>
        <tbody>${paymentRows || '<tr><td colspan="3">Sin datos</td></tr>'}</tbody>
      </table>
    </section>

    <section class="box">
      <h2>Rendimiento por usuario</h2>
      <table>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Ventas</th><th>Total</th><th>Utilidad</th><th>Margen</th></tr></thead>
        <tbody>${userRows || '<tr><td colspan="6">Sin datos</td></tr>'}</tbody>
      </table>
    </section>

    <section class="box">
      <h2>Rendimiento laboratorio</h2>
      <table class="totals">
        <tbody>
          <tr><th>Total ordenes</th><td>${report.lab.totalOrders}</td><th>Vencidas abiertas</th><td>${report.lab.overdueOpenOrders}</td></tr>
          <tr><th>Pendientes</th><td>${report.lab.pendingOrders}</td><th>Enviadas</th><td>${report.lab.sentToLabOrders}</td></tr>
          <tr><th>Recibidas</th><td>${report.lab.receivedOrders}</td><th>Entregadas</th><td>${report.lab.deliveredOrders}</td></tr>
          <tr><th>A tiempo</th><td>${report.lab.onTimeDeliveries}</td><th>Tarde</th><td>${report.lab.lateDeliveries}</td></tr>
          <tr><th>% cumplimiento</th><td>${report.lab.onTimeDeliveryRate.toFixed(2)}%</td><th>Canceladas</th><td>${report.lab.cancelledOrders}</td></tr>
          <tr><th>Prom. dias envio-recepcion</th><td>${report.lab.avgDaysSentToReceived.toFixed(2)}</td><th>Prom. dias envio-entrega</th><td>${report.lab.avgDaysSentToDelivered.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="box">
      <h2>Anulaciones</h2>
      <table class="totals">
        <tbody>
          <tr><th>Cantidad</th><td>${report.voided.count}</td><th>Total anulado</th><td>$${report.voided.totalAmount.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Usuario anulador</th><th>Rol</th><th>Anulaciones</th><th>Total</th><th>Promedio</th></tr></thead>
        <tbody>${voiderRows || '<tr><td colspan="5">Sin datos</td></tr>'}</tbody>
      </table>
      <table>
        <thead><tr><th>Motivo</th><th>Cantidad</th><th>Total</th><th>Promedio</th></tr></thead>
        <tbody>${voidReasonRows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody>
      </table>
    </section>

    <section class="box">
      <h2>Inventario inmovilizado</h2>
      <table>
        <thead><tr><th>Montura</th><th>Stock</th><th>Vendidas</th><th>Valor inmovilizado</th></tr></thead>
        <tbody>${stagnantFrameRows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody>
      </table>
    </section>

    <section class="box">
      <h2>Riesgo comercial (margen negativo)</h2>
      <table class="totals">
        <tbody>
          <tr><th>Ventas en riesgo</th><td>${report.risk.negativeMarginSalesCount}</td><th>Perdida estimada</th><td>$${report.risk.negativeMarginTotalLoss.toFixed(2)}</td></tr>
          <tr><th>Exposicion ingresos</th><td>$${report.risk.negativeMarginRevenueExposure.toFixed(2)}</td><th></th><td></td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Venta</th><th>Paciente</th><th>Vendedor</th><th>Total</th><th>Utilidad</th><th>Margen</th></tr></thead>
        <tbody>${negativeSalesRows || '<tr><td colspan="6">Sin ventas con margen negativo</td></tr>'}</tbody>
      </table>
    </section>

    <section class="box">
      <h2>Serie diaria</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Ventas</th><th>Total</th></tr></thead>
        <tbody>${dayRows || '<tr><td colspan="3">Sin datos</td></tr>'}</tbody>
      </table>
    </section>

    <section class="box">
      <h2>Top pacientes recurrentes</h2>
      <table>
        <thead><tr><th>Paciente</th><th>Documento</th><th>Ventas</th><th>Total</th><th>Ticket</th><th>Ultima compra</th></tr></thead>
        <tbody>${patientRows || '<tr><td colspan="6">Sin datos</td></tr>'}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
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
  const [trustDeviceOnThisBrowser, setTrustDeviceOnThisBrowser] = useState(true);
  const [deviceFingerprint] = useState(() => getOrCreateDeviceFingerprint());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorUseRecoveryCode, setTwoFactorUseRecoveryCode] = useState(false);
  const [twoFactorRecoveryCode, setTwoFactorRecoveryCode] = useState('');
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
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatusResponse | null>(
    null,
  );
  const [twoFactorSetupData, setTwoFactorSetupData] = useState<TwoFactorSetupResponse | null>(
    null,
  );
  const [twoFactorSetupQrDataUrl, setTwoFactorSetupQrDataUrl] = useState('');
  const [twoFactorSetupCode, setTwoFactorSetupCode] = useState('');
  const [twoFactorGeneratedRecoveryCodes, setTwoFactorGeneratedRecoveryCodes] = useState<
    string[]
  >([]);
  const [twoFactorActionLoading, setTwoFactorActionLoading] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState('');

  const inactivityTimeoutRef = useRef<number | null>(null);
  const inactivityWarningRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const otpauthUrl = twoFactorSetupData?.otpauthUrl?.trim() ?? '';

    if (!otpauthUrl) {
      setTwoFactorSetupQrDataUrl('');
      return;
    }

    void QRCode.toDataURL(otpauthUrl, {
      width: 216,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl: string) => {
        if (!cancelled) {
          setTwoFactorSetupQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTwoFactorSetupQrDataUrl('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [twoFactorSetupData]);

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
  const [labOnlyOverdue, setLabOnlyOverdue] = useState(false);

  const [salePatientId, setSalePatientId] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState('CASH');
  const [saleDiscountType, setSaleDiscountType] = useState<
    'NONE' | 'PERCENT' | 'AMOUNT'
  >('NONE');
  const [saleDiscountValue, setSaleDiscountValue] = useState('0');
  const [saleTaxPercent, setSaleTaxPercent] = useState('0');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleItems, setSaleItems] = useState<SaleItemDraft[]>([
    { frameId: '', quantity: 1 },
  ]);
  const [saleLensItems, setSaleLensItems] = useState<SaleLensItemDraft[]>([
    {
      labOrderId: '',
      description: '',
      quantity: 1,
      unitSalePrice: '0',
      unitLabCost: '0',
    },
  ]);
  const [saleSaving, setSaleSaving] = useState(false);
  const [saleVoidingId, setSaleVoidingId] = useState('');
  const [salePrintingId, setSalePrintingId] = useState('');
  const [saleMessage, setSaleMessage] = useState('');
  const [salesStatusFilter, setSalesStatusFilter] = useState('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('');
  const [salesCreatedByFilter, setSalesCreatedByFilter] = useState('');
  const [salesOnlyNegativeMargin, setSalesOnlyNegativeMargin] = useState(false);
  const [salesFromDate, setSalesFromDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return formatInputDate(start);
  });
  const [salesToDate, setSalesToDate] = useState(() => formatInputDate(new Date()));

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
  const [cashDailySummary, setCashDailySummary] = useState<CashDailySummaryReport | null>(
    null,
  );

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
  const [reportCreatedByFilter, setReportCreatedByFilter] = useState('');
  const [reportPaymentFilter, setReportPaymentFilter] = useState('');

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

  const saleFrameSubtotal = useMemo(() => {
    return saleItems.reduce((sum, item) => {
      const frame = frameMap.get(item.frameId);
      if (!frame) return sum;
      return sum + frame.precioVenta * item.quantity;
    }, 0);
  }, [frameMap, saleItems]);

  const saleLensSubtotal = useMemo(() => {
    return saleLensItems.reduce((sum, item) => {
      const unitSale = Number.parseFloat(item.unitSalePrice || '0');
      if (!Number.isFinite(unitSale) || unitSale < 0) return sum;
      return sum + unitSale * item.quantity;
    }, 0);
  }, [saleLensItems]);

  const saleLensCostPreview = useMemo(() => {
    return saleLensItems.reduce((sum, item) => {
      const unitCost = Number.parseFloat(item.unitLabCost || '0');
      if (!Number.isFinite(unitCost) || unitCost < 0) return sum;
      return sum + unitCost * item.quantity;
    }, 0);
  }, [saleLensItems]);

  const salePreview = useMemo(() => {
    const discountValue = Number.parseFloat(saleDiscountValue || '0');
    const taxPercent = Number.parseFloat(saleTaxPercent || '0');
    return calculateSalePreview(
      saleFrameSubtotal + saleLensSubtotal,
      saleDiscountType,
      Number.isFinite(discountValue) ? discountValue : 0,
      Number.isFinite(taxPercent) ? taxPercent : 0,
    );
  }, [
    saleFrameSubtotal,
    saleLensSubtotal,
    saleDiscountType,
    saleDiscountValue,
    saleTaxPercent,
  ]);

  const labVisibleOrders = useMemo(() => {
    if (!labOnlyOverdue) return labOrders;
    return labOrders.filter((order) => isLabOrderOverdue(order));
  }, [labOrders, labOnlyOverdue]);

  const labSummary = useMemo(() => {
    return labOrders.reduce(
      (acc, order) => {
        acc.total += 1;
        if (order.status === 'PENDING') acc.pending += 1;
        if (order.status === 'SENT_TO_LAB') acc.sent += 1;
        if (order.status === 'RECEIVED') acc.received += 1;
        if (order.status === 'DELIVERED') acc.delivered += 1;
        if (order.status === 'CANCELLED') acc.cancelled += 1;
        if (isLabOrderOverdue(order)) acc.overdue += 1;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        sent: 0,
        received: 0,
        delivered: 0,
        cancelled: 0,
        overdue: 0,
      },
    );
  }, [labOrders]);

  const salesSummary = useMemo(() => {
    return sales.reduce(
      (acc, sale) => {
        if (sale.status === 'VOIDED') {
          acc.voidedCount += 1;
          acc.voidedTotal += sale.total;
          return acc;
        }
        acc.activeCount += 1;
        acc.activeTotal += sale.total;
        acc.estimatedProfit += sale.grossProfit;
        if (sale.grossProfit < 0) {
          acc.negativeMarginCount += 1;
          acc.negativeMarginTotal += sale.grossProfit;
        }
        return acc;
      },
      {
        activeCount: 0,
        activeTotal: 0,
        voidedCount: 0,
        voidedTotal: 0,
        estimatedProfit: 0,
        negativeMarginCount: 0,
        negativeMarginTotal: 0,
      },
    );
  }, [sales]);

  const salesVisibleList = useMemo(() => {
    if (!salesOnlyNegativeMargin) return sales;
    return sales.filter((sale) => sale.status === 'ACTIVE' && sale.grossProfit < 0);
  }, [sales, salesOnlyNegativeMargin]);

  const reportOperationalAlerts = useMemo<OperationalAlert[]>(() => {
    if (!reportData) return [];

    const alerts: OperationalAlert[] = [];

    if (reportData.risk.negativeMarginSalesCount > 0) {
      alerts.push({
        id: 'negative-margin',
        severity: 'HIGH',
        title: 'Ventas con margen negativo',
        detail: `${reportData.risk.negativeMarginSalesCount} ventas en riesgo. Perdida estimada: $${reportData.risk.negativeMarginTotalLoss.toFixed(2)}.`,
      });
    }

    if (reportData.lab.overdueOpenOrders > 0) {
      alerts.push({
        id: 'lab-overdue',
        severity: reportData.lab.overdueOpenOrders >= 4 ? 'HIGH' : 'MEDIUM',
        title: 'Ordenes de laboratorio vencidas',
        detail: `${reportData.lab.overdueOpenOrders} ordenes abiertas fuera de promesa.`,
      });
    }

    if (reportData.voided.count > 0) {
      alerts.push({
        id: 'voided-sales',
        severity: reportData.voided.count >= 3 ? 'MEDIUM' : 'LOW',
        title: 'Anulaciones en el periodo',
        detail: `${reportData.voided.count} anulaciones por $${reportData.voided.totalAmount.toFixed(2)}.`,
      });
    }

    if (reportData.stagnantFrames.length > 0) {
      const topStagnant = reportData.stagnantFrames[0];
      alerts.push({
        id: 'stagnant-stock',
        severity: 'LOW',
        title: 'Inventario inmovilizado',
        detail: `${reportData.stagnantFrames.length} monturas sin rotacion. Mayor valor: #${topStagnant.codigo} (${topStagnant.referencia}) por $${topStagnant.stockValue.toFixed(2)}.`,
      });
    }

    if (reportData.comparison.totalRevenue.deltaPercent <= -15) {
      alerts.push({
        id: 'revenue-drop',
        severity: 'MEDIUM',
        title: 'Caida de ingresos vs periodo anterior',
        detail: `Variacion de ingresos: ${formatSigned(reportData.comparison.totalRevenue.deltaPercent)}%.`,
      });
    }

    if (
      reportData.lab.deliveredOrders > 0 &&
      reportData.lab.onTimeDeliveryRate < 80
    ) {
      alerts.push({
        id: 'lab-sla',
        severity: 'MEDIUM',
        title: 'Cumplimiento bajo de laboratorio',
        detail: `Cumplimiento de entrega: ${reportData.lab.onTimeDeliveryRate.toFixed(2)}%.`,
      });
    }

    return alerts;
  }, [reportData]);

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
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setSessionWarning('');
    setSales([]);
    setLabOrders([]);
    setCashClosures([]);
    setCashDailySummary(null);
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
    setTwoFactorChallengeToken('');
    setTwoFactorCode('');
    setTwoFactorUseRecoveryCode(false);
    setTwoFactorRecoveryCode('');
    setTwoFactorStatus(null);
    setTwoFactorSetupData(null);
    setTwoFactorSetupQrDataUrl('');
    setTwoFactorSetupCode('');
    setTwoFactorGeneratedRecoveryCodes([]);
    setTwoFactorMessage('');
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
      const params = new URLSearchParams();
      if (salesFromDate) params.set('fromDate', salesFromDate);
      if (salesToDate) params.set('toDate', salesToDate);
      if (salesStatusFilter) params.set('status', salesStatusFilter);
      if (salesPaymentFilter) params.set('paymentMethod', salesPaymentFilter);
      if (canManageUsers && salesCreatedByFilter) {
        params.set('createdById', salesCreatedByFilter);
      }
      const salesQuery = params.toString();

      const response = await apiRequest<Sale[]>(
        salesQuery ? `/sales?${salesQuery}` : '/sales',
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
  }, [
    token,
    canCreateSale,
    salesFromDate,
    salesToDate,
    salesStatusFilter,
    salesPaymentFilter,
    canManageUsers,
    salesCreatedByFilter,
    handleUnauthorized,
    markTabSynced,
  ]);

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
      const listParams = new URLSearchParams({
        page: '1',
        limit: '40',
      });
      const summaryParams = new URLSearchParams();
      if (cashFromDate) {
        listParams.set('fromDate', cashFromDate);
        summaryParams.set('fromDate', cashFromDate);
      }
      if (cashToDate) {
        listParams.set('toDate', cashToDate);
        summaryParams.set('toDate', cashToDate);
      }
      if (canManageUsers && cashUserId) {
        listParams.set('userId', cashUserId);
        summaryParams.set('userId', cashUserId);
      }

      const [response, dailySummaryResponse] = await Promise.all([
        apiRequest<ApiListResponse<CashClosure>>(
          `/cash-closures?${listParams.toString()}`,
          { method: 'GET' },
          token,
        ),
        apiRequest<CashDailySummaryReport>(
          `/cash-closures/daily-summary?${summaryParams.toString()}`,
          { method: 'GET' },
          token,
        ),
      ]);

      setCashClosures(response.data);
      setCashDailySummary(dailySummaryResponse);
      setCashMessage(
        `Cierres cargados: ${response.count} de ${response.total}. Dias consolidados: ${dailySummaryResponse.totals.days}.`,
      );
      markTabSynced('cash');
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Error al cargar cierres de caja';
      setCashError(message);
      setCashDailySummary(null);
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
          body: JSON.stringify({}),
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

  const loadTwoFactorStatus = useCallback(async () => {
    if (!token || !user || user.role !== 'ADMIN') return;
    try {
      const response = await apiRequest<TwoFactorStatusResponse>(
        '/auth/2fa/status',
        { method: 'POST' },
        token,
      );
      setTwoFactorStatus(response);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      setTwoFactorMessage(
        error instanceof Error ? error.message : 'No se pudo consultar estado 2FA',
      );
    }
  }, [token, user, handleUnauthorized]);

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
      if (reportCreatedByFilter) params.set('createdById', reportCreatedByFilter);
      if (reportPaymentFilter) params.set('paymentMethod', reportPaymentFilter);

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
  }, [
    token,
    canViewReports,
    reportFrom,
    reportTo,
    reportCreatedByFilter,
    reportPaymentFilter,
    handleUnauthorized,
    markTabSynced,
  ]);

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
        if (user?.role === 'ADMIN') {
          void loadTwoFactorStatus();
        }
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
    loadTwoFactorStatus,
    loadUsers,
    patientQuery,
    user,
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
      if (user?.role === 'ADMIN') {
        void loadTwoFactorStatus();
      }
    }
  }, [activeTab, user, loadSessions, loadTwoFactorStatus]);

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
      const payload: {
        email: string;
        password: string;
        deviceFingerprint: string;
        trustDevice?: boolean;
        twoFactorChallengeToken?: string;
        twoFactorCode?: string;
        twoFactorRecoveryCode?: string;
      } = {
        email: normalizedEmail,
        password: normalizedPassword,
        deviceFingerprint,
      };
      if (twoFactorChallengeToken) {
        payload.twoFactorChallengeToken = twoFactorChallengeToken;
        if (twoFactorUseRecoveryCode) {
          payload.twoFactorRecoveryCode = twoFactorRecoveryCode.trim();
        } else {
          payload.twoFactorCode = twoFactorCode.replace(/\s+/g, '').trim();
        }
        payload.trustDevice = trustDeviceOnThisBrowser;
      }

      const response = await apiRequest<AuthLoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if ('requiresTwoFactor' in response && response.requiresTwoFactor) {
        setTwoFactorChallengeToken(response.twoFactorChallengeToken);
        setTwoFactorCode('');
        setTwoFactorUseRecoveryCode(false);
        setTwoFactorRecoveryCode('');
        setAuthError(response.message);
        return;
      }
      if (!('accessToken' in response)) {
        setAuthError('No se pudo validar el segundo factor.');
        return;
      }

      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      setToken(response.accessToken);
      setUser(response.user);
      setPassword('');
      setTwoFactorChallengeToken('');
      setTwoFactorCode('');
      setTwoFactorUseRecoveryCode(false);
      setTwoFactorRecoveryCode('');
      setAuthError('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message === '__UNAUTHORIZED__'
            ? twoFactorChallengeToken
              ? 'Codigo de verificacion invalido o expirado. Inicia sesion nuevamente.'
              : 'Credenciales invalidas. Verifica correo y contraseña.'
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

  const updateSaleLensItem = (
    index: number,
    field: keyof SaleLensItemDraft,
    value: string,
  ) => {
    setSaleLensItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        if (field === 'quantity') {
          const next = Number(value);
          return {
            ...item,
            quantity: Number.isFinite(next) ? Math.max(1, next) : 1,
          };
        }

        if (field === 'labOrderId') {
          const selectedLabOrder = labOrders.find((order) => order.id === value);
          if (!selectedLabOrder) {
            return { ...item, labOrderId: '' };
          }
          const patientLabel = selectedLabOrder.patient
            ? `${selectedLabOrder.patient.firstName} ${selectedLabOrder.patient.lastName}`
            : 'Paciente';
          return {
            ...item,
            labOrderId: value,
            description:
              item.description.trim() ||
              `Lente ${selectedLabOrder.reference} (${patientLabel})`,
          };
        }

        return { ...item, [field]: value };
      }),
    );
  };

  const addSaleLensItem = () => {
    setSaleLensItems((current) => [
      ...current,
      {
        labOrderId: '',
        description: '',
        quantity: 1,
        unitSalePrice: '0',
        unitLabCost: '0',
      },
    ]);
  };

  const removeSaleLensItem = (index: number) => {
    setSaleLensItems((current) => {
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

    let normalizedLensItems: Array<{
      labOrderId?: string;
      description: string;
      quantity: number;
      unitSalePrice: number;
      unitLabCost: number;
    }> = [];
    try {
      normalizedLensItems = saleLensItems
        .filter(
          (item) =>
            item.description.trim() ||
            Number.parseFloat(item.unitSalePrice || '0') > 0 ||
            Number.parseFloat(item.unitLabCost || '0') > 0,
        )
        .map((item, index) => {
          const description = item.description.trim();
          const unitSalePrice = Number.parseFloat(item.unitSalePrice || '0');
          const unitLabCost = Number.parseFloat(item.unitLabCost || '0');
          if (!description) {
            throw new Error(`El lente ${index + 1} debe tener descripcion.`);
          }
          if (!Number.isFinite(unitSalePrice) || unitSalePrice < 0) {
            throw new Error(
              `El precio de venta del lente ${index + 1} no es valido.`,
            );
          }
          if (!Number.isFinite(unitLabCost) || unitLabCost < 0) {
            throw new Error(
              `El costo lab del lente ${index + 1} no es valido.`,
            );
          }
          return {
            labOrderId: item.labOrderId || undefined,
            description,
            quantity: item.quantity,
            unitSalePrice,
            unitLabCost,
          };
        });
    } catch (parseError) {
      const message =
        parseError instanceof Error
          ? parseError.message
          : 'Hay un error en los lentes de laboratorio';
      setSaleMessage(message);
      return;
    }

    if (!normalizedItems.length && !normalizedLensItems.length) {
      setSaleMessage(
        'Agrega al menos una montura o un lente de laboratorio para registrar la venta.',
      );
      return;
    }

    const discountValue = Number.parseFloat(saleDiscountValue || '0');
    const taxPercent = Number.parseFloat(saleTaxPercent || '0');
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      setSaleMessage('El descuento debe ser un numero mayor o igual a 0.');
      return;
    }
    if (saleDiscountType === 'PERCENT' && discountValue > 100) {
      setSaleMessage('El descuento porcentual no puede superar 100%.');
      return;
    }
    if (saleDiscountType === 'AMOUNT' && discountValue > salePreview.subtotal) {
      setSaleMessage('El descuento en valor no puede ser mayor al subtotal.');
      return;
    }
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
      setSaleMessage('El impuesto debe estar entre 0 y 100.');
      return;
    }

    setSaleSaving(true);
    setSaleMessage('');

    try {
      const createdSale = await apiRequest<Sale>(
        '/sales',
        {
          method: 'POST',
          body: JSON.stringify({
            patientId: salePatientId || undefined,
            paymentMethod: salePaymentMethod,
            discountType: saleDiscountType,
            discountValue,
            taxPercent,
            notes: saleNotes.trim() || undefined,
            items: normalizedItems,
            lensItems: normalizedLensItems,
          }),
        },
        token,
      );

      setSaleItems([{ frameId: '', quantity: 1 }]);
      setSaleLensItems([
        {
          labOrderId: '',
          description: '',
          quantity: 1,
          unitSalePrice: '0',
          unitLabCost: '0',
        },
      ]);
      setSaleNotes('');
      setSalePatientId('');
      setSalePaymentMethod('CASH');
      setSaleDiscountType('NONE');
      setSaleDiscountValue('0');
      setSaleTaxPercent('0');
      setSaleMessage(
        `Venta ${formatSaleNumber(createdSale.saleNumber)} registrada correctamente.`,
      );

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

  const handlePrintSaleReceipt = async (sale: Sale) => {
    if (!token) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setSaleMessage(
        'No se pudo abrir la ventana de impresion. Habilita ventanas emergentes.',
      );
      return;
    }

    setSalePrintingId(sale.id);
    setSaleMessage('');
    try {
      const saleDetail = await apiRequest<Sale>(
        `/sales/${sale.id}`,
        { method: 'GET' },
        token,
      );
      const html = buildSaleReceiptHtml(saleDetail);
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
        handleUnauthorized();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo generar el comprobante de venta';
      setSaleMessage(message);
    } finally {
      setSalePrintingId('');
    }
  };

  const handleVoidSale = async (sale: Sale) => {
    if (!token || sale.status === 'VOIDED') return;
    const reasonInput = window.prompt(
      `Motivo de anulacion para la venta ${formatSaleNumber(sale.saleNumber)}:`,
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
      try {
        await apiRequest(
          '/auth/logout',
          {
            method: 'POST',
            body: JSON.stringify({}),
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

  const handleStartTwoFactorSetup = async () => {
    if (!token || !user || user.role !== 'ADMIN') return;
    setTwoFactorActionLoading(true);
    setTwoFactorMessage('');
    setTwoFactorGeneratedRecoveryCodes([]);
    try {
      const response = await apiRequest<TwoFactorSetupResponse>(
        '/auth/2fa/setup',
        {
          method: 'POST',
        },
        token,
      );
      setTwoFactorSetupData(response);
      setTwoFactorSetupCode('');
      setTwoFactorMessage(response.message);
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      setTwoFactorMessage(
        error instanceof Error ? error.message : 'No se pudo preparar 2FA',
      );
    } finally {
      setTwoFactorActionLoading(false);
    }
  };

  const handleEnableTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !user || user.role !== 'ADMIN') return;
    const code = twoFactorSetupCode.replace(/\s+/g, '').trim();
    if (!code) {
      setTwoFactorMessage('Ingresa el codigo de 6 digitos de tu autenticador.');
      return;
    }
    setTwoFactorActionLoading(true);
    setTwoFactorMessage('');
    try {
      const response = await apiRequest<{
        success: boolean;
        message: string;
        recoveryCodes?: string[];
      }>(
        '/auth/2fa/enable',
        {
          method: 'POST',
          body: JSON.stringify({ code }),
        },
        token,
      );
      setTwoFactorMessage(response.message);
      setTwoFactorSetupData(null);
      setTwoFactorSetupCode('');
      const recoveryCodes = response.recoveryCodes ?? [];
      setTwoFactorGeneratedRecoveryCodes(recoveryCodes);
      if (recoveryCodes.length) {
        handleDownloadRecoveryCodes(recoveryCodes);
      }
      setUser((current) =>
        current ? { ...current, twoFactorEnabled: true } : current,
      );
      await loadTwoFactorStatus();
      await loadSessions();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      setTwoFactorMessage(
        error instanceof Error ? error.message : 'No se pudo activar 2FA',
      );
    } finally {
      setTwoFactorActionLoading(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!token || !user || user.role !== 'ADMIN') return;
    const code = window
      .prompt('Confirma con tu codigo 2FA actual (6 digitos):', '')
      ?.replace(/\s+/g, '')
      .trim();
    if (!code) return;

    setTwoFactorActionLoading(true);
    setTwoFactorMessage('');
    try {
      const response = await apiRequest<{ success: boolean; message: string }>(
        '/auth/2fa/disable',
        {
          method: 'POST',
          body: JSON.stringify({ code }),
        },
        token,
      );
      setTwoFactorMessage(response.message);
      setTwoFactorSetupData(null);
      setTwoFactorSetupCode('');
      setTwoFactorGeneratedRecoveryCodes([]);
      setUser((current) =>
        current ? { ...current, twoFactorEnabled: false } : current,
      );
      await loadTwoFactorStatus();
      await loadSessions();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      setTwoFactorMessage(
        error instanceof Error ? error.message : 'No se pudo desactivar 2FA',
      );
    } finally {
      setTwoFactorActionLoading(false);
    }
  };

  const handleDownloadRecoveryCodes = useCallback((codes: string[]) => {
    if (!codes.length) return;
    const content = [
      'Codigos de recuperacion 2FA - Optica Suite',
      `Generados: ${new Date().toLocaleString()}`,
      '',
      ...codes.map((code, index) => `${index + 1}. ${code}`),
      '',
      'Cada codigo es de un solo uso. Guardalos en un lugar seguro.',
    ].join('\n');
    downloadTextFile(
      content,
      `codigos-recuperacion-2fa-${new Date().toISOString().slice(0, 10)}.txt`,
    );
  }, []);

  const handleRegenerateRecoveryCodes = async () => {
    if (!token || !user || user.role !== 'ADMIN') return;
    const code = window
      .prompt('Confirma con tu codigo 2FA actual (6 digitos):', '')
      ?.replace(/\s+/g, '')
      .trim();
    if (!code) return;

    setTwoFactorActionLoading(true);
    setTwoFactorMessage('');
    try {
      const response = await apiRequest<{
        success: boolean;
        message: string;
        recoveryCodes?: string[];
      }>(
        '/auth/2fa/recovery-codes/regenerate',
        {
          method: 'POST',
          body: JSON.stringify({ code }),
        },
        token,
      );
      const codes = response.recoveryCodes ?? [];
      setTwoFactorGeneratedRecoveryCodes(codes);
      setTwoFactorMessage(response.message);
      if (codes.length) {
        handleDownloadRecoveryCodes(codes);
      }
      await loadTwoFactorStatus();
    } catch (error) {
      if (error instanceof Error && error.message === '__UNAUTHORIZED__') {
        handleUnauthorized();
        return;
      }
      setTwoFactorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudieron regenerar los codigos de recuperacion',
      );
    } finally {
      setTwoFactorActionLoading(false);
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

  const handleExportCashCsv = () => {
    if (!cashClosures.length && (!cashDailySummary || !cashDailySummary.rows.length)) {
      setCashMessage('No hay datos de caja para exportar.');
      return;
    }

    const headers = [
      'Seccion',
      'Fecha',
      'Usuario',
      'PeriodoDesde',
      'PeriodoHasta',
      'Ventas',
      'Total',
      'Esperado',
      'Declarado',
      'Diferencia',
      'Notas',
    ];
    const lines: string[] = [];

    if (cashDailySummary) {
      for (const row of cashDailySummary.rows) {
        lines.push(
          [
            'ResumenDiario',
            row.date,
            '',
            '',
            '',
            row.activeSalesCount,
            row.activeSalesTotal.toFixed(2),
            row.expectedCash.toFixed(2),
            row.declaredCash.toFixed(2),
            row.closureDifference.toFixed(2),
            `anuladas=${row.voidedSalesCount};utilidad=${row.estimatedProfit.toFixed(2)}`,
          ]
            .map((value) => toCsvCell(value))
            .join(','),
        );
      }
    }

    for (const closure of cashClosures) {
      lines.push(
        [
          'Cierre',
          closure.createdAt,
          closure.user ? `${closure.user.name} (${closure.user.email})` : closure.userId,
          closure.periodStart,
          closure.periodEnd,
          closure.salesCount,
          closure.totalSales.toFixed(2),
          closure.expectedCash.toFixed(2),
          closure.declaredCash.toFixed(2),
          closure.difference.toFixed(2),
          closure.notes ?? '',
        ]
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }

    const content = [headers.map((header) => toCsvCell(header)).join(','), ...lines].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cierres-caja-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setCashMessage('CSV de caja exportado correctamente.');
  };

  const handleExportSalesCsv = () => {
    if (!salesVisibleList.length) {
      setSaleMessage('No hay ventas para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'Venta',
      'Estado',
      'Fecha',
      'Paciente',
      'Vendedor',
      'Pago',
      'SubtotalMonturas',
      'SubtotalLentes',
      'Total',
      'Utilidad',
      'MargenPct',
      'MotivoAnulacion',
    ];
    const lines = salesVisibleList.map((sale) =>
      [
        formatSaleNumber(sale.saleNumber),
        sale.status,
        sale.createdAt,
        sale.patient
          ? `${sale.patient.firstName} ${sale.patient.lastName}${sale.patient.documentNumber ? ` (${sale.patient.documentNumber})` : ''}`
          : 'Sin paciente',
        sale.createdBy ? `${sale.createdBy.name} (${sale.createdBy.email})` : 'Usuario no disponible',
        sale.paymentMethod,
        sale.frameSubtotal.toFixed(2),
        sale.lensSubtotal.toFixed(2),
        sale.total.toFixed(2),
        sale.grossProfit.toFixed(2),
        sale.total ? ((sale.grossProfit * 100) / sale.total).toFixed(2) : '0.00',
        sale.voidReason ?? '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );

    const content = [headers.map((header) => toCsvCell(header)).join(','), ...lines].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ventas-filtradas-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSaleMessage('CSV de ventas exportado correctamente.');
  };

  const handleExportLabCsv = () => {
    if (!labVisibleOrders.length) {
      setLabOrderMessage('No hay ordenes de laboratorio para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'Referencia',
      'Estado',
      'Paciente',
      'Promesa',
      'Vencida',
      'DiasVencida',
      'Laboratorio',
      'Responsable',
      'Creada',
      'Actualizada',
    ];
    const lines = labVisibleOrders.map((order) => {
      const overdue = isLabOrderOverdue(order);
      const delay = overdue ? getLabOrderDelayDays(order) : 0;
      return [
        order.reference,
        order.status,
        order.patient
          ? `${order.patient.firstName} ${order.patient.lastName} (${order.patient.documentNumber})`
          : 'Paciente no disponible',
        order.promisedDate ?? '',
        overdue ? 'SI' : 'NO',
        delay,
        order.labName ?? '',
        order.responsible ?? '',
        order.createdAt,
        order.updatedAt,
      ]
        .map((value) => toCsvCell(value))
        .join(',');
    });

    const content = [headers.map((header) => toCsvCell(header)).join(','), ...lines].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ordenes-laboratorio-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setLabOrderMessage('CSV de laboratorio exportado correctamente.');
  };

  const handleExportReportCsv = () => {
    if (!reportData) {
      setReportError('No hay reporte cargado para exportar.');
      return;
    }

    const headers = [
      'Seccion',
      'Dimension',
      'SubDimension',
      'Cantidad',
      'Valor1',
      'Valor2',
      'Valor3',
      'Valor4',
    ];
    const lines: string[] = [];
    lines.push(
      ['Resumen', 'Rango', '-', reportData.totals.salesCount, reportData.range.from, reportData.range.to, '', '']
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      ['Resumen', 'Totales', '-', reportData.totals.totalItems, reportData.totals.totalRevenue.toFixed(2), reportData.totals.averageTicket.toFixed(2), reportData.totals.estimatedGrossProfit.toFixed(2), '']
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      ['Resumen', 'Lentes', '-', reportData.totals.uniquePatients, reportData.totals.totalLensRevenue.toFixed(2), reportData.totals.totalLensCost.toFixed(2), '', '']
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Riesgo',
        'MargenNegativo',
        '-',
        reportData.risk.negativeMarginSalesCount,
        reportData.risk.negativeMarginTotalLoss.toFixed(2),
        reportData.risk.negativeMarginRevenueExposure.toFixed(2),
        '',
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Comparativo',
        'RangoAnterior',
        '-',
        '',
        reportData.previousRange.from,
        reportData.previousRange.to,
        '',
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Comparativo',
        'Ventas',
        '-',
        reportData.comparison.salesCount.current,
        reportData.comparison.salesCount.previous,
        reportData.comparison.salesCount.delta,
        reportData.comparison.salesCount.deltaPercent.toFixed(2),
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Comparativo',
        'Ingresos',
        '-',
        reportData.comparison.totalRevenue.current.toFixed(2),
        reportData.comparison.totalRevenue.previous.toFixed(2),
        reportData.comparison.totalRevenue.delta.toFixed(2),
        reportData.comparison.totalRevenue.deltaPercent.toFixed(2),
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Comparativo',
        'Utilidad',
        '-',
        reportData.comparison.grossProfit.current.toFixed(2),
        reportData.comparison.grossProfit.previous.toFixed(2),
        reportData.comparison.grossProfit.delta.toFixed(2),
        reportData.comparison.grossProfit.deltaPercent.toFixed(2),
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Comparativo',
        'TicketPromedio',
        '-',
        reportData.comparison.averageTicket.current.toFixed(2),
        reportData.comparison.averageTicket.previous.toFixed(2),
        reportData.comparison.averageTicket.delta.toFixed(2),
        reportData.comparison.averageTicket.deltaPercent.toFixed(2),
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Laboratorio',
        'Cumplimiento',
        '-',
        reportData.lab.totalOrders,
        reportData.lab.onTimeDeliveryRate.toFixed(2),
        reportData.lab.overdueOpenOrders,
        reportData.lab.onTimeDeliveries,
        reportData.lab.lateDeliveries,
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Laboratorio',
        'Estados',
        '-',
        reportData.lab.pendingOrders,
        reportData.lab.sentToLabOrders,
        reportData.lab.receivedOrders,
        reportData.lab.deliveredOrders,
        reportData.lab.cancelledOrders,
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Laboratorio',
        'Tiempos',
        '-',
        '',
        reportData.lab.avgDaysSentToReceived.toFixed(2),
        reportData.lab.avgDaysSentToDelivered.toFixed(2),
        '',
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    lines.push(
      [
        'Anulaciones',
        'Totales',
        '-',
        reportData.voided.count,
        reportData.voided.totalAmount.toFixed(2),
        '',
        '',
        '',
      ]
        .map((value) => toCsvCell(value))
        .join(','),
    );
    for (const row of reportData.voided.byVoider) {
      lines.push(
        [
          'Anulaciones',
          'PorUsuario',
          row.name,
          row.count,
          row.totalAmount.toFixed(2),
          row.averageAmount.toFixed(2),
          row.role,
          row.email,
        ]
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }
    for (const row of reportData.voided.topReasons) {
      lines.push(
        [
          'Anulaciones',
          'Motivo',
          row.reason,
          row.count,
          row.totalAmount.toFixed(2),
          row.averageAmount.toFixed(2),
          '',
          '',
        ]
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }
    for (const row of reportData.risk.topNegativeSales) {
      lines.push(
        [
          'Riesgo',
          'VentaNegativa',
          formatSaleNumber(row.saleNumber),
          row.createdBy?.name ?? 'Usuario no disponible',
          row.total.toFixed(2),
          row.grossProfit.toFixed(2),
          row.marginPercent.toFixed(2),
          row.patient
            ? `${row.patient.firstName} ${row.patient.lastName} (${row.patient.documentNumber})`
            : 'Sin paciente',
        ]
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }

    for (const row of reportData.byUser) {
      lines.push(
        ['PorUsuario', row.name, row.role, row.salesCount, row.total.toFixed(2), row.grossProfit.toFixed(2), row.averageTicket.toFixed(2), row.marginPercent.toFixed(2)]
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }

    for (const row of reportData.byPaymentMethod) {
      lines.push(
        ['Pago', row.paymentMethod, '-', row.salesCount, row.total.toFixed(2), '', '', '']
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }

    for (const row of reportData.dailySeries) {
      lines.push(
        ['Diario', row.date, '-', row.salesCount, row.total.toFixed(2), '', '', '']
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }

    for (const row of reportData.topPatients) {
      lines.push(
        [
          'Paciente',
          `${row.firstName} ${row.lastName}`.trim(),
          row.documentNumber,
          row.salesCount,
          row.total.toFixed(2),
          row.averageTicket.toFixed(2),
          row.lastSaleAt,
          '',
        ]
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }
    for (const row of reportData.stagnantFrames) {
      lines.push(
        [
          'Inventario',
          'Inmovilizado',
          `#${row.codigo} ${row.referencia}`,
          row.stockActual,
          row.soldQty,
          row.stockValue.toFixed(2),
          '',
          '',
        ]
          .map((value) => toCsvCell(value))
          .join(','),
      );
    }

    const content = [headers.map((header) => toCsvCell(header)).join(','), ...lines].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reporte-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setReportError('');
  };

  const handleExportReportPdf = () => {
    if (!reportData || !user) {
      setReportError('No hay reporte cargado para exportar en PDF.');
      return;
    }

    const reportWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!reportWindow) {
      setReportError('Tu navegador bloqueo la ventana de impresion. Habilita pop-ups.');
      return;
    }

    const printable = buildSalesReportPrintHtml(reportData, `${user.name} (${user.email})`);
    reportWindow.document.open();
    reportWindow.document.write(printable);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => {
      reportWindow.print();
    }, 180);
    setReportError('');
  };

  const applyReportPreset = (
    preset: 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CURRENT_MONTH',
  ) => {
    const range = getDatePresetRange(preset);
    setReportFrom(range.from);
    setReportTo(range.to);
  };

  const applySalesPreset = (
    preset: 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CURRENT_MONTH',
  ) => {
    const range = getDatePresetRange(preset);
    setSalesFromDate(range.from);
    setSalesToDate(range.to);
  };

  const applyCashPreset = (
    preset: 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CURRENT_MONTH',
  ) => {
    const range = getDatePresetRange(preset);
    setCashFromDate(range.from);
    setCashToDate(range.to);
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
                {twoFactorChallengeToken
                  ? 'Segundo paso: confirma tu codigo de autenticacion.'
                  : 'Usa tus credenciales para entrar al panel comercial.'}
              </p>

              <form className="stack" onSubmit={handleLogin}>
                <label>
                  Correo
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (twoFactorChallengeToken) {
                        setTwoFactorChallengeToken('');
                        setTwoFactorCode('');
                        setTwoFactorUseRecoveryCode(false);
                        setTwoFactorRecoveryCode('');
                        setAuthError('');
                      }
                    }}
                    required
                    placeholder="asesor@optica.com"
                    disabled={Boolean(twoFactorChallengeToken)}
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (twoFactorChallengeToken) {
                        setTwoFactorChallengeToken('');
                        setTwoFactorCode('');
                        setTwoFactorUseRecoveryCode(false);
                        setTwoFactorRecoveryCode('');
                        setAuthError('');
                      }
                    }}
                    required
                    minLength={8}
                    disabled={Boolean(twoFactorChallengeToken)}
                  />
                </label>
                {twoFactorChallengeToken ? (
                  <>
                    <div className="inline auth-two-factor-mode">
                      <button
                        type="button"
                        className={`ghost ${!twoFactorUseRecoveryCode ? 'active-mode' : ''}`}
                        onClick={() => setTwoFactorUseRecoveryCode(false)}
                      >
                        Codigo app
                      </button>
                      <button
                        type="button"
                        className={`ghost ${twoFactorUseRecoveryCode ? 'active-mode' : ''}`}
                        onClick={() => setTwoFactorUseRecoveryCode(true)}
                      >
                        Codigo de recuperacion
                      </button>
                    </div>
                    <label>
                      {twoFactorUseRecoveryCode
                        ? 'Codigo de recuperacion'
                        : 'Codigo de autenticacion (2FA)'}
                      {twoFactorUseRecoveryCode ? (
                        <input
                          type="text"
                          value={twoFactorRecoveryCode}
                          onChange={(event) =>
                            setTwoFactorRecoveryCode(
                              event.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9-]/g, '')
                                .slice(0, 24),
                            )
                          }
                          required
                          placeholder="ABCD-EFGHIJ"
                        />
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          value={twoFactorCode}
                          onChange={(event) =>
                            setTwoFactorCode(
                              event.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                            )
                          }
                          required
                          placeholder="123456"
                        />
                      )}
                    </label>
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={trustDeviceOnThisBrowser}
                        onChange={(event) => setTrustDeviceOnThisBrowser(event.target.checked)}
                      />
                      Confiar este equipo por 30 dias
                    </label>
                    <p className="hint auth-note">
                      Si lo activas, no se pedira 2FA en este equipo durante 30 dias, salvo si se
                      detecta un riesgo de acceso.
                    </p>
                    {twoFactorUseRecoveryCode ? (
                      <p className="hint auth-note">
                        Usa un codigo de recuperacion de un solo uso. Luego regenera codigos en
                        "Sesiones".
                      </p>
                    ) : null}
                  </>
                ) : null}

                {authError ? <p className="error">{authError}</p> : null}

                <button type="submit" disabled={authLoading}>
                  {authLoading
                    ? 'Ingresando...'
                    : twoFactorChallengeToken
                      ? 'Verificar codigo'
                      : 'Entrar'}
                </button>
                {twoFactorChallengeToken ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setTwoFactorChallengeToken('');
                      setTwoFactorCode('');
                      setTwoFactorUseRecoveryCode(false);
                      setTwoFactorRecoveryCode('');
                      setAuthError('');
                    }}
                  >
                    Cambiar cuenta
                  </button>
                ) : null}
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
                <button
                  type="submit"
                  className="ghost"
                  disabled={forgotLoading || Boolean(twoFactorChallengeToken)}
                >
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

              <div className="field-grid two">
                <label>
                  Tipo de descuento
                  <select
                    value={saleDiscountType}
                    onChange={(event) =>
                      setSaleDiscountType(
                        event.target.value as 'NONE' | 'PERCENT' | 'AMOUNT',
                      )
                    }
                    disabled={!canCreateSale || saleSaving}
                  >
                    <option value="NONE">Sin descuento</option>
                    <option value="PERCENT">Porcentaje (%)</option>
                    <option value="AMOUNT">Valor ($)</option>
                  </select>
                </label>
                <label>
                  Valor descuento
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={saleDiscountValue}
                    onChange={(event) => setSaleDiscountValue(event.target.value)}
                    disabled={!canCreateSale || saleSaving || saleDiscountType === 'NONE'}
                  />
                </label>
              </div>

              <label>
                Impuesto (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={saleTaxPercent}
                  onChange={(event) => setSaleTaxPercent(event.target.value)}
                  disabled={!canCreateSale || saleSaving}
                />
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

              <div className="sale-items">
                <h3>Lentes de laboratorio</h3>
                {saleLensItems.map((item, index) => (
                  <div className="sale-row lens-row" key={`lens-item-${index}`}>
                    <select
                      value={item.labOrderId}
                      onChange={(event) =>
                        updateSaleLensItem(index, 'labOrderId', event.target.value)
                      }
                      disabled={!canCreateSale || saleSaving}
                    >
                      <option value="">Sin orden de laboratorio</option>
                      {labOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.reference} · {formatLabOrderStatus(order.status)}
                          {order.patient
                            ? ` · ${order.patient.firstName} ${order.patient.lastName}`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.description}
                      onChange={(event) =>
                        updateSaleLensItem(index, 'description', event.target.value)
                      }
                      placeholder="Descripcion lente (ej. Monofocal AR BlueCut)"
                      disabled={!canCreateSale || saleSaving}
                    />
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        updateSaleLensItem(index, 'quantity', event.target.value)
                      }
                      disabled={!canCreateSale || saleSaving}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitSalePrice}
                      onChange={(event) =>
                        updateSaleLensItem(index, 'unitSalePrice', event.target.value)
                      }
                      placeholder="Precio venta"
                      disabled={!canCreateSale || saleSaving}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitLabCost}
                      onChange={(event) =>
                        updateSaleLensItem(index, 'unitLabCost', event.target.value)
                      }
                      placeholder="Costo laboratorio"
                      disabled={!canCreateSale || saleSaving}
                    />
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => removeSaleLensItem(index)}
                      disabled={!canCreateSale || saleSaving}
                    >
                      Quitar
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="ghost"
                  onClick={addSaleLensItem}
                  disabled={!canCreateSale || saleSaving}
                >
                  + Agregar lente
                </button>
              </div>

              <div className="hint">
                <p>Subtotal monturas: ${roundMoney(saleFrameSubtotal).toFixed(2)}</p>
                <p>Subtotal lentes: ${roundMoney(saleLensSubtotal).toFixed(2)}</p>
                <p>Subtotal general: ${salePreview.subtotal.toFixed(2)}</p>
                <p>Descuento: -${salePreview.discountAmount.toFixed(2)}</p>
                <p>
                  Impuesto ({salePreview.taxPercent.toFixed(2)}%): $
                  {salePreview.taxAmount.toFixed(2)}
                </p>
                <p>Costo laboratorio: -${roundMoney(saleLensCostPreview).toFixed(2)}</p>
                <p>
                  Utilidad estimada: $
                  {roundMoney(salePreview.total - saleLensCostPreview).toFixed(2)}
                </p>
                <p>
                  <strong>Total estimado: ${salePreview.total.toFixed(2)}</strong>
                </p>
              </div>
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
              <div className="user-actions">
                <button type="button" onClick={() => void loadSales()} disabled={!canCreateSale}>
                  Actualizar
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleExportSalesCsv}
                  disabled={!salesVisibleList.length}
                >
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="section-card">
              <h3>Filtros de ventas</h3>
              <div className="field-grid two">
                <label>
                  Desde
                  <input
                    type="date"
                    value={salesFromDate}
                    onChange={(event) => setSalesFromDate(event.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={salesToDate}
                    onChange={(event) => setSalesToDate(event.target.value)}
                  />
                </label>
              </div>
              <div className="field-grid two">
                <label>
                  Estado
                  <select
                    value={salesStatusFilter}
                    onChange={(event) => setSalesStatusFilter(event.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="ACTIVE">Activas</option>
                    <option value="VOIDED">Anuladas</option>
                  </select>
                </label>
                <label>
                  Metodo de pago
                  <select
                    value={salesPaymentFilter}
                    onChange={(event) => setSalesPaymentFilter(event.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="CASH">Efectivo</option>
                    <option value="CARD">Tarjeta</option>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="MIXED">Mixto</option>
                  </select>
                </label>
              </div>
              <label className="hint checkbox-inline">
                <input
                  type="checkbox"
                  checked={salesOnlyNegativeMargin}
                  onChange={(event) => setSalesOnlyNegativeMargin(event.target.checked)}
                />
                Mostrar solo ventas activas con margen negativo
              </label>
              {canManageUsers ? (
                <label>
                  Vendedor
                  <select
                    value={salesCreatedByFilter}
                    onChange={(event) => setSalesCreatedByFilter(event.target.value)}
                  >
                    <option value="">Todos</option>
                    {users.map((managedUser) => (
                      <option key={managedUser.id} value={managedUser.id}>
                        {managedUser.name} ({formatRoleLabel(managedUser.role)})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="user-actions">
                <button type="button" onClick={() => void loadSales()} disabled={salesLoading}>
                  Aplicar filtros
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applySalesPreset('TODAY')}
                  disabled={salesLoading}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applySalesPreset('LAST_7_DAYS')}
                  disabled={salesLoading}
                >
                  7 dias
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applySalesPreset('LAST_30_DAYS')}
                  disabled={salesLoading}
                >
                  30 dias
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applySalesPreset('CURRENT_MONTH')}
                  disabled={salesLoading}
                >
                  Mes actual
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const end = formatInputDate(new Date());
                    const start = new Date();
                    start.setDate(start.getDate() - 30);
                    setSalesFromDate(formatInputDate(start));
                    setSalesToDate(end);
                    setSalesStatusFilter('');
                    setSalesPaymentFilter('');
                    setSalesCreatedByFilter('');
                    setSalesOnlyNegativeMargin(false);
                  }}
                >
                  Limpiar
                </button>
              </div>
            </div>

            <div className="section-card">
              <h3>KPI del filtro</h3>
              <p>Activas: {salesSummary.activeCount}</p>
              <p>Anuladas: {salesSummary.voidedCount}</p>
              <p>Ingresos activos: ${salesSummary.activeTotal.toFixed(2)}</p>
              <p>Total anulado: ${salesSummary.voidedTotal.toFixed(2)}</p>
              <p>Utilidad estimada: ${salesSummary.estimatedProfit.toFixed(2)}</p>
              <p>
                Margen negativo: {salesSummary.negativeMarginCount} ventas · $
                {salesSummary.negativeMarginTotal.toFixed(2)}
              </p>
            </div>

            {salesError ? <p className="error">{salesError}</p> : null}
            {salesLoading ? <SkeletonList rows={4} /> : null}

            {!salesLoading && salesVisibleList.length > 0 ? (
              <ul className="list">
                {salesVisibleList.map((sale) => (
                  <li
                    key={sale.id}
                    className={
                      sale.status === 'ACTIVE' && sale.grossProfit < 0
                        ? 'sale-negative-item'
                        : undefined
                    }
                  >
                    <div>
                      <strong>
                        {formatSaleNumber(sale.saleNumber)} · ${sale.total.toFixed(2)}
                      </strong>
                      <p>
                        {sale.patient
                          ? `${sale.patient.firstName} ${sale.patient.lastName}${sale.patient.documentNumber ? ` · ${sale.patient.documentNumber}` : ''}`
                          : 'Sin paciente'}
                      </p>
                    </div>
                    <div className="sale-item-right">
                      <small className={`sale-status ${sale.status === 'VOIDED' ? 'voided' : 'active'}`}>
                        {sale.status === 'VOIDED' ? 'ANULADA' : 'ACTIVA'}
                      </small>
                      <small>
                        {formatPaymentMethod(sale.paymentMethod)} ·{' '}
                        {new Date(sale.createdAt).toLocaleString()}
                      </small>
                      <small>
                        Subtotal ${sale.subtotal.toFixed(2)} · Desc -$
                        {sale.discountAmount.toFixed(2)} · Imp $
                        {sale.taxAmount.toFixed(2)}
                      </small>
                      <small>
                        Monturas ${sale.frameSubtotal.toFixed(2)} · Lentes $
                        {sale.lensSubtotal.toFixed(2)} · Costo lab -$
                        {sale.lensCostTotal.toFixed(2)}
                      </small>
                      <small>Utilidad estimada: ${sale.grossProfit.toFixed(2)}</small>
                      {sale.status === 'ACTIVE' && sale.grossProfit < 0 ? (
                        <small className="error">Alerta: margen negativo</small>
                      ) : null}
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
                      ) : null}
                      <div className="sale-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void handlePrintSaleReceipt(sale)}
                          disabled={salePrintingId === sale.id}
                        >
                          {salePrintingId === sale.id ? 'Generando...' : 'Comprobante'}
                        </button>
                        {sale.status !== 'VOIDED' ? (
                          <button
                            type="button"
                            className="ghost danger"
                            onClick={() => void handleVoidSale(sale)}
                            disabled={saleVoidingId === sale.id}
                          >
                            {saleVoidingId === sale.id ? 'Anulando...' : 'Anular'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {!salesLoading && salesVisibleList.length === 0 ? (
              <EmptyState
                title={
                  salesOnlyNegativeMargin
                    ? 'Sin ventas con margen negativo'
                    : 'Aun no hay ventas registradas'
                }
                description={
                  salesOnlyNegativeMargin
                    ? 'No hay alertas de margen negativo para los filtros actuales.'
                    : 'Registra la primera venta para ver trazabilidad comercial aqui.'
                }
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
              <div className="user-actions">
                <button type="button" onClick={() => void loadLabOrders()}>
                  Actualizar
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleExportLabCsv}
                  disabled={!labVisibleOrders.length}
                >
                  Exportar CSV
                </button>
              </div>
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
            <div className="section-card">
              <h3>Control operativo laboratorio</h3>
              <p>
                Total: {labSummary.total} · Pendientes: {labSummary.pending} · Enviadas:{' '}
                {labSummary.sent}
              </p>
              <p>
                Recibidas: {labSummary.received} · Entregadas: {labSummary.delivered} ·
                Canceladas: {labSummary.cancelled}
              </p>
              <p>Vencidas por promesa: {labSummary.overdue}</p>
              <label className="hint checkbox-inline">
                <input
                  type="checkbox"
                  checked={labOnlyOverdue}
                  onChange={(event) => setLabOnlyOverdue(event.target.checked)}
                />
                Mostrar solo ordenes vencidas
              </label>
            </div>

            {labOrdersError ? <p className="error">{labOrdersError}</p> : null}
            {labOrdersLoading ? <SkeletonList rows={5} /> : null}

            {!labOrdersLoading && labVisibleOrders.length > 0 ? (
              <ul className="list">
                {labVisibleOrders.map((order) => {
                  const nextStatus = getNextLabOrderStatus(order.status);
                  const overdue = isLabOrderOverdue(order);
                  const overdueDays = getLabOrderDelayDays(order);
                  return (
                    <li key={order.id} className={overdue ? 'lab-order-overdue-item' : undefined}>
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
                        {overdue ? (
                          <p className="error">
                            Vencida hace {overdueDays} dia{overdueDays === 1 ? '' : 's'}
                          </p>
                        ) : null}
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

            {!labOrdersLoading && labVisibleOrders.length === 0 ? (
              <EmptyState
                title={
                  labOnlyOverdue
                    ? 'No hay ordenes vencidas'
                    : 'No hay ordenes de laboratorio'
                }
                description={
                  labOnlyOverdue
                    ? 'No hay ordenes pendientes con fecha promesa vencida en este filtro.'
                    : 'Crea una orden para empezar trazabilidad operativa.'
                }
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
              <div className="user-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyCashPreset('TODAY')}
                  disabled={cashSaving || cashLoading}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyCashPreset('LAST_7_DAYS')}
                  disabled={cashSaving || cashLoading}
                >
                  7 dias
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyCashPreset('LAST_30_DAYS')}
                  disabled={cashSaving || cashLoading}
                >
                  30 dias
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyCashPreset('CURRENT_MONTH')}
                  disabled={cashSaving || cashLoading}
                >
                  Mes actual
                </button>
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

            <div className="section-card">
              <h3>Cierre diario comercial</h3>
              {cashDailySummary ? (
                <>
                  <p>
                    Activas: {cashDailySummary.totals.activeSalesCount} · Anuladas:{' '}
                    {cashDailySummary.totals.voidedSalesCount}
                  </p>
                  <p>
                    Venta activa: ${cashDailySummary.totals.activeSalesTotal.toFixed(2)} ·
                    Utilidad: ${cashDailySummary.totals.estimatedProfit.toFixed(2)}
                  </p>
                  <p>
                    Esperado: ${cashDailySummary.totals.expectedCash.toFixed(2)} · Declarado:
                    ${cashDailySummary.totals.declaredCash.toFixed(2)}
                  </p>
                  <p>
                    Diferencia consolidada: $
                    {cashDailySummary.totals.closureDifference.toFixed(2)}
                  </p>
                  {cashDailySummary.rows.length > 0 ? (
                    <ul className="list">
                      {cashDailySummary.rows.slice(0, 6).map((row) => (
                        <li key={row.date}>
                          <div>
                            <strong>{row.date}</strong>
                            <p>
                              Activas {row.activeSalesCount} (${row.activeSalesTotal.toFixed(2)})
                            </p>
                            <p>
                              Anuladas {row.voidedSalesCount} (${row.voidedSalesTotal.toFixed(2)})
                            </p>
                          </div>
                          <div className="cash-closure-right">
                            <small>Utilidad: ${row.estimatedProfit.toFixed(2)}</small>
                            <small>Cierres: {row.closuresCount}</small>
                            <small>Esperado: ${row.expectedCash.toFixed(2)}</small>
                            <small>Declarado: ${row.declaredCash.toFixed(2)}</small>
                            <small
                              className={`cash-diff ${
                                row.closureDifference > 0
                                  ? 'up'
                                  : row.closureDifference < 0
                                    ? 'down'
                                    : 'even'
                              }`}
                            >
                              Dif: ${row.closureDifference.toFixed(2)}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">Sin datos diarios para el filtro actual.</p>
                  )}
                </>
              ) : (
                <p className="hint">Genera o actualiza cierres para cargar el consolidado diario.</p>
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Cierres recientes</h2>
              <div className="user-actions">
                <button type="button" onClick={() => void loadCashClosures()} disabled={cashLoading}>
                  Actualizar
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleExportCashCsv}
                  disabled={cashLoading || (!cashClosures.length && !cashDailySummary)}
                >
                  Exportar CSV
                </button>
              </div>
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
              {user.role === 'ADMIN' ? (
                <div className="section-card two-factor-box">
                  <h3>Autenticacion de dos factores (2FA)</h3>
                  <p>
                    Estado:{' '}
                    {twoFactorStatus?.enabled || user.twoFactorEnabled ? 'Activo' : 'Inactivo'}
                    {twoFactorStatus?.required ? ' (obligatorio por politica)' : ''}
                  </p>
                  {(twoFactorStatus?.enabled || user.twoFactorEnabled) ? (
                    <p>
                      Codigos de recuperacion disponibles:{' '}
                      {twoFactorStatus?.recoveryCodesRemaining ?? 0}
                    </p>
                  ) : null}
                  <p className="hint">
                    Recomendado para cuentas ADMIN. Usa Google Authenticator, Microsoft
                    Authenticator o similar.
                  </p>
                  <div className="user-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void loadTwoFactorStatus()}
                      disabled={twoFactorActionLoading}
                    >
                      Actualizar estado
                    </button>
                    {!twoFactorStatus?.enabled && !user.twoFactorEnabled ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void handleStartTwoFactorSetup()}
                        disabled={twoFactorActionLoading}
                      >
                        Generar setup 2FA
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void handleRegenerateRecoveryCodes()}
                          disabled={twoFactorActionLoading}
                        >
                          Regenerar codigos
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => void handleDisableTwoFactor()}
                          disabled={twoFactorActionLoading}
                        >
                          Desactivar 2FA
                        </button>
                      </>
                    )}
                  </div>

                  {twoFactorSetupData ? (
                    <form className="stack" onSubmit={handleEnableTwoFactor}>
                      <div className="two-factor-qr-block">
                        <p>Escanea este QR en Google/Microsoft Authenticator:</p>
                        {twoFactorSetupQrDataUrl ? (
                          <img
                            src={twoFactorSetupQrDataUrl}
                            alt="Codigo QR para configurar autenticador 2FA"
                            width={216}
                            height={216}
                          />
                        ) : (
                          <p className="hint">Generando QR...</p>
                        )}
                      </div>
                      <label>
                        Clave manual (si no puedes escanear QR)
                        <input value={twoFactorSetupData.manualEntryKey} readOnly />
                      </label>
                      <label>
                        URI OTP (puedes convertirla a QR en cualquier generador local)
                        <input value={twoFactorSetupData.otpauthUrl} readOnly />
                      </label>
                      <label>
                        Codigo de verificacion (6 digitos)
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          value={twoFactorSetupCode}
                          onChange={(event) =>
                            setTwoFactorSetupCode(
                              event.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                            )
                          }
                          required
                          placeholder="123456"
                        />
                      </label>
                      <button type="submit" disabled={twoFactorActionLoading}>
                        {twoFactorActionLoading ? 'Activando...' : 'Activar 2FA'}
                      </button>
                    </form>
                  ) : null}
                  {twoFactorGeneratedRecoveryCodes.length > 0 ? (
                    <div className="two-factor-recovery-box">
                      <h4>Codigos de recuperacion (guardalos ahora)</h4>
                      <p className="hint">
                        Cada codigo se usa una sola vez para entrar si no tienes el autenticador.
                      </p>
                      <div className="two-factor-recovery-grid">
                        {twoFactorGeneratedRecoveryCodes.map((code) => (
                          <code key={code}>{code}</code>
                        ))}
                      </div>
                      <div className="inline">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            handleDownloadRecoveryCodes(twoFactorGeneratedRecoveryCodes)
                          }
                        >
                          Descargar codigos
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setTwoFactorGeneratedRecoveryCodes([])}
                        >
                          Ocultar
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {twoFactorMessage ? (
                    <p className={getFeedbackClass(twoFactorMessage)}>{twoFactorMessage}</p>
                  ) : null}
                </div>
              ) : null}
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
                        {managedUser.twoFactorEnabled ? ' · 2FA activo' : ''}
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
              <div className="field-grid three">
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
                <label>
                  Metodo de pago
                  <select
                    value={reportPaymentFilter}
                    onChange={(event) => setReportPaymentFilter(event.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="CASH">Efectivo</option>
                    <option value="CARD">Tarjeta</option>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="MIXED">Mixto</option>
                  </select>
                </label>
              </div>
              <div className="field-grid two">
                <label>
                  Vendedor
                  <select
                    value={reportCreatedByFilter}
                    onChange={(event) => setReportCreatedByFilter(event.target.value)}
                  >
                    <option value="">Todos</option>
                    {users.map((managedUser) => (
                      <option key={managedUser.id} value={managedUser.id}>
                        {managedUser.name} ({formatRoleLabel(managedUser.role)})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="section-card report-filter-summary">
                  <h3>Filtro actual</h3>
                  <p>
                    Vendedor:{' '}
                    {reportCreatedByFilter
                      ? users.find((item) => item.id === reportCreatedByFilter)?.name ||
                        'No disponible'
                      : 'Todos'}
                  </p>
                  <p>
                    Pago:{' '}
                    {reportPaymentFilter
                      ? formatPaymentMethod(reportPaymentFilter)
                      : 'Todos'}
                  </p>
                </div>
              </div>
              <div className="user-actions">
                <button type="button" onClick={() => void loadReports()} disabled={reportLoading}>
                  {reportLoading ? 'Generando...' : 'Generar reporte'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyReportPreset('TODAY')}
                  disabled={reportLoading}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyReportPreset('LAST_7_DAYS')}
                  disabled={reportLoading}
                >
                  7 dias
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyReportPreset('LAST_30_DAYS')}
                  disabled={reportLoading}
                >
                  30 dias
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => applyReportPreset('CURRENT_MONTH')}
                  disabled={reportLoading}
                >
                  Mes actual
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setReportCreatedByFilter('');
                    setReportPaymentFilter('');
                  }}
                  disabled={reportLoading}
                >
                  Limpiar filtros
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleExportReportCsv}
                  disabled={!reportData}
                >
                  Exportar CSV
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleExportReportPdf}
                  disabled={!reportData}
                >
                  Exportar PDF
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
                <>
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
                    <p>Venta lentes: ${reportData.totals.totalLensRevenue.toFixed(2)}</p>
                    <p>Costo lentes: ${reportData.totals.totalLensCost.toFixed(2)}</p>
                    <p>Utilidad estimada: ${reportData.totals.estimatedGrossProfit.toFixed(2)}</p>
                    <p>
                      Anulaciones: {reportData.voided.count} · Total anulado: $
                      {reportData.voided.totalAmount.toFixed(2)}
                    </p>
                    <p>
                      Riesgo margen negativo: {reportData.risk.negativeMarginSalesCount} ·
                      Perdida estimada: ${reportData.risk.negativeMarginTotalLoss.toFixed(2)}
                    </p>
                  </div>
                  <div className="section-card">
                    <h3>Rendimiento laboratorio</h3>
                    <p>
                      Ordenes: {reportData.lab.totalOrders} · Vencidas abiertas:{' '}
                      {reportData.lab.overdueOpenOrders}
                    </p>
                    <p>
                      Pendientes: {reportData.lab.pendingOrders} · Enviadas:{' '}
                      {reportData.lab.sentToLabOrders} · Recibidas:{' '}
                      {reportData.lab.receivedOrders}
                    </p>
                    <p>
                      Entregadas: {reportData.lab.deliveredOrders} · Canceladas:{' '}
                      {reportData.lab.cancelledOrders}
                    </p>
                    <p>
                      Cumplimiento promesa: {reportData.lab.onTimeDeliveryRate.toFixed(2)}% (
                      {reportData.lab.onTimeDeliveries} a tiempo / {reportData.lab.lateDeliveries}{' '}
                      tardias)
                    </p>
                    <p>
                      Promedio dias envio-recepcion: {reportData.lab.avgDaysSentToReceived.toFixed(2)}
                    </p>
                    <p>
                      Promedio dias envio-entrega: {reportData.lab.avgDaysSentToDelivered.toFixed(2)}
                    </p>
                  </div>
                  <div className="section-card">
                    <h3>Comparativo vs periodo anterior</h3>
                    <p>
                      Anterior: {formatDateTime(reportData.previousRange.from)} -{' '}
                      {formatDateTime(reportData.previousRange.to)}
                    </p>
                    <p>
                      Ventas: {reportData.comparison.salesCount.current} vs{' '}
                      {reportData.comparison.salesCount.previous} (
                      {formatSigned(reportData.comparison.salesCount.delta, 0)} /{' '}
                      {formatSigned(reportData.comparison.salesCount.deltaPercent)}%)
                    </p>
                    <p>
                      Ingresos: ${reportData.comparison.totalRevenue.current.toFixed(2)} vs $
                      {reportData.comparison.totalRevenue.previous.toFixed(2)} ($
                      {formatSigned(reportData.comparison.totalRevenue.delta)} /{' '}
                      {formatSigned(reportData.comparison.totalRevenue.deltaPercent)}%)
                    </p>
                    <p>
                      Utilidad: ${reportData.comparison.grossProfit.current.toFixed(2)} vs $
                      {reportData.comparison.grossProfit.previous.toFixed(2)} ($
                      {formatSigned(reportData.comparison.grossProfit.delta)} /{' '}
                      {formatSigned(reportData.comparison.grossProfit.deltaPercent)}%)
                    </p>
                    <p>
                      Ticket: ${reportData.comparison.averageTicket.current.toFixed(2)} vs $
                      {reportData.comparison.averageTicket.previous.toFixed(2)} ($
                      {formatSigned(reportData.comparison.averageTicket.delta)} /{' '}
                      {formatSigned(reportData.comparison.averageTicket.deltaPercent)}%)
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Equipos, productos y pacientes</h2>
              <button type="button" onClick={() => void loadReports()} disabled={reportLoading}>
                Actualizar
              </button>
            </div>
            {reportLoading ? (
              <>
                <div className="section-card">
                  <h3>Centro de alertas operativas</h3>
                  <SkeletonList rows={3} />
                </div>
                <div className="section-card">
                  <h3>Por usuario</h3>
                  <SkeletonList rows={4} />
                </div>
                <div className="section-card">
                  <h3>Top monturas</h3>
                  <SkeletonList rows={4} />
                </div>
                <div className="section-card">
                  <h3>Pacientes recurrentes</h3>
                  <SkeletonList rows={4} />
                </div>
                <div className="section-card">
                  <h3>Anulaciones</h3>
                  <SkeletonList rows={4} />
                </div>
                <div className="section-card">
                  <h3>Inventario inmovilizado</h3>
                  <SkeletonList rows={4} />
                </div>
                <div className="section-card">
                  <h3>Riesgo comercial</h3>
                  <SkeletonList rows={4} />
                </div>
              </>
            ) : null}
            {!reportLoading && reportData ? (
              <>
                <div className="section-card">
                  <h3>Centro de alertas operativas</h3>
                  {reportOperationalAlerts.length > 0 ? (
                    <ul className="list alert-list">
                      {reportOperationalAlerts.map((alert) => (
                        <li key={alert.id} className={`alert-item severity-${alert.severity.toLowerCase()}`}>
                          <div>
                            <strong>{alert.title}</strong>
                            <p>{alert.detail}</p>
                          </div>
                          <div className="audit-item-right">
                            <small className={`alert-severity severity-${alert.severity.toLowerCase()}`}>
                              {formatAlertSeverity(alert.severity)}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Sin alertas criticas"
                      description="No se detectaron desviaciones operativas para estos filtros."
                    />
                  )}
                </div>
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
                            <p>
                              Utilidad ${row.grossProfit.toFixed(2)} · Margen{' '}
                              {row.marginPercent.toFixed(2)}%
                            </p>
                          </div>
                          <div className="audit-item-right">
                            <small>{row.salesCount} ventas</small>
                            <small>Ticket: ${row.averageTicket.toFixed(2)}</small>
                            <small>Items: {row.totalItems}</small>
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
                <div className="section-card">
                  <h3>Pacientes recurrentes</h3>
                  {reportData.topPatients.length > 0 ? (
                    <ul className="list">
                      {reportData.topPatients.map((row) => (
                        <li key={row.patientId}>
                          <div>
                            <strong>
                              {row.firstName} {row.lastName}
                            </strong>
                            <p>{row.documentNumber}</p>
                          </div>
                          <div className="audit-item-right">
                            <small>{row.salesCount} compras</small>
                            <small>Ticket: ${row.averageTicket.toFixed(2)}</small>
                            <small>${row.total.toFixed(2)}</small>
                            <small>Ultima: {formatDateTime(row.lastSaleAt)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Sin pacientes recurrentes"
                      description="Asocia pacientes a las ventas para habilitar este ranking."
                    />
                  )}
                </div>
                <div className="section-card">
                  <h3>Anulaciones (control)</h3>
                  <p>
                    Cantidad: {reportData.voided.count} · Total:{' '}
                    ${reportData.voided.totalAmount.toFixed(2)}
                  </p>
                  {reportData.voided.byVoider.length > 0 ? (
                    <ul className="list">
                      {reportData.voided.byVoider.slice(0, 6).map((row) => (
                        <li key={`${row.userId ?? 'unknown'}-${row.name}`}>
                          <div>
                            <strong>{row.name}</strong>
                            <p>
                              {formatRoleLabel(row.role)} · {row.email}
                            </p>
                          </div>
                          <div className="audit-item-right">
                            <small>{row.count} anulaciones</small>
                            <small>${row.totalAmount.toFixed(2)}</small>
                            <small>Promedio ${row.averageAmount.toFixed(2)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">Sin anulaciones por usuario en el rango.</p>
                  )}
                  {reportData.voided.topReasons.length > 0 ? (
                    <ul className="list">
                      {reportData.voided.topReasons.slice(0, 5).map((row) => (
                        <li key={row.reason}>
                          <div>
                            <strong>{row.reason}</strong>
                          </div>
                          <div className="audit-item-right">
                            <small>{row.count} casos</small>
                            <small>${row.totalAmount.toFixed(2)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="section-card">
                  <h3>Inventario inmovilizado</h3>
                  {reportData.stagnantFrames.length > 0 ? (
                    <ul className="list">
                      {reportData.stagnantFrames.map((row) => (
                        <li key={row.frameId}>
                          <div>
                            <strong>
                              #{row.codigo} {row.referencia}
                            </strong>
                            <p>Stock actual: {row.stockActual}</p>
                          </div>
                          <div className="audit-item-right">
                            <small>Vendidas: {row.soldQty}</small>
                            <small>Valor inmovilizado: ${row.stockValue.toFixed(2)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Sin inventario inmovilizado"
                      description="En el rango filtrado todas las monturas con stock tuvieron rotacion."
                    />
                  )}
                </div>
                <div className="section-card">
                  <h3>Riesgo comercial (margen negativo)</h3>
                  <p>
                    Ventas en riesgo: {reportData.risk.negativeMarginSalesCount} · Perdida:{' '}
                    ${reportData.risk.negativeMarginTotalLoss.toFixed(2)}
                  </p>
                  <p>
                    Exposicion de ingresos: $
                    {reportData.risk.negativeMarginRevenueExposure.toFixed(2)}
                  </p>
                  {reportData.risk.topNegativeSales.length > 0 ? (
                    <ul className="list">
                      {reportData.risk.topNegativeSales.map((row) => (
                        <li key={row.saleId}>
                          <div>
                            <strong>{formatSaleNumber(row.saleNumber)}</strong>
                            <p>
                              {row.patient
                                ? `${row.patient.firstName} ${row.patient.lastName} · ${row.patient.documentNumber}`
                                : 'Sin paciente'}
                            </p>
                            <p>
                              {row.createdBy
                                ? `${row.createdBy.name} (${formatRoleLabel(row.createdBy.role)})`
                                : 'Usuario no disponible'}
                            </p>
                          </div>
                          <div className="audit-item-right">
                            <small>Total: ${row.total.toFixed(2)}</small>
                            <small>Utilidad: ${row.grossProfit.toFixed(2)}</small>
                            <small>Margen: {row.marginPercent.toFixed(2)}%</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">Sin ventas activas con margen negativo en este rango.</p>
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


