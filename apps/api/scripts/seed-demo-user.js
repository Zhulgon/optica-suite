const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const apiRoot = path.resolve(__dirname, '..');
loadEnvFromFile(path.join(apiRoot, '.env'));

const prisma = new PrismaClient();

async function ensureSite() {
  const code = (process.env.DEMO_SITE_CODE || 'PRINCIPAL').trim().toUpperCase();
  const name = (process.env.DEMO_SITE_NAME || 'Sede Principal').trim();
  const site = await prisma.site.upsert({
    where: { code },
    update: {
      name,
      isActive: true,
    },
    create: {
      code,
      name,
      isActive: true,
    },
  });
  return site;
}

function getDemoUsers() {
  const mainRole = (process.env.DEMO_ROLE || 'ADMIN').trim().toUpperCase();
  const validRoles = ['ADMIN', 'ASESOR', 'OPTOMETRA'];
  if (!validRoles.includes(mainRole)) {
    throw new Error(`DEMO_ROLE invalido. Usa: ${validRoles.join(', ')}`);
  }

  const users = [
    {
      key: 'ADMIN',
      email: process.env.DEMO_EMAIL || 'demo@optica.local',
      password: process.env.DEMO_PASSWORD || 'Demo12345',
      name: process.env.DEMO_NAME || 'Usuario Demo',
      role: mainRole,
    },
    {
      key: 'OPTOMETRA',
      email: process.env.DEMO_OPTOMETRA_EMAIL || 'opto@optica.local',
      password: process.env.DEMO_OPTOMETRA_PASSWORD || 'Demo12345',
      name: process.env.DEMO_OPTOMETRA_NAME || 'Optometra Demo',
      role: 'OPTOMETRA',
    },
    {
      key: 'ASESOR',
      email: process.env.DEMO_ASESOR_EMAIL || 'asesor@optica.local',
      password: process.env.DEMO_ASESOR_PASSWORD || 'Demo12345',
      name: process.env.DEMO_ASESOR_NAME || 'Asesor Demo',
      role: 'ASESOR',
    },
  ];

  const dedupByEmail = new Map();
  for (const user of users) {
    dedupByEmail.set(user.email.trim().toLowerCase(), {
      ...user,
      email: user.email.trim().toLowerCase(),
    });
  }
  return Array.from(dedupByEmail.values());
}

async function upsertUser(user, siteId) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  return prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name,
      role: user.role,
      siteId,
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: 0,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorTempSecret: null,
      twoFactorEnabledAt: null,
    },
    create: {
      email: user.email,
      name: user.name,
      role: user.role,
      siteId,
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: 0,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorTempSecret: null,
      twoFactorEnabledAt: null,
    },
  });
}

async function ensureDemoFrames() {
  const totalFrames = await prisma.frame.count();
  if (totalFrames > 0) {
    return { created: 0, skipped: totalFrames };
  }

  const sampleFrames = [
    { codigo: 900001, referencia: 'DEMO CLASSIC 48 C1', segmento: 'DAMA', conPlaqueta: false, precioVenta: 220000, stockActual: 3 },
    { codigo: 900002, referencia: 'DEMO URBAN 50 C2', segmento: 'HOMBRE', conPlaqueta: true, precioVenta: 260000, stockActual: 3 },
    { codigo: 900003, referencia: 'DEMO FLEX 52 C3', segmento: 'HOMBRE', conPlaqueta: true, precioVenta: 310000, stockActual: 2 },
    { codigo: 900004, referencia: 'DEMO KIDS 44 C1', segmento: 'NINOS', conPlaqueta: false, precioVenta: 180000, stockActual: 4 },
    { codigo: 900005, referencia: 'DEMO ELEGANT 49 C5', segmento: 'DAMA', conPlaqueta: true, precioVenta: 340000, stockActual: 2 },
  ];

  for (const item of sampleFrames) {
    const frame = await prisma.frame.create({
      data: {
        codigo: item.codigo,
        referencia: item.referencia,
        segmento: item.segmento,
        conPlaqueta: item.conPlaqueta,
        precioVenta: item.precioVenta,
        stockActual: item.stockActual,
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        frameId: frame.id,
        type: 'IN',
        quantity: item.stockActual,
        reason: 'Seed demo inicial',
      },
    });
  }

  return { created: sampleFrames.length, skipped: 0 };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no esta definido. Configura apps/api/.env');
  }

  const site = await ensureSite();
  const demoUsers = getDemoUsers();
  const createdUsers = [];

  for (const user of demoUsers) {
    await upsertUser(user, site.id);
    createdUsers.push(user);
  }

  const frameSeed = await ensureDemoFrames();

  console.log('Seed demo listo:');
  console.log(`  site: ${site.name} (${site.code})`);
  for (const user of createdUsers) {
    console.log(`  user (${user.key}): ${user.email} / ${user.password} / role=${user.role}`);
  }
  console.log(
    `  frames: creadas=${frameSeed.created} ${frameSeed.skipped ? `(existentes=${frameSeed.skipped})` : ''}`,
  );
}

main()
  .catch((error) => {
    console.error('Error creando usuario demo:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

