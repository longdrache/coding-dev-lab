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

// KHÔNG có giá trị mặc định cho `ip`: nếu có, lời gọi `ctx(h, c, undefined)` sẽ âm
// thầm thành `ip = '1.2.3.4'` và test "thiếu req.ip" thành vô nghĩa.
function ctx(handler: () => unknown, cls: unknown, ip?: string, headers?: Record<string, unknown>) {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ ip, headers }) }),
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

  it('chỉ dựa vào req.ip — không tự đọc x-forwarded-for', () => {
    // `req.ip` đã là IP client thật (trust proxy bật ở entry point). Nếu guard tự
    // đọc header thì kẻ spam chỉ cần tiêm `x-forwarded-for` là sang bucket khác.
    const g1 = new ThrottleGuard(new Reflector());
    // IP riêng cho test này: bộ đếm trong `throttle.guard.ts` là module-level và
    // dùng chung cho mọi test trong file.
    const req = (ip: string) => ctx(CtlB.prototype.limited, CtlB, ip, { 'x-forwarded-for': '1.1.1.1' });
    expect(g1.canActivate(req('7.7.7.7'))).toBe(true);
    expect(g1.canActivate(req('7.7.7.7'))).toBe(true);
    expect(() => g1.canActivate(req('7.7.7.7'))).toThrow(/Quá nhiều yêu cầu/);
  });

  it('thiếu req.ip thì gom vào bucket unknown chứ không tách theo x-forwarded-for', () => {
    // Đây là chỗ duy nhất bắt được việc đọc `x-forwarded-for` thủ công quay lại:
    // không có `req.ip` thì tự đọc header sẽ tách mỗi giá trị header ra một bucket
    // riêng, tức kẻ spam chỉ cần đổi một số trong header là thoát giới hạn.
    const guard = new ThrottleGuard(new Reflector());
    const noIp = (headers?: Record<string, unknown>) =>
      ctx(CtlB.prototype.limited, CtlB, undefined as unknown as string, headers);
    expect(guard.canActivate(noIp())).toBe(true);
    expect(guard.canActivate(noIp({ 'x-forwarded-for': '5.5.5.5' }))).toBe(true);
    expect(() => guard.canActivate(noIp({ 'x-forwarded-for': '6.6.6.6' }))).toThrow(/Quá nhiều yêu cầu/);
  });
});
