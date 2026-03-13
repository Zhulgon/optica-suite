import { Injectable } from '@nestjs/common';
import { createClient } from 'redis';
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
    redis: {
      status: 'ok' | 'error' | 'skipped';
      latencyMs: number;
      error?: string;
      detail?: string;
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
    const [dbCheck, redisCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const memoryUsage = process.memoryUsage();
    const isRedisHealthy =
      redisCheck.status === 'ok' || redisCheck.status === 'skipped';

    return {
      status: dbCheck.status === 'ok' && isRedisHealthy ? 'ok' : 'degraded',
      service: 'optica-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.0',
      checks: {
        api: 'ok',
        database: dbCheck,
        redis: redisCheck,
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

  private async checkRedis() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      return {
        status: 'skipped' as const,
        latencyMs: 0,
        detail: 'REDIS_URL no configurado',
      };
    }

    const startedAt = Date.now();
    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 1500,
      },
    });

    try {
      await client.connect();
      await client.ping();
      return {
        status: 'ok' as const,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: 'error' as const,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'redis check failed',
      };
    } finally {
      if (client.isOpen) {
        await client.quit().catch(() => undefined);
      }
    }
  }

  private toMb(bytes: number) {
    return Number((bytes / 1024 / 1024).toFixed(2));
  }
}
