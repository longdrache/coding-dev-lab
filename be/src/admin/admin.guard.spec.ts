import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from './admin.guard.ts';

function ctx(req: unknown) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe('AdminGuard', () => {
  const okSvc = { verifyJwt: vi.fn().mockResolvedValue({ sub: 'admin', role: 'admin' }) };
  const guard = new AdminGuard(okSvc as any);

  it('ném 401 khi thiếu token', async () => {
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toThrow(/admin token/i);
  });

  it('nhận token qua cookie', async () => {
    const req: Record<string, unknown> = { cookies: { admin_token: 't' }, headers: {} };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.admin).toEqual({ sub: 'admin', role: 'admin' });
  });

  it('nhận token qua Bearer và raw Cookie header', async () => {
    await expect(guard.canActivate(ctx({ headers: { authorization: 'Bearer t' } }))).resolves.toBe(
      true,
    );
    await expect(
      guard.canActivate(ctx({ headers: { cookie: 'a=1; admin_token=t' } })),
    ).resolves.toBe(true);
  });

  it('ném 401 khi sai role hoặc token lỗi', async () => {
    const badRole = new AdminGuard({ verifyJwt: async () => ({ role: 'user' }) } as any);
    await expect(
      badRole.canActivate(ctx({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toThrow();
    const badToken = new AdminGuard({
      verifyJwt: async () => {
        throw new Error('bad');
      },
    } as any);
    await expect(
      badToken.canActivate(ctx({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toThrow();
  });
});
