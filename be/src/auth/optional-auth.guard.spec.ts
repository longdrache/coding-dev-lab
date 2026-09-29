import { generateKeyPairSync } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { OptionalAuthGuard } from './optional-auth.guard.ts';
import { signAccessToken } from './tokens.ts';
import type { UserRole } from './auth.types.ts';

const OLD = { ...process.env };

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    pub: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const CHINH = keypair();
const KHAC = keypair();
process.env.ADMIN_JWT_PRIVATE_KEY = CHINH.priv;
process.env.ADMIN_JWT_PUBLIC_KEY = CHINH.pub;

afterAll(() => {
  process.env = { ...OLD };
});

async function signRac(userId: number, role: UserRole): Promise<string> {
  process.env.ADMIN_JWT_PRIVATE_KEY = KHAC.priv;
  process.env.ADMIN_JWT_PUBLIC_KEY = KHAC.pub;
  try {
    return await signAccessToken(userId, role);
  } finally {
    process.env.ADMIN_JWT_PRIVATE_KEY = CHINH.priv;
    process.env.ADMIN_JWT_PUBLIC_KEY = CHINH.pub;
  }
}

function ctx(headers: Record<string, unknown> = {}, cookies?: Record<string, string>) {
  const req: any = { headers };
  if (cookies) req.cookies = cookies;
  return {
    req,
    c: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext,
  };
}

function guard() {
  return new OptionalAuthGuard();
}

describe('OptionalAuthGuard — không có token thì vẫn cho qua', () => {
  it('không cookie lẫn header: 200, req.user undefined (khách)', async () => {
    const { req, c } = ctx();
    await expect(guard().canActivate(c)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('cookie rỗng: vẫn cho qua, không coi là đã đăng nhập', async () => {
    const { req, c } = ctx({ cookie: 'session=; refresh=abc' });
    await expect(guard().canActivate(c)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('cookie rác: cho qua như khách, KHÔNG ném 401', async () => {
    const { req, c } = ctx({ cookie: 'session=khong-phai-jwt' });
    await expect(guard().canActivate(c)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('token ký bằng cặp khoá khác: cho qua như khách, không ném', async () => {
    const jwt = await signRac(9, 'admin');
    const { req, c } = ctx({ cookie: `session=${jwt}` });
    await expect(guard().canActivate(c)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('cookie hỏng dấu phần trăm: cho qua, không 500', async () => {
    const { req, c } = ctx({ cookie: 'session=%E0%A4%A' });
    await expect(guard().canActivate(c)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('header sai kiểu: cho qua, không 500', async () => {
    const jwt = await signAccessToken(7, 'admin');
    const { req, c } = ctx({ authorization: [`Bearer ${jwt}`] });
    await expect(guard().canActivate(c)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });
});

describe('OptionalAuthGuard — có token hợp lệ thì gắn role', () => {
  it('cookie req.cookies.session', async () => {
    const jwt = await signAccessToken(7, 'vip');
    const { req, c } = ctx({}, { session: jwt });
    await expect(guard().canActivate(c)).resolves.toBe(true);
    expect(req.user).toEqual({ userId: '7', role: 'vip', roles: ['vip'] });
  });

  it('header Cookie thô', async () => {
    const jwt = await signAccessToken(7, 'vip');
    const { req, c } = ctx({ cookie: `foo=1; session=${jwt}` });
    await guard().canActivate(c);
    expect(req.user.role).toBe('vip');
  });

  it('Authorization: Bearer khi không có cookie', async () => {
    const jwt = await signAccessToken(7, 'admin');
    const { req, c } = ctx({ authorization: `Bearer ${jwt}` });
    await guard().canActivate(c);
    expect(req.user).toEqual({ userId: '7', role: 'admin', roles: ['admin'] });
  });

  it('cookie session thắng header Authorization — y hệt AuthGuard', async () => {
    const trongCookie = await signAccessToken(7, 'vip');
    const trongBearer = await signAccessToken(9, 'admin');
    const { req, c } = ctx({
      cookie: `session=${trongCookie}`,
      authorization: `Bearer ${trongBearer}`,
    });
    await guard().canActivate(c);
    expect(req.user.userId).toBe('7');
    expect(req.user.roles).toEqual(['vip']);
  });

  it('role user: gắn role đúng user, không nâng thành vip', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}` });
    await guard().canActivate(c);
    expect(req.user.roles).toEqual(['user']);
  });

  it('lấy refresh token thô cho logout, y hệt AuthGuard', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}; refresh=${'a'.repeat(64)}` });
    await guard().canActivate(c);
    expect(req.refreshToken).toBe('a'.repeat(64));
  });
});
