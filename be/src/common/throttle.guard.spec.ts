import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Throttle, ThrottleGuard } from './throttle.guard.ts';

class CtlA {
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  limited() {}
}

class CtlB {
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  limited() {}
  open() {}
}

function ctx(handler: () => unknown, cls: unknown, ip = '1.2.3.4') {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ ip, headers: {} }) }),
  } as any;
}

describe('ThrottleGuard', () => {
  it('cho qua khi không gắn metadata', () => {
    const guard = new ThrottleGuard(new Reflector());
    expect(guard.canActivate(ctx(CtlB.prototype.open, CtlB))).toBe(true);
  });

  it('chặn 429 khi vượt limit trong TTL', () => {
    const guard = new ThrottleGuard(new Reflector());
    const c = ctx(CtlA.prototype.limited, CtlA);
    expect(guard.canActivate(c)).toBe(true);
    expect(guard.canActivate(c)).toBe(true);
    expect(() => guard.canActivate(c)).toThrow(/Quá nhiều yêu cầu/);
  });

  it('đếm riêng theo IP', () => {
    const guard = new ThrottleGuard(new Reflector());
    expect(guard.canActivate(ctx(CtlB.prototype.limited, CtlB, '9.9.9.9'))).toBe(true);
    expect(guard.canActivate(ctx(CtlB.prototype.limited, CtlB, '9.9.9.9'))).toBe(true);
    expect(() => guard.canActivate(ctx(CtlB.prototype.limited, CtlB, '9.9.9.9'))).toThrow();
    // IP khác vẫn qua
    expect(guard.canActivate(ctx(CtlB.prototype.limited, CtlB, '8.8.8.8'))).toBe(true);
  });
});
