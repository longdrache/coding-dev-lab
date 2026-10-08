import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { AdminService } from './admin.service.ts';

const OLD = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  process.env = { ...OLD };
});

function rsaKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return { priv, pub };
}

describe('AdminService login + verifyJwt (RS256)', () => {
  it('login plaintext ở dev rồi verify RS256 ra role admin', async () => {
    const { priv, pub } = rsaKeys();
    setEnv({
      ADMIN_EMAIL: 'admin',
      ADMIN_PASSWORD: 'admin',
      ADMIN_PASSWORD_HASH: undefined,
      ADMIN_JWT_PRIVATE_KEY: priv,
      ADMIN_JWT_PUBLIC_KEY: pub,
      NODE_ENV: 'test',
      VERCEL: undefined,
    });
    const svc = new AdminService({} as any);
    const { token, refreshToken } = await svc.login('admin', 'admin');
    const payload = (await svc.verifyJwt(token)) as { role: string; typ: string };
    expect(payload.role).toBe('admin');
    expect(payload.typ).toBe('access');
    // Login phải trả **hai** token: chỉ access token 30 phút thì admin bị đá
    // khỏi app mỗi nửa tiếng và không có đường nào quay lại ngoài mật khẩu.
    expect((await svc.verifyJwt(refreshToken)).typ).toBe('refresh');
  });

  it('fallback HS256 ở dev, chặn ở production', async () => {
    setEnv({ NODE_ENV: 'test', VERCEL: undefined, JWT_SECRET: 'dev-secret-123', ADMIN_JWT_PUBLIC_KEY: undefined, ADMIN_PUBLIC_KEY: undefined });
    const svc = new AdminService({} as any);
    const legacy = await new SignJWT({ sub: 'admin', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('dev-secret-123'));
    expect(((await svc.verifyJwt(legacy)) as { role: string }).role).toBe('admin');

    setEnv({ NODE_ENV: 'production', VERCEL: '1' });
    await expect(svc.verifyJwt(legacy)).rejects.toThrow();
  });
});

describe('AdminService.getLoginAnalytics', () => {
  it('trả recent + byCountry, không query bảng User khi danh sách rỗng', async () => {
    const db = {
      loginEvent: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([{ country: 'VN', count: 2 }]),
    };
    const svc = new AdminService(db as any);
    const res = await svc.getLoginAnalytics();
    expect(res.recent).toEqual([]);
    expect(res.byCountry).toEqual([{ country: 'VN', count: 2 }]);
  });
});
