import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const THROTTLE_KEY = 'gocode:throttle';

export type ThrottleOptions = { limit: number; ttl: number };

/** Giữ nguyên API `@Throttle({ default: { limit, ttl } })` như @nestjs/throttler */
export function Throttle(opts: { default: ThrottleOptions }) {
  return SetMetadata(THROTTLE_KEY, opts.default);
}

type Bucket = { count: number; resetAt: number };
// In-memory theo instance (đủ chặn abuse cơ bản trên serverless)
const buckets = new Map<string, Bucket>();

function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const cfg = this.reflector.getAllAndOverride<ThrottleOptions>(
      THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!cfg) return true;

    const req = context.switchToHttp().getRequest() as {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    };
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip =
      req.ip ??
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) ??
      'unknown';
    const key = `${ip}:${context.getClass().name}:${context.getHandler().name}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + cfg.ttl };
      buckets.set(key, bucket);
      if (buckets.size > 5000) sweepExpired(now);
    }
    bucket.count += 1;
    if (bucket.count > cfg.limit) {
      throw new HttpException(
        'Quá nhiều yêu cầu, vui lòng thử lại sau',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
