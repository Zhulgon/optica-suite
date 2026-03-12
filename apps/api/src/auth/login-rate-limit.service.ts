import { Injectable } from '@nestjs/common';

type LoginAttemptState = {
  failedAttempts: number;
  windowStartMs: number;
  blockedUntilMs: number;
};

@Injectable()
export class LoginRateLimitService {
  private readonly state = new Map<string, LoginAttemptState>();

  private readonly windowMs = 15 * 60 * 1000;
  private readonly maxFailedAttempts = 20;
  private readonly blockMs = 10 * 60 * 1000;

  check(ipKey: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const current = this.state.get(ipKey);
    if (!current) {
      return { allowed: true };
    }

    if (current.blockedUntilMs > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((current.blockedUntilMs - now) / 1000),
      };
    }

    if (now - current.windowStartMs > this.windowMs) {
      this.state.set(ipKey, {
        failedAttempts: 0,
        windowStartMs: now,
        blockedUntilMs: 0,
      });
      return { allowed: true };
    }

    return { allowed: true };
  }

  recordFailure(ipKey: string) {
    const now = Date.now();
    const current = this.state.get(ipKey);
    if (!current || now - current.windowStartMs > this.windowMs) {
      this.state.set(ipKey, {
        failedAttempts: 1,
        windowStartMs: now,
        blockedUntilMs: 0,
      });
      return;
    }

    current.failedAttempts += 1;
    if (current.failedAttempts >= this.maxFailedAttempts) {
      current.failedAttempts = 0;
      current.blockedUntilMs = now + this.blockMs;
    }
    this.state.set(ipKey, current);
  }

  recordSuccess(ipKey: string) {
    this.state.delete(ipKey);
  }
}
