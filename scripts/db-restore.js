const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function parseFileArg(argv) {
  const fileFlagIndex = argv.indexOf('--file');
  if (fileFlagIndex >= 0 && argv[fileFlagIndex + 1]) {
    return argv[fileFlagIndex + 1];
  }
  return argv[0] || '';
}

function hasYesFlag(argv) {
  return argv.includes('--yes');
}

async function run() {
  const rootDir = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const fileArg = parseFileArg(args);

  if (!fileArg) {
    throw new Error(
      'Debes indicar archivo: pnpm restore:db -- --file data/backups/mi_backup.sql --yes',
    );
  }
  if (!hasYesFlag(args)) {
    throw new Error(
      'Confirmacion requerida. Agrega --yes para ejecutar restauracion.',
    );
  }

  const backupPath = path.resolve(rootDir, fileArg);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`No existe archivo de backup: ${backupPath}`);
  }

  const container = process.env.DB_CONTAINER || 'optica_db';
  const dbUser = process.env.POSTGRES_USER || 'optica';
  const dbName = process.env.POSTGRES_DB || 'optica_db';

  await new Promise((resolve, reject) => {
    const restoreArgs = [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      dbUser,
      '-d',
      dbName,
      '-v',
      'ON_ERROR_STOP=1',
    ];

    const child = spawn('docker', restoreArgs, {
      cwd: rootDir,
      stdio: ['pipe', 'inherit', 'pipe'],
    });

    const inputStream = fs.createReadStream(backupPath);
    inputStream.pipe(child.stdin);
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql finalizo con codigo ${code}`));
        return;
      }
      resolve();
    });
  });

  console.log('Restauracion completada correctamente.');
  console.log(`  fuente: ${backupPath}`);
}

run().catch((error) => {
  console.error('Error restaurando backup:', error.message);
  process.exitCode = 1;
});
