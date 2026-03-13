import { BadRequestException, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

@Injectable()
export class OpsService {
  private readonly rootDir = path.resolve(__dirname, '../../../../..');
  private readonly backupDir = path.resolve(this.rootDir, 'data', 'backups');
  private readonly backupScript = path.resolve(this.rootDir, 'scripts', 'db-backup.js');
  private readonly restoreScript = path.resolve(this.rootDir, 'scripts', 'db-restore.js');

  private async runNodeScript(scriptPath: string, args: string[]) {
    const nodeExec = process.execPath;
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(nodeExec, [scriptPath, ...args], {
        cwd: this.rootDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code !== 0) {
          reject(
            new BadRequestException(
              `Proceso finalizo con error (${code}). ${stderr || stdout}`.trim(),
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }

  async listBackups() {
    await fs.mkdir(this.backupDir, { recursive: true });
    const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
        .map(async (entry) => {
          const fullPath = path.join(this.backupDir, entry.name);
          const stats = await fs.stat(fullPath);
          return {
            fileName: entry.name,
            sizeBytes: stats.size,
            sizeKb: Math.round(stats.size / 1024),
            modifiedAt: stats.mtime.toISOString(),
          };
        }),
    );

    files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return {
      success: true,
      total: files.length,
      data: files,
    };
  }

  async createBackup(keep?: number) {
    const args: string[] = [];
    if (typeof keep === 'number' && Number.isFinite(keep) && keep > 0) {
      args.push('--keep', String(Math.floor(keep)));
    }
    const result = await this.runNodeScript(this.backupScript, args);
    return {
      success: true,
      output: result.stdout.trim(),
    };
  }

  async restoreBackup(fileName: string, confirmText: string) {
    if (confirmText.trim().toUpperCase() !== 'RESTORE') {
      throw new BadRequestException(
        'Confirmacion invalida. Debes enviar confirmText=RESTORE',
      );
    }

    const normalized = path.basename(fileName.trim());
    if (!normalized.endsWith('.sql')) {
      throw new BadRequestException('Solo se permiten archivos .sql');
    }
    const absolute = path.resolve(this.backupDir, normalized);
    if (!absolute.startsWith(this.backupDir)) {
      throw new BadRequestException('Ruta de backup invalida');
    }

    try {
      await fs.access(absolute);
    } catch {
      throw new BadRequestException('El backup solicitado no existe');
    }

    const relativeBackupPath = path.relative(this.rootDir, absolute).replace(/\\/g, '/');
    const result = await this.runNodeScript(this.restoreScript, [
      '--file',
      relativeBackupPath,
      '--yes',
    ]);
    return {
      success: true,
      output: result.stdout.trim(),
    };
  }
}
