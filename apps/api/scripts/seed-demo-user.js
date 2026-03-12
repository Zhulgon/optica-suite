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

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definido. Configura apps/api/.env');
  }

  const email = process.env.DEMO_EMAIL || 'demo@optica.local';
  const password = process.env.DEMO_PASSWORD || 'Demo12345';
  const name = process.env.DEMO_NAME || 'Usuario Demo';
  const role = (process.env.DEMO_ROLE || 'ADMIN').toUpperCase();

  const validRoles = ['ADMIN', 'ASESOR', 'OPTOMETRA'];
  if (!validRoles.includes(role)) {
    throw new Error(`DEMO_ROLE inválido. Usa: ${validRoles.join(', ')}`);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: 0,
    },
    create: {
      email,
      name,
      role,
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: 0,
    },
  });

  console.log('Usuario demo listo:');
  console.log(`  email: ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  role: ${role}`);
}

main()
  .catch((error) => {
    console.error('Error creando usuario demo:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

