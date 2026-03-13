const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function timestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function parseOutArg(argv) {
  const outFlagIndex = argv.indexOf('--out');
  if (outFlagIndex >= 0 && argv[outFlagIndex + 1]) {
    return argv[outFlagIndex + 1];
  }
  return '';
}

function parseKeepArg(argv) {
  const keepFlagIndex = argv.indexOf('--keep');
  if (keepFlagIndex >= 0 && argv[keepFlagIndex + 1]) {
    const parsed = Number(argv[keepFlagIndex + 1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
}

function cleanupOldBackups(backupDir, keep) {
  if (!keep || keep < 1) return [];

  const entries = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        name: entry.name,
        fullPath,
        modifiedAtMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);

  const removed = [];
  for (const entry of entries.slice(keep)) {
    fs.unlinkSync(entry.fullPath);
    removed.push(entry.name);
  }
  return removed;
}

async function run() {
  const rootDir = path.resolve(__dirname, '..');
  const argv = process.argv.slice(2);
  const backupDir = path.resolve(rootDir, 'data', 'backups');
  const container = process.env.DB_CONTAINER || 'optica_db';
  const dbUser = process.env.POSTGRES_USER || 'optica';
  const dbName = process.env.POSTGRES_DB || 'optica_db';

  fs.mkdirSync(backupDir, { recursive: true });

  const targetPathArg = parseOutArg(argv);
  const keepBackups = parseKeepArg(argv);
  const outputFile = targetPathArg
    ? path.resolve(rootDir, targetPathArg)
    : path.join(backupDir, `optica_backup_${timestamp()}.sql`);

  await new Promise((resolve, reject) => {
    const args = [
      'exec',
      container,
      'pg_dump',
      '-U',
      dbUser,
      '-d',
      dbName,
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
    ];

    const child = spawn('docker', args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const outputStream = fs.createWriteStream(outputFile);

    child.stdout.pipe(outputStream);
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      outputStream.close();
      if (code !== 0) {
        reject(new Error(`pg_dump finalizo con codigo ${code}`));
        return;
      }
      resolve();
    });
  });

  const stats = fs.statSync(outputFile);
  console.log('Backup generado correctamente:');
  console.log(`  archivo: ${outputFile}`);
  console.log(`  peso: ${Math.round(stats.size / 1024)} KB`);
  if (keepBackups > 0 && !targetPathArg) {
    const removed = cleanupOldBackups(backupDir, keepBackups);
    console.log(`  retencion: ultimos ${keepBackups} backups`);
    if (removed.length > 0) {
      console.log(`  backups eliminados: ${removed.length}`);
    } else {
      console.log('  backups eliminados: 0');
    }
  }
}

run().catch((error) => {
  console.error('Error generando backup:', error.message);
  process.exitCode = 1;
});
