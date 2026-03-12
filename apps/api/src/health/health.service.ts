import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type HealthStatus = 'ok' | 'degraded';

type HealthReport = {
  status: HealthStatus;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: {
    api: 'ok';
    database: {
      status: 'ok' | 'error';
      latencyMs: number;
      error?: string;
    };
    memory: {
      rssMb: number;
      heapUsedMb: number;
    };
  };
};

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getLiveness() {
    const memoryUsage = process.memoryUsage();
    return {
      status: 'ok',
      service: 'optica-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.0',
      checks: {
        api: 'ok',
        memory: {
          rssMb: this.toMb(memoryUsage.rss),
          heapUsedMb: this.toMb(memoryUsage.heapUsed),
        },
      },
    };
  }

  async getReadiness(): Promise<HealthReport> {
    const dbCheck = await this.checkDatabase();
    const memoryUsage = process.memoryUsage();

    return {
      status: dbCheck.status === 'ok' ? 'ok' : 'degraded',
      service: 'optica-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.0',
      checks: {
        api: 'ok',
        database: dbCheck,
        memory: {
          rssMb: this.toMb(memoryUsage.rss),
          heapUsedMb: this.toMb(memoryUsage.heapUsed),
        },
      },
    };
  }

  private async checkDatabase() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok' as const,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: 'error' as const,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'database check failed',
      };
    }
  }

  private toMb(bytes: number) {
    return Number((bytes / 1024 / 1024).toFixed(2));
  }
}
