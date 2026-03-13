import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisClientType, createClient } from 'redis';

type LoginAttemptState = {
  failedAttempts: number;
  windowStartMs: number;
  blockedUntilMs: number;
};

type LoginRateLimitScope = 'ip' | 'email';

@Injectable()
export class LoginRateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly state = new Map<string, LoginAttemptState>();
  private redisClient: RedisClientType | null = null;
  private redisReady = false;

  private readonly windowSeconds = this.parseEnvInt(
    process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    15 * 60,
  );
  private readonly maxFailedAttempts = this.parseEnvInt(
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    20,
  );
  private readonly maxFailedAttemptsByEmail = this.parseEnvInt(
    process.env.LOGIN_RATE_LIMIT_EMAIL_MAX_ATTEMPTS,
    10,
  );
  private readonly blockSeconds = this.parseEnvInt(
    process.env.LOGIN_RATE_LIMIT_BLOCK_SECONDS,
    10 * 60,
  );

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return;

    try {
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.on('error', (error) => {
        console.warn('LOGIN_RATE_LIMIT_REDIS_ERROR', error);
      });
      await this.redisClient.connect();
      this.redisReady = true;
      console.log('LOGIN_RATE_LIMIT_REDIS_CONNECTED');
    } catch (error) {
      this.redisReady = false;
      this.redisClient = null;
      console.warn('LOGIN_RATE_LIMIT_REDIS_FALLBACK', error);
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.disconnect().catch(() => null);
      this.redisClient = null;
      this.redisReady = false;
    }
  }

  async check(
    key: string,
    scope: LoginRateLimitScope = 'ip',
  ): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
    if (this.redisReady && this.redisClient) {
      try {
        const blockedKey = this.getBlockedKey(scope, key);
        const blockedTtl = await this.redisClient.ttl(blockedKey);
        if (blockedTtl > 0) {
          return {
            allowed: false,
            retryAfterSeconds: blockedTtl,
          };
        }
        return { allowed: true };
      } catch {
        return this.memoryCheck(this.getMemoryStateKey(scope, key));
      }
    }

    return this.memoryCheck(this.getMemoryStateKey(scope, key));
  }

  async recordFailure(
    key: string,
    scope: LoginRateLimitScope = 'ip',
  ): Promise<void> {
    if (this.redisReady && this.redisClient) {
      try {
        const attemptKey = this.getAttemptKey(scope, key);
        const blockedKey = this.getBlockedKey(scope, key);
        const attempts = await this.redisClient.incr(attemptKey);
        if (attempts === 1) {
          await this.redisClient.expire(attemptKey, this.windowSeconds);
        }
        if (attempts >= this.getMaxAttemptsByScope(scope)) {
          await this.redisClient.del(attemptKey);
          await this.redisClient.set(blockedKey, '1', {
            EX: this.blockSeconds,
          });
        }
        return;
      } catch {
        this.memoryRecordFailure(this.getMemoryStateKey(scope, key), scope);
        return;
      }
    }

    this.memoryRecordFailure(this.getMemoryStateKey(scope, key), scope);
  }

  async recordSuccess(
    key: string,
    scope: LoginRateLimitScope = 'ip',
  ): Promise<void> {
    if (this.redisReady && this.redisClient) {
      try {
        await this.redisClient.del([
          this.getAttemptKey(scope, key),
          this.getBlockedKey(scope, key),
        ]);
      } catch {
        // Fallback to memory cleanup.
      }
    }

    this.state.delete(this.getMemoryStateKey(scope, key));
  }

  private parseEnvInt(raw: string | undefined, fallback: number) {
    const parsed = Number(raw ?? fallback);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }

  private getMaxAttemptsByScope(scope: LoginRateLimitScope) {
    return scope === 'email'
      ? this.maxFailedAttemptsByEmail
      : this.maxFailedAttempts;
  }

  private getAttemptKey(scope: LoginRateLimitScope, key: string) {
    return `rate:login:${scope}:attempts:${key}`;
  }

  private getBlockedKey(scope: LoginRateLimitScope, key: string) {
    return `rate:login:${scope}:blocked:${key}`;
  }

  private getMemoryStateKey(scope: LoginRateLimitScope, key: string) {
    return `${scope}:${key}`;
  }

  private memoryCheck(stateKey: string): {
    allowed: boolean;
    retryAfterSeconds?: number;
  } {
    const now = Date.now();
    const current = this.state.get(stateKey);
    if (!current) {
      return { allowed: true };
    }

    if (current.blockedUntilMs > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((current.blockedUntilMs - now) / 1000),
      };
    }

    if (now - current.windowStartMs > this.windowSeconds * 1000) {
      this.state.set(stateKey, {
        failedAttempts: 0,
        windowStartMs: now,
        blockedUntilMs: 0,
      });
    }

    return { allowed: true };
  }

  private memoryRecordFailure(
    stateKey: string,
    scope: LoginRateLimitScope,
  ) {
    const now = Date.now();
    const current = this.state.get(stateKey);
    const maxAttempts = this.getMaxAttemptsByScope(scope);
    if (!current || now - current.windowStartMs > this.windowSeconds * 1000) {
      this.state.set(stateKey, {
        failedAttempts: 1,
        windowStartMs: now,
        blockedUntilMs: 0,
      });
      return;
    }

    current.failedAttempts += 1;
    if (current.failedAttempts >= maxAttempts) {
      current.failedAttempts = 0;
      current.blockedUntilMs = now + this.blockSeconds * 1000;
    }
    this.state.set(stateKey, current);
  }
}
