const fs = require('node:fs');
const path = require('node:path');

function run() {
  const rootDir = path.resolve(__dirname, '..');
  const backupDir = path.resolve(rootDir, 'data', 'backups');

  if (!fs.existsSync(backupDir)) {
    console.log('No existe carpeta de backups:', backupDir);
    return;
  }

  const entries = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        name: entry.name,
        sizeKb: Math.round(stats.size / 1024),
        modifiedAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  if (!entries.length) {
    console.log('No hay backups .sql en', backupDir);
    return;
  }

  console.log('Backups disponibles:');
  for (const entry of entries) {
    console.log(
      `  - ${entry.name} | ${entry.sizeKb} KB | ${entry.modifiedAt}`,
    );
  }
}

run();
