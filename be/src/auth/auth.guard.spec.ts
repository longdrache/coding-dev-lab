import { generateKeyPairSync } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard.ts';
import { Roles } from './roles.decorator.ts';
import { RolesGuard } from './roles.guard.ts';
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

// Khoá tự sinh, không đọc be/.env (giống tokens.spec.ts). Guard gọi
// verifyAccessToken thật nên spec này cần cặp khoá hợp lệ; đặt ở cấp module để
// có hiệu lực trước mọi lời gọi signAccessToken, vì tokens.ts nạp khoá lazy.
const CHINH = keypair();
const KHAC = keypair();
process.env.ADMIN_JWT_PRIVATE_KEY = CHINH.priv;
process.env.ADMIN_JWT_PUBLIC_KEY = CHINH.pub;

afterAll(() => {
  process.env = { ...OLD };
});

/**
 * Token đúng cấu trúc RS256 nhưng ký bằng cặp khoá khác: đây là trường hợp
 * `verifyAccessToken` **phải** từ chối, không phải token rác. Khoá được trả về
 * cặp CHINH trước khi guard xác minh.
 */
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
  return new AuthGuard();
}

class CtlAdmin {
  @Roles('admin')
  onlyAdmin() {}
}

/** Chạy RolesGuard thật lên chính request mà AuthGuard vừa gán, để canh đúng hợp đồng. */
function rolesGuardCho(req: any) {
  const roles = new RolesGuard(new Reflector());
  const c = {
    getHandler: () => CtlAdmin.prototype.onlyAdmin,
    getClass: () => CtlAdmin,
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
  return () => roles.canActivate(c);
}

describe('đọc token theo thứ tự ưu tiên', () => {
  it('không có cookie lẫn header nào thì 401', async () => {
    const { c } = ctx();
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  it('đã mount cookie-parser thì đọc được req.cookies.session', async () => {
    const jwt = await signAccessToken(7, 'vip');
    const { req, c } = ctx({}, { session: jwt });
    expect(await guard().canActivate(c)).toBe(true);
    expect(req.user.userId).toBe('7');
    expect(req.user.role).toBe('vip');
  });

  it('chỉ có header Cookie thô, không có req.cookies, thì vẫn xác thực được', async () => {
    const jwt = await signAccessToken(7, 'vip');
    const { req, c } = ctx({ cookie: `foo=1; session=${jwt}` });
    expect(await guard().canActivate(c)).toBe(true);
    expect(req.user.userId).toBe('7');
    expect(req.user.role).toBe('vip');
  });

  it('req.cookies có cookie khác thì vẫn đọc được session từ header Cookie thô', async () => {
    const jwt = await signAccessToken(7, 'vip');
    const { req, c } = ctx({ cookie: `session=${jwt}` }, { theme: 'dark' });
    expect(await guard().canActivate(c)).toBe(true);
    expect(req.user.userId).toBe('7');
  });

  it('req.cookies.session thắng cả header Cookie thô', async () => {
    const trongCookies = await signAccessToken(7, 'vip');
    const trongHeader = await signAccessToken(9, 'admin');
    const { req, c } = ctx({ cookie: `session=${trongHeader}` }, { session: trongCookies });
    await guard().canActivate(c);
    expect(req.user.userId).toBe('7');
    expect(req.user.roles).toEqual(['vip']);
  });

  it('cookie session thắng header Authorization', async () => {
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

  it('không có cookie thì lấy token từ Authorization: Bearer', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ authorization: `Bearer ${jwt}` });
    expect(await guard().canActivate(c)).toBe(true);
    expect(req.user.userId).toBe('7');
  });

  it('cookie rỗng thì 401, không coi là đã đăng nhập', async () => {
    const { c } = ctx({ cookie: 'session=; refresh=abc' });
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  it('tên cookie chỉ chứa chuỗi "session" không được tính là cookie session', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { c } = ctx({ cookie: `mysession=${jwt}; session_extra=1; xsession_id=2` });
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });
});

describe('từ chối token không hợp lệ', () => {
  it('cookie không phải JWT thì 401', async () => {
    const { c } = ctx({ cookie: 'session=khong-phai-jwt' });
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  it('token ký bằng cặp khoá khác thì 401', async () => {
    const jwt = await signRac(9, 'admin');
    const { req, c } = ctx({ cookie: `session=${jwt}` });
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
    // Từ chối thì không được gán bất cứ thứ gì lên request.
    expect(req.user).toBeUndefined();
  });

  it('Authorization không phải scheme Bearer thì 401', async () => {
    const jwt = await signAccessToken(7, 'admin');
    for (const authorization of [`BearerX${jwt}`, `Basic ${jwt}`, jwt]) {
      const { c } = ctx({ authorization });
      await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
    }
  });

  it('cookie hỏng dấu phần trăm thì 401 chứ không phải 500', async () => {
    const { c } = ctx({ cookie: 'session=%E0%A4%A' });
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  // Characterization test: Node luôn gộp header trùng thành chuỗi, nên mảng là
  // đầu vào mà http parser không tạo ra. Ghi lại để canh đúng điều guard hứa:
  // header sai kiểu thì từ chối 401, không để lỗi TypeError nổi lên thành 500.
  it('header sai kiểu thì 401 chứ không phải 500', async () => {
    const jwt = await signAccessToken(7, 'admin');
    for (const headers of [{ authorization: [`Bearer ${jwt}`] }, { cookie: [`session=${jwt}`] }]) {
      const { c } = ctx(headers);
      await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
    }
  });

  it('thông báo 401 không rò token ra ngoài', async () => {
    const jwt = await signAccessToken(9, 'admin');
    const thieu = await guard().canActivate(ctx().c).catch((x) => x);
    const sai = await guard().canActivate(ctx({ cookie: `session=${jwt}x` }).c).catch((x) => x);
    expect(thieu.status).toBe(401);
    expect(sai.status).toBe(401);
    expect(thieu.message.length).toBeGreaterThan(0);
    expect(sai.message.length).toBeGreaterThan(0);
    expect(thieu.message).not.toContain(jwt);
    expect(sai.message).not.toContain(jwt);
  });
});

describe('hình dạng req.user', () => {
  it('gán đúng hình dạng AuthenticatedUser cho RolesGuard và controller', async () => {
    const jwt = await signAccessToken(7, 'vip');
    const { req, c } = ctx({ cookie: `session=${jwt}` });
    await guard().canActivate(c);
    expect(req.user).toEqual({ userId: '7', role: 'vip', roles: ['vip'] });
  });

  it('token role user thì RolesGuard chặn @Roles(admin) bằng 403', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}` });
    await guard().canActivate(c);
    expect(() => rolesGuardCho(req)()).toThrowError(ForbiddenException);
  });

  it('token role admin thì RolesGuard cho qua @Roles(admin)', async () => {
    const jwt = await signAccessToken(9, 'admin');
    const { req, c } = ctx({ cookie: `session=${jwt}` });
    await guard().canActivate(c);
    expect(rolesGuardCho(req)()).toBe(true);
  });
});

describe('refresh token thô cho logout', () => {
  const REFRESH = 'a'.repeat(64);

  it('lấy refresh token thô từ header Cookie thô', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}; refresh=${REFRESH}` });
    await guard().canActivate(c);
    expect(req.refreshToken).toBe(REFRESH);
  });

  it('lấy refresh token từ req.cookies khi đã mount cookie-parser', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({}, { session: jwt, refresh: REFRESH });
    await guard().canActivate(c);
    expect(req.refreshToken).toBe(REFRESH);
  });

  it('không có cookie refresh thì không gán req.refreshToken', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}` });
    await guard().canActivate(c);
    expect(req.refreshToken).toBeUndefined();
  });

  it('refresh token bị encode phần trăm, kèm khoảng trắng thừa, thì đọc ra giá trị gốc', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}; refresh=a%2Bb ` });
    await guard().canActivate(c);
    expect(req.refreshToken).toBe('a+b');
  });

  it('refresh token hỏng dấu phần trăm thì giữ nguyên giá trị thô, không ném lỗi', async () => {
    const jwt = await signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}; refresh=%E0%A4%A` });
    await guard().canActivate(c);
    expect(req.refreshToken).toBe('%E0%A4%A');
  });
});
