const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const options = {
    backupDir: path.resolve(__dirname, '..', 'data', 'backups'),
    maxHours: 30,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--dir' && next) {
      options.backupDir = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }
    if (current === '--max-hours' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.maxHours = parsed;
      }
      index += 1;
    }
  }

  return options;
}

function formatAgeHours(hours) {
  return Number(hours.toFixed(2));
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.backupDir)) {
    throw new Error(`No existe directorio de backups: ${options.backupDir}`);
  }

  const entries = fs
    .readdirSync(options.backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => {
      const fullPath = path.join(options.backupDir, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        fileName: entry.name,
        fullPath,
        modifiedAt: stats.mtime,
        modifiedAtMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);

  if (entries.length === 0) {
    throw new Error('No hay backups .sql en el directorio configurado.');
  }

  const latest = entries[0];
  const ageHours = (Date.now() - latest.modifiedAtMs) / (1000 * 60 * 60);

  console.log(`Directorio: ${options.backupDir}`);
  console.log(`Ultimo backup: ${latest.fileName}`);
  console.log(`Fecha backup: ${latest.modifiedAt.toISOString()}`);
  console.log(`Edad backup (horas): ${formatAgeHours(ageHours)}`);
  console.log(`Limite permitido (horas): ${options.maxHours}`);

  if (ageHours > options.maxHours) {
    throw new Error(
      `Backup vencido: ${formatAgeHours(ageHours)}h > ${options.maxHours}h.`,
    );
  }

  console.log('Estado de backups: FRESH');
}

try {
  run();
} catch (error) {
  console.error(
    'Error validando vigencia de backups:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
