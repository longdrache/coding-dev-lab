import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from './admin.guard.ts';

function ctx(req: unknown) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe('AdminGuard', () => {
  const okSvc = { verifyJwt: vi.fn().mockReturnValue({ sub: 'admin', role: 'admin' }) };
  const guard = new AdminGuard(okSvc as any);

  it('ném 401 khi thiếu token', () => {
    expect(() => guard.canActivate(ctx({ headers: {} }))).toThrow(/admin token/i);
  });

  it('nhận token qua cookie', () => {
    const req: Record<string, unknown> = { cookies: { admin_token: 't' }, headers: {} };
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(req.admin).toEqual({ sub: 'admin', role: 'admin' });
  });

  it('nhận token qua Bearer và raw Cookie header', () => {
    expect(guard.canActivate(ctx({ headers: { authorization: 'Bearer t' } }))).toBe(true);
    expect(
      guard.canActivate(ctx({ headers: { cookie: 'a=1; admin_token=t' } })),
    ).toBe(true);
  });

  it('ném 401 khi sai role hoặc token lỗi', () => {
    const badRole = new AdminGuard({ verifyJwt: () => ({ role: 'user' }) } as any);
    expect(() => badRole.canActivate(ctx({ headers: { authorization: 'Bearer t' } }))).toThrow();
    const badToken = new AdminGuard({
      verifyJwt: () => {
        throw new Error('bad');
      },
    } as any);
    expect(() => badToken.canActivate(ctx({ headers: { authorization: 'Bearer t' } }))).toThrow();
  });
});
