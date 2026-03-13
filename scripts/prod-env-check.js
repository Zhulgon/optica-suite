const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const options = {
    envPath: path.resolve(process.cwd(), '.env.production'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--env' && next) {
      options.envPath = path.resolve(process.cwd(), next);
      index += 1;
    }
  }

  return options;
}

function parseEnvFile(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function checkBoolean(key, env, expected) {
  const value = (env[key] || '').trim().toLowerCase();
  return value === expected;
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.envPath)) {
    throw new Error(`No existe archivo de entorno: ${options.envPath}`);
  }

  const env = parseEnvFile(fs.readFileSync(options.envPath, 'utf8'));
  const required = [
    'APP_DOMAIN',
    'API_DOMAIN',
    'ACME_EMAIL',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'JWT_ACCESS_SECRET',
    'WEB_APP_URL',
    'CORS_ORIGINS',
    'VITE_API_URL',
    'AUTH_COOKIE_SECURE',
    'ADMIN_2FA_ENFORCED',
  ];
  const missing = required.filter((key) => !String(env[key] || '').trim());
  if (missing.length > 0) {
    throw new Error(`Variables faltantes: ${missing.join(', ')}`);
  }

  if ((env.JWT_ACCESS_SECRET || '').trim().length < 32) {
    throw new Error('JWT_ACCESS_SECRET debe tener minimo 32 caracteres.');
  }

  if (!checkBoolean('AUTH_COOKIE_SECURE', env, 'true')) {
    throw new Error('AUTH_COOKIE_SECURE debe ser true en produccion.');
  }
  if (!checkBoolean('ADMIN_2FA_ENFORCED', env, 'true')) {
    throw new Error('ADMIN_2FA_ENFORCED debe ser true en produccion.');
  }

  const sameSite = (env.AUTH_COOKIE_SAMESITE || 'lax').trim().toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('AUTH_COOKIE_SAMESITE debe ser lax, strict o none.');
  }

  if (sameSite === 'none' && !checkBoolean('AUTH_COOKIE_SECURE', env, 'true')) {
    throw new Error('Si AUTH_COOKIE_SAMESITE=none, AUTH_COOKIE_SECURE debe ser true.');
  }

  const hasAppInCors = (env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes((env.WEB_APP_URL || '').trim());
  if (!hasAppInCors) {
    throw new Error('WEB_APP_URL debe estar incluido dentro de CORS_ORIGINS.');
  }

  console.log('Validacion de entorno productivo: OK');
  console.log(`Archivo revisado: ${options.envPath}`);
}

try {
  run();
} catch (error) {
  console.error(
    'Error en preflight de produccion:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
