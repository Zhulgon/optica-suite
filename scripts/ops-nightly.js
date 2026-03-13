const path = require('node:path');
const { spawn } = require('node:child_process');

function parseArgs(argv) {
  const options = {
    apiUrl: process.env.HEALTH_API_URL || 'http://localhost:3000/health',
    webUrl: process.env.HEALTH_WEB_URL || 'http://localhost:5173',
    keep: Number(process.env.BACKUP_KEEP || 14),
    maxBackupHours: Number(process.env.BACKUP_MAX_HOURS || 30),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--api' && next) {
      options.apiUrl = next;
      index += 1;
      continue;
    }
    if (current === '--web' && next) {
      options.webUrl = next;
      index += 1;
      continue;
    }
    if (current === '--keep' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.keep = Math.floor(parsed);
      }
      index += 1;
      continue;
    }
    if (current === '--max-backup-hours' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.maxBackupHours = parsed;
      }
      index += 1;
    }
  }

  if (!Number.isFinite(options.keep) || options.keep < 1) {
    options.keep = 14;
  }
  if (!Number.isFinite(options.maxBackupHours) || options.maxBackupHours < 1) {
    options.maxBackupHours = 30;
  }

  return options;
}

function runNodeScript(scriptName, args) {
  const rootDir = path.resolve(__dirname, '..');
  const scriptPath = path.resolve(rootDir, 'scripts', scriptName);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${scriptName} finalizo con codigo ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  console.log('Ejecutando mantenimiento nocturno...');

  console.log('1) Backup de base de datos');
  await runNodeScript('db-backup.js', ['--keep', String(options.keep)]);

  console.log('2) Verificacion de salud API/WEB');
  await runNodeScript('ops-health.js', [
    '--api',
    options.apiUrl,
    '--web',
    options.webUrl,
  ]);

  console.log('3) Verificacion de vigencia de backup');
  await runNodeScript('backup-freshness-check.js', [
    '--max-hours',
    String(options.maxBackupHours),
  ]);

  console.log('Mantenimiento nocturno completado: OK');
}

run().catch((error) => {
  console.error(
    'Error en mantenimiento nocturno:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
