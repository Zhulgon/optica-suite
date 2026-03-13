const path = require('node:path');
const { createRequire } = require('node:module');
const apiRequire = createRequire(
  path.resolve(__dirname, '..', 'apps', 'api', 'package.json'),
);
const { PrismaClient } = apiRequire('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const options = {
    apiBase: process.env.QA_API_BASE || 'http://localhost:3000',
    email: process.env.QA_EMAIL || 'demo@optica.local',
    password: process.env.QA_PASSWORD || 'Demo12345',
    cleanup: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === '--api' && next) {
      options.apiBase = next;
      i += 1;
      continue;
    }
    if (current === '--email' && next) {
      options.email = next;
      i += 1;
      continue;
    }
    if (current === '--password' && next) {
      options.password = next;
      i += 1;
      continue;
    }
    if (current === '--no-cleanup') {
      options.cleanup = false;
    }
  }

  return options;
}

function dateOnly(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function http(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message.join(' | ')
          : payload.message
        : `${response.status} ${response.statusText}`;
    throw new Error(`${method} ${path} -> ${message}`);
  }

  return payload;
}

function unwrapData(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data;
  return payload;
}

function unwrapList(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload)) return payload;
  return [];
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function cleanup(created) {
  const saleIds = created.saleIds.filter(Boolean);
  const labOrderIds = created.labOrderIds.filter(Boolean);
  const cashClosureIds = created.cashClosureIds.filter(Boolean);
  const patientId = created.patientId;

  if (!saleIds.length && !labOrderIds.length && !cashClosureIds.length && !patientId) {
    return { skipped: true };
  }

  await prisma.$transaction(async (tx) => {
    const activeSales = saleIds.length
      ? await tx.sale.findMany({
          where: { id: { in: saleIds }, status: 'ACTIVE' },
          include: { items: true },
        })
      : [];

    for (const sale of activeSales) {
      for (const item of sale.items) {
        await tx.frame.update({
          where: { id: item.frameId },
          data: { stockActual: { increment: item.quantity } },
        });
      }
    }

    if (patientId) {
      await tx.clinicalHistory.deleteMany({ where: { patientId } });
    }

    if (cashClosureIds.length) {
      await tx.cashClosure.deleteMany({ where: { id: { in: cashClosureIds } } });
    }

    if (saleIds.length) {
      await tx.sale.deleteMany({ where: { id: { in: saleIds } } });
      await tx.inventoryMovement.deleteMany({
        where: {
          OR: saleIds.flatMap((id) => [
            { reason: `Venta ${id}` },
            { reason: `Anulacion venta ${id}` },
          ]),
        },
      });
    }

    if (labOrderIds.length) {
      await tx.labOrder.deleteMany({ where: { id: { in: labOrderIds } } });
    }

    if (patientId) {
      await tx.patient.deleteMany({ where: { id: patientId } });
    }

    const entityIds = [patientId, ...saleIds, ...labOrderIds, ...cashClosureIds].filter(Boolean);
    if (entityIds.length) {
      await tx.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
    }
  });

  return {
    skipped: false,
    verify: {
      patient: patientId ? await prisma.patient.count({ where: { id: patientId } }) : 0,
      clinical: patientId
        ? await prisma.clinicalHistory.count({ where: { patientId } })
        : 0,
      sales: saleIds.length
        ? await prisma.sale.count({ where: { id: { in: saleIds } } })
        : 0,
      labOrders: labOrderIds.length
        ? await prisma.labOrder.count({ where: { id: { in: labOrderIds } } })
        : 0,
      cashClosures: cashClosureIds.length
        ? await prisma.cashClosure.count({ where: { id: { in: cashClosureIds } } })
        : 0,
    },
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const suffix = Date.now();
  const now = new Date();
  const reportFrom = dateOnly(addDays(now, -1));
  const reportTo = dateOnly(addDays(now, 1));
  const created = {
    patientId: null,
    saleIds: [],
    labOrderIds: [],
    cashClosureIds: [],
  };
  const checks = {
    login: false,
    patientCrud: false,
    clinicalCrud: false,
    labFlow: false,
    salesFlow: false,
    cashOverlap: false,
    reports: false,
  };

  try {
    const login = await http(options.apiBase, '/auth/login', {
      method: 'POST',
      body: { email: options.email, password: options.password },
    });
    const token = login.accessToken;
    const currentUser = login.user;
    assert(token, 'sin accessToken');
    checks.login = true;

    const frames = unwrapList(
      await http(options.apiBase, '/frames?inStock=true&limit=200', { token }),
    );
    assert(frames.length > 0, 'sin monturas en stock');
    const frameA = frames.find((f) => Number(f.stockActual) >= 2) || frames[0];
    const frameB = frames.find((f) => f.id !== frameA.id) || frameA;

    const patient = unwrapData(
      await http(options.apiBase, '/patients', {
        method: 'POST',
        token,
        body: {
          firstName: 'E2E',
          lastName: `QA-${suffix}`,
          documentNumber: `E2E-${suffix}`,
          phone: '3000000000',
          email: `qa.${suffix}@test.local`,
          occupation: 'QA',
        },
      }),
    );
    created.patientId = patient.id;
    const patientUpdated = unwrapData(
      await http(options.apiBase, `/patients/${patient.id}`, {
        method: 'PATCH',
        token,
        body: { occupation: 'QA-UPDATED' },
      }),
    );
    assert(patientUpdated.occupation === 'QA-UPDATED', 'no actualizo paciente');
    checks.patientCrud = true;

    const clinical = await http(options.apiBase, '/clinical-histories', {
      method: 'POST',
      token,
      body: {
        patientId: patient.id,
        motivoConsulta: 'Validacion automatica',
        antecedentes: 'N/A',
        diagnostico: 'Astenopia',
        disposicion: 'Control',
      },
    });
    await http(options.apiBase, `/clinical-histories/${clinical.id}`, {
      method: 'PATCH',
      token,
      body: { diagnostico: 'Astenopia leve' },
    });
    const historyList = await http(
      options.apiBase,
      `/clinical-histories?patientId=${patient.id}`,
      { token },
    );
    assert(Array.isArray(historyList) && historyList.length >= 1, 'no lista historia');
    await http(options.apiBase, `/clinical-histories/${clinical.id}`, {
      method: 'DELETE',
      token,
    });
    checks.clinicalCrud = true;

    const promisedYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const promisedTomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const labOverdue = unwrapData(
      await http(options.apiBase, '/lab-orders', {
        method: 'POST',
        token,
        body: {
          patientId: patient.id,
          reference: `LAB-OVERDUE-${suffix}`,
          lensDetails: 'Lente AR',
          labName: 'Lab QA',
          responsible: 'Ops QA',
          promisedDate: promisedYesterday,
        },
      }),
    );
    created.labOrderIds.push(labOverdue.id);
    await http(options.apiBase, `/lab-orders/${labOverdue.id}/status`, {
      method: 'PATCH',
      token,
      body: { status: 'SENT_TO_LAB' },
    });

    const labDelivered = unwrapData(
      await http(options.apiBase, '/lab-orders', {
        method: 'POST',
        token,
        body: {
          patientId: patient.id,
          reference: `LAB-DELIVERED-${suffix}`,
          lensDetails: 'Lente premium',
          labName: 'Lab QA',
          responsible: 'Ops QA',
          promisedDate: promisedTomorrow,
        },
      }),
    );
    created.labOrderIds.push(labDelivered.id);
    await http(options.apiBase, `/lab-orders/${labDelivered.id}/status`, {
      method: 'PATCH',
      token,
      body: { status: 'SENT_TO_LAB' },
    });
    await http(options.apiBase, `/lab-orders/${labDelivered.id}/status`, {
      method: 'PATCH',
      token,
      body: { status: 'RECEIVED' },
    });
    await http(options.apiBase, `/lab-orders/${labDelivered.id}/status`, {
      method: 'PATCH',
      token,
      body: { status: 'DELIVERED' },
    });
    checks.labFlow = true;

    const activeSale = await http(options.apiBase, '/sales', {
      method: 'POST',
      token,
      body: {
        patientId: patient.id,
        paymentMethod: 'CASH',
        notes: `QA active ${suffix}`,
        discountType: 'NONE',
        discountValue: 0,
        taxPercent: 0,
        items: [{ frameId: frameA.id, quantity: 1 }],
        lensItems: [
          {
            labOrderId: labOverdue.id,
            description: 'Lente margen negativo',
            quantity: 1,
            unitSalePrice: 60000,
            unitLabCost: 900000,
          },
        ],
      },
    });
    created.saleIds.push(activeSale.id);
    assert(activeSale.grossProfit < 0, 'no genero margen negativo');

    const saleToVoid = await http(options.apiBase, '/sales', {
      method: 'POST',
      token,
      body: {
        patientId: patient.id,
        paymentMethod: 'CARD',
        notes: `QA void ${suffix}`,
        items: [{ frameId: frameB.id, quantity: 1 }],
        lensItems: [],
      },
    });
    created.saleIds.push(saleToVoid.id);

    await http(options.apiBase, `/sales/${saleToVoid.id}/void`, {
      method: 'PATCH',
      token,
      body: { reason: `Motivo QA ${suffix}` },
    });
    checks.salesFlow = true;

    const closed = await http(options.apiBase, '/cash-closures/close', {
      method: 'POST',
      token,
      body: {
        fromDate: '2015-01-01T00:00:00.000Z',
        toDate: '2015-01-01T00:10:00.000Z',
        declaredCash: 0,
        notes: `QA cash ${suffix}`,
      },
    });
    created.cashClosureIds.push(closed.id);
    let blockedOverlap = false;
    try {
      await http(options.apiBase, '/cash-closures/close', {
        method: 'POST',
        token,
        body: {
          fromDate: '2015-01-01T00:05:00.000Z',
          toDate: '2015-01-01T00:15:00.000Z',
          declaredCash: 0,
        },
      });
    } catch (error) {
      blockedOverlap = String(error.message || '').toLowerCase().includes('solap');
    }
    assert(blockedOverlap, 'no bloqueo cierre solapado');
    checks.cashOverlap = true;

    const report = await http(
      options.apiBase,
      `/reports/sales-summary?from=${reportFrom}&to=${reportTo}`,
      {
      token,
      },
    );
    assert(report?.lab, 'sin bloque lab');
    assert(report?.voided, 'sin bloque voided');
    assert(report?.risk, 'sin bloque risk');
    assert(report?.comparison, 'sin bloque comparison');
    assert(Array.isArray(report?.stagnantFrames), 'sin stagnantFrames');
    const activeSaleInRisk = report.risk.topNegativeSales.some(
      (sale) => sale.saleId === activeSale.id,
    );
    const hasNegativeRisk =
      Number(report.risk?.negativeMarginSalesCount || 0) > 0 &&
      Number(report.risk?.negativeMarginTotalLoss || 0) > 0;
    assert(
      activeSaleInRisk || hasNegativeRisk,
      'risk no incluye ventas negativas detectables',
    );
    checks.reports = true;

    const cleanupResult = options.cleanup ? await cleanup(created) : { skipped: true };
    console.log(
      JSON.stringify(
        {
          ok: true,
          apiBase: options.apiBase,
          user: { id: currentUser.id, email: currentUser.email, role: currentUser.role },
          checks,
          cleanup: cleanupResult,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const cleanupResult = options.cleanup
      ? await cleanup(created).catch((e) => ({ failed: String(e) }))
      : { skipped: true };
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error?.message || String(error),
          checks,
          cleanup: cleanupResult,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch(async (error) => {
  console.error('QA script failed unexpectedly:', error?.message || String(error));
  await prisma.$disconnect();
  process.exit(1);
});
