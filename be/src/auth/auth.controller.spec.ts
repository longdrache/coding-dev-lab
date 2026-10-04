import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpException, Logger } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { createHash, generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import { ThrottleGuard, THROTTLE_KEY } from '../common/throttle.guard.ts';
import {
  AuthController, OAUTH_STATE_COOKIE, REFRESH_COOKIE, SESSION_COOKIE,
} from './auth.controller.ts';
import { AuthGuard } from './auth.guard.ts';
import { AuthService, REFRESH_TTL_MS } from './auth.service.ts';
import { STATE_TTL_MS } from './oauth-state.ts';
import { ACCESS_TTL_SECONDS, signAccessToken } from './tokens.ts';
import type { UserRole } from './auth.types.ts';

const OLD_ENV = { ...process.env };

// `signedInUserId` xác minh cookie `session` bằng RS256 nên cần cặp khoá thật,
// đặt ở đây (sau khi chụp `OLD_ENV`) để spec không phụ thuộc `be/.env`.
{
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.ADMIN_JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.ADMIN_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

const FE = 'https://go-code.vercel.app';
const STATE = 's'.repeat(64);
const VERIFIER = 'v'.repeat(64);
const PROFILE = { sub: 'g-1', email: 'a@b.co', emailVerified: true, name: 'A B' };
/** PKCE S256: base64url(sha256(verifier)). Test tự tính lại, không chép từ controller. */
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

const USER = { id: 7, email: 'a@b.co', name: null, role: 'user' as UserRole };
const REFRESH = 'r'.repeat(64);
/** Câu duy nhất `forgotPassword` được phép trả về — controller chỉ chuyển tiếp. */
const RESET_MSG = 'Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.';
/** Câu duy nhất `resendVerification` được phép trả về — controller chỉ chuyển tiếp. */
const RESEND_MSG = 'Nếu email đó có tài khoản chưa xác minh, chúng tôi đã gửi lại link xác nhận.';

function ctl() {
  const auth = {
    register: vi.fn().mockResolvedValue({ message: 'ok' }),
    login: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: REFRESH, user: USER }),
    verifyEmail: vi.fn().mockResolvedValue({ accessToken: 'v', refreshToken: REFRESH, user: USER }),
    refresh: vi.fn().mockResolvedValue({ accessToken: 'b', refreshToken: 's'.repeat(64), user: USER }),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue(USER),
    forgotPassword: vi.fn().mockResolvedValue({ message: RESET_MSG }),
    resetPassword: vi.fn().mockResolvedValue(true),
    resendVerification: vi.fn().mockResolvedValue({ message: RESEND_MSG }),
    beginGoogleOAuth: vi.fn().mockResolvedValue({ state: STATE, codeVerifier: VERIFIER }),
    userIdForRefresh: vi.fn().mockResolvedValue(null),
    takeGoogleState: vi.fn().mockResolvedValue({ codeVerifier: VERIFIER, redirectTo: '/' }),
    googleProfile: vi.fn().mockResolvedValue(PROFILE),
    linkOrCreateFromGoogle: vi.fn().mockResolvedValue({ kind: 'ok', userId: 7 }),
    issueSessionForUserId: vi
      .fn()
      .mockResolvedValue({ accessToken: 'g', refreshToken: REFRESH }),
  };
  const res = { cookie: vi.fn(), clearCookie: vi.fn(), redirect: vi.fn() };
  return { c: new AuthController(auth as never), auth, res };
}

/** Cookie `session` luôn là lời gọi đầu, `refresh` là lời gọi sau. */
function opts(res: { cookie: ReturnType<typeof vi.fn> }, index: number) {
  return res.cookie.mock.calls[index][2] as {
    httpOnly: boolean; secure: boolean; sameSite: string; path: string; maxAge: number;
  };
}

function names(res: { clearCookie: ReturnType<typeof vi.fn> }) {
  return res.clearCookie.mock.calls.map((c) => c[0]);
}

/**
 * Request **có** cookie ràng buộc state, giá trị mặc định là chuỗi `'state'` — cùng
 * giá trị mà các test truyền vào `googleCallback` làm `?state=`.
 *
 * Mọi test callback đều phải đi qua đây, vì `callback` chặn ngay khi cookie lệch
 * với `?state=` (chống login CSRF). Test nào cố tình **không** khớp thì tự dựng
 * request riêng và assert rằng nó bị chặn — đó là hành vi cần bảo vệ, không phải
 * cách để làm test khác xanh.
 */
function req(headers: Record<string, unknown> = {}) {
  const cookie = [headers.cookie, `${OAUTH_STATE_COOKIE}=state`].filter(Boolean).join('; ');
  return { headers: { ...headers, cookie } };
}

/**
 * `process.env.X = undefined` ghi chuỗi `"undefined"` chứ không xoá biến, nên mọi
 * thao tác đặt/xoá biến môi trường trong spec này đi qua hai helper này.
 */
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restoreEnv('NODE_ENV', OLD_ENV.NODE_ENV);
  restoreEnv('VERCEL', OLD_ENV.VERCEL);
  // Phải khôi phục `GOOGLE_CLIENT_SECRET` như `FRONTEND_URL`: `start` kiểm cả ba
  // biến Google nên để sót biến đã đặt ở test trước là các test sau "chưa cấu
  // hình" xanh sai lý do.
  for (const k of [
    'FRONTEND_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
  ] as const) {
    restoreEnv(k, OLD_ENV[k]);
  }
});

/**
 * `Location` mà controller vừa phát ra. Luôn là **URL tuyệt đối** trỏ về FE: FE
 * và BE nằm trên hai domain khác nhau nên `Location: /sign-in` sẽ rơi vào domain
 * API và thành 404.
 */
function viDenFe(res: { redirect: ReturnType<typeof vi.fn> }): URL {
  const call = res.redirect.mock.calls[0];
  expect(call?.[0]).toBe(302);
  return new URL(call![1] as string);
}

afterAll(() => {
  process.env = { ...OLD_ENV };
});

describe('cookie phiên', () => {
  it('đăng nhập đặt cả hai cookie, httpOnly, path /', async () => {
    const { c, res } = ctl();
    const r = await c.login({ headers: {} }, { email: 'a@b.co', password: 'matkhau123' }, res);
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookie.mock.calls.map((x) => x[0])).toEqual([SESSION_COOKIE, REFRESH_COOKIE]);
    for (const i of [0, 1]) {
      expect(opts(res, i).httpOnly).toBe(true);
      expect(opts(res, i).path).toBe('/');
    }
    // `expiresIn` là thứ duy nhất FE biết hạn access token — token nằm trong
    // cookie httpOnly nên JS không đọc được `exp`.
    expect(r).toEqual({ user: USER, expiresIn: ACCESS_TTL_SECONDS });
  });

  it('cookie session sống ACCESS_TTL_SECONDS, cookie refresh sống REFRESH_TTL_MS', async () => {
    const { c, res } = ctl();
    await c.login({ headers: {} }, { email: 'a@b.co', password: 'matkhau123' }, res);
    expect(opts(res, 0).maxAge).toBe(ACCESS_TTL_SECONDS * 1000);
    expect(opts(res, 1).maxAge).toBe(REFRESH_TTL_MS);
    // Ghim số: hạn 15 phút và 30 ngày là hợp đồng với FE, không phải hằng vô nghĩa.
    expect(opts(res, 0).maxAge).toBe(900_000);
    expect(opts(res, 1).maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('xác minh email đặt cả hai cookie và trả user kèm expiresIn', async () => {
    const { c, auth, res } = ctl();
    const r = await c.verify('ma-xac-nhan', { headers: { 'user-agent': 'UA' } }, res);
    expect(auth.verifyEmail).toHaveBeenCalledWith('ma-xac-nhan', 'UA');
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(r.user).toEqual(USER);
    expect(r.expiresIn).toBe(ACCESS_TTL_SECONDS);
  });

  it('refresh xoay vòng: đặt lại cả hai cookie bằng token mới', async () => {
    const { c, res } = ctl();
    const r = await c.refresh({ headers: { cookie: `refresh=${REFRESH}` } }, res);
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookie.mock.calls[0][1]).toBe('b');
    expect(res.cookie.mock.calls[1][1]).toBe('s'.repeat(64));
    expect(r.expiresIn).toBe(ACCESS_TTL_SECONDS);
    expect(opts(res, 0).httpOnly).toBe(true);
  });

  it('ngoài production thì sameSite lax và secure false', async () => {
    setEnv('NODE_ENV', 'test');
    setEnv('VERCEL', undefined);
    const { c, res } = ctl();
    await c.login({ headers: {} }, { email: 'a@b.co', password: 'matkhau123' }, res);
    expect(opts(res, 0).sameSite).toBe('lax');
    expect(opts(res, 0).secure).toBe(false);
  });

  it('NODE_ENV=production thì sameSite none và secure true', async () => {
    setEnv('NODE_ENV', 'production');
    setEnv('VERCEL', undefined);
    const { c, res } = ctl();
    await c.login({ headers: {} }, { email: 'a@b.co', password: 'matkhau123' }, res);
    expect(opts(res, 0).sameSite).toBe('none');
    expect(opts(res, 0).secure).toBe(true);
  });

  it('chỉ có VERCEL=1 mà không NODE_ENV thì vẫn sameSite none và secure true', async () => {
    // Trên Vercel `NODE_ENV` có lúc không được set; thiếu nhánh này thì production
    // chạy cookie `lax` không `secure` và browser nuốt mất, ai cũng bị đăng xuất.
    setEnv('NODE_ENV', undefined);
    setEnv('VERCEL', '1');
    const { c, res } = ctl();
    await c.login({ headers: {} }, { email: 'a@b.co', password: 'matkhau123' }, res);
    expect(opts(res, 0).sameSite).toBe('none');
    expect(opts(res, 0).secure).toBe(true);
  });

  it('mã xác nhận hỏng thì 400 và không đặt cookie nào', async () => {
    const { c, auth, res } = ctl();
    auth.verifyEmail.mockResolvedValue(null);
    await expect(
      c.verify('het-han', { headers: {} }, res),
    ).rejects.toMatchObject({ status: 400 });
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('thông báo lỗi tiếng Việt và không rò mã xác nhận ra ngoài', async () => {
    const { c, auth, res } = ctl();
    auth.verifyEmail.mockResolvedValue(null);
    const e = await c.verify('mat-khau-bi-lo', { headers: {} }, res).catch((x) => x);
    expect(e.message).toBe('Mã xác nhận không hợp lệ hoặc đã hết hạn');
    expect(String(e.message)).not.toContain('mat-khau-bi-lo');
  });
});

describe('đọc cookie refresh', () => {
  it('req.cookies thắng header Cookie thô', async () => {
    const { c, auth, res } = ctl();
    await c.refresh(
      { headers: { cookie: 'refresh=tu-header' }, cookies: { refresh: 'tu-cookies' } },
      res,
    );
    expect(auth.refresh).toHaveBeenCalledWith('tu-cookies', undefined);
  });

  it('chỉ có header thô vẫn đọc được, kể cả cookie khác đứng trước', async () => {
    const { c, auth, res } = ctl();
    await c.refresh({ headers: { cookie: `session=jwt; refresh=${REFRESH}; flag=1` } }, res);
    expect(auth.refresh).toHaveBeenCalledWith(REFRESH, undefined);
  });

  it('tên cookie chỉ chứa chuỗi refresh không được tính là cookie refresh', async () => {
    const { c, auth, res } = ctl();
    await expect(
      c.refresh({ headers: { cookie: 'xrefresh=gia; my_refresh=gia' } }, res),
    ).rejects.toMatchObject({ status: 401 });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('giá trị cookie hỏng dấu phần trăm thì vẫn xuống service chứ không thành 500', async () => {
    const { c, auth, res } = ctl();
    await c.refresh({ headers: { cookie: 'refresh=%' } }, res);
    expect(auth.refresh).toHaveBeenCalledWith('%', undefined);
  });

  it('không có cookie refresh thì 401 và xoá cả hai cookie', async () => {
    // Không có cookie `refresh` nghĩa là không có phiên: 401 (không phải 200), và
    // cookie `session` cũ phải bị dọn để không treo.
    const { c, auth, res } = ctl();
    await expect(c.refresh({ headers: {} }, res)).rejects.toMatchObject({ status: 401 });
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(names(res)).toEqual([SESSION_COOKIE, REFRESH_COOKIE]);
    for (const call of res.clearCookie.mock.calls) {
      expect(call[1]).toEqual({ path: '/' });
    }
  });

  it('thông báo khi không có phiên là tiếng Việt', async () => {
    const { c, res } = ctl();
    const e = await c.refresh({ headers: {} }, res).catch((x) => x);
    expect(e.message).toBe('Không có phiên để làm mới');
  });

  it('refresh token không dùng được thì xoá cả hai cookie ở path /', async () => {
    const { c, auth, res } = ctl();
    auth.refresh.mockResolvedValue(null);
    const r = await c.refresh({ headers: { cookie: `refresh=${REFRESH}` } }, res);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(names(res)).toEqual([SESSION_COOKIE, REFRESH_COOKIE]);
    for (const call of res.clearCookie.mock.calls) {
      expect(call[1]).toEqual({ path: '/' });
    }
    expect(r).toEqual({ message: 'Phiên đã hết hạn, vui lòng đăng nhập lại.' });
  });
});

describe('đăng xuất', () => {
  it('xoá cả hai cookie ở path /', async () => {
    const { c, res } = ctl();
    const r = await c.logout({ headers: { cookie: `refresh=${REFRESH}` } }, res);
    expect(names(res)).toEqual([SESSION_COOKIE, REFRESH_COOKIE]);
    for (const call of res.clearCookie.mock.calls) {
      expect(call[1]).toEqual({ path: '/' });
    }
    expect(r).toEqual({ ok: true });
  });

  it('xoá cookie production bằng đúng thuộc tính đã tạo cookie', async () => {
    setEnv('NODE_ENV', 'production');
    setEnv('VERCEL', undefined);
    const { c, res } = ctl();
    await c.logout({ headers: { cookie: `refresh=${REFRESH}` } }, res);
    const expected = {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };
    expect(res.clearCookie).toHaveBeenNthCalledWith(1, SESSION_COOKIE, expected);
    expect(res.clearCookie).toHaveBeenNthCalledWith(2, REFRESH_COOKIE, expected);
  });

  it('xoá được dòng phiên trong DB kể cả khi guard không gán req.refreshToken', async () => {
    // `req.refreshToken` chỉ được `AuthGuard` gán mà `logout` không dùng guard
    // (access token có thể đã hết hạn). Nếu controller chỉ tin `req.refreshToken`
    // thì đăng xuất là no-op và token sống tới hạn 30 ngày.
    const { c, auth, res } = ctl();
    await c.logout({ headers: { cookie: `session=jwt; refresh=${REFRESH}` } }, res);
    expect(auth.logout).toHaveBeenCalledWith(REFRESH);
  });

  it('có req.refreshToken thì ưu tiên giá trị guard gán', async () => {
    const { c, auth, res } = ctl();
    await c.logout({ headers: { cookie: 'refresh=tu-cookie' }, refreshToken: 'tu-guard' }, res);
    expect(auth.logout).toHaveBeenCalledWith('tu-guard');
  });

  it('không có refresh token thì không gọi service nhưng vẫn xoá cookie', async () => {
    const { c, auth, res } = ctl();
    const r = await c.logout({ headers: {} }, res);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(names(res)).toEqual([SESSION_COOKIE, REFRESH_COOKIE]);
    expect(r).toEqual({ ok: true });
  });
});

describe('userId chuỗi của guard thành number', () => {
  it('me truyền number, không phải chuỗi', async () => {
    const { c, auth } = ctl();
    await c.me({ headers: {}, user: { userId: '7', roles: ['user'] } });
    expect(auth.me).toHaveBeenCalledWith(7);
    expect(typeof (auth.me.mock.calls[0][0] as unknown)).toBe('number');
  });

  it('logout-all truyền number, không phải chuỗi', async () => {
    const { c, auth } = ctl();
    await c.logoutAll({ headers: {}, user: { userId: '7', roles: ['user'] } });
    expect(auth.logoutAll).toHaveBeenCalledWith(7);
    expect(typeof (auth.logoutAll.mock.calls[0][0] as unknown)).toBe('number');
  });

  it('me trả user kèm expiresIn để FE refresh chủ động', async () => {
    const { c } = ctl();
    const r = await c.me({ headers: {}, user: { userId: '7', roles: ['user'] } });
    expect(r).toEqual({ user: USER, expiresIn: ACCESS_TTL_SECONDS });
  });

  it('logout-all trả ok', async () => {
    const { c } = ctl();
    const r = await c.logoutAll({ headers: {}, user: { userId: '7', roles: ['user'] } });
    expect(r).toEqual({ ok: true });
  });
});

describe('đăng ký', () => {
  it('truyền email, mật khẩu và user-agent xuống service', async () => {
    const { c, auth } = ctl();
    const r = await c.register(
      { headers: { 'user-agent': 'UA/1.0' } },
      { email: 'a@b.co', password: 'matkhau123' },
    );
    expect(auth.register).toHaveBeenCalledWith('a@b.co', 'matkhau123', 'UA/1.0');
    expect(r).toEqual({ message: 'ok' });
  });

  it('body rỗng hoặc thiếu body thì truyền chuỗi rỗng chứ không ném 500', async () => {
    const { c, auth } = ctl();
    await c.register({ headers: {} }, {});
    expect(auth.register).toHaveBeenLastCalledWith('', '', undefined);
    await c.register({ headers: {} }, undefined as never);
    expect(auth.register).toHaveBeenLastCalledWith('', '', undefined);
  });

  it('đăng nhập cũng vậy: body rỗng thì chuỗi rỗng, không phải chuỗi "undefined"', async () => {
    const { c, auth, res } = ctl();
    await c.login({ headers: {} }, {}, res);
    expect(auth.login).toHaveBeenLastCalledWith('', '', undefined);
  });

  it('user-agent sai kiểu thì bỏ trống chứ không truyền mảng xuống DB', async () => {
    const { c, auth } = ctl();
    await c.register(
      { headers: { 'user-agent': ['a', 'b'] as never } },
      { email: 'a@b.co', password: 'matkhau123' },
    );
    expect(auth.register).toHaveBeenCalledWith('a@b.co', 'matkhau123', undefined);
  });

  it('lỗi của service đi nguyên vẹn ra ngoài, không bị controller nuốt', async () => {
    const { c, auth, res } = ctl();
    auth.login.mockRejectedValue(
      Object.assign(new Error('Email hoặc mật khẩu không đúng'), { status: 401 }),
    );
    await expect(
      c.login({ headers: {} }, { email: 'a@b.co', password: 'sai' }, res),
    ).rejects.toMatchObject({ status: 401 });
    expect(res.cookie).not.toHaveBeenCalled();
  });
});

/**
 * Controller hai route mới **không** đụng cookie: sau khi đổi mật khẩu thì mọi
 * phiên cũ đã bị xoá ở tầng service, cookie cũ trên máy người dùng chỉ còn là
 * rác và sẽ bị server từ chối ở lần gọi kế tiếp.
 */
describe('quên và đặt lại mật khẩu', () => {
  it('forgot truyền email xuống service và trả nguyên câu của service', async () => {
    const { c, auth } = ctl();
    const r = await c.forgot({ email: 'a@b.co' });
    expect(auth.forgotPassword).toHaveBeenCalledWith('a@b.co');
    // Controller không được tự thêm hay bớt câu: đó là câu không lộ email nào tồn tại.
    expect(r).toEqual({ message: RESET_MSG });
  });

  it('forgot nhận body rỗng hoặc thiếu body thì truyền chuỗi rỗng, không ném 500', async () => {
    const { c, auth } = ctl();
    await c.forgot({});
    expect(auth.forgotPassword).toHaveBeenLastCalledWith('');
    await c.forgot(undefined as never);
    expect(auth.forgotPassword).toHaveBeenLastCalledWith('');
    await c.forgot({ email: ['a', 'b'] as never });
    expect(auth.forgotPassword).toHaveBeenLastCalledWith('a,b');
  });

  it('reset truyền token và mật khẩu xuống service, thành công thì báo tiếng Việt', async () => {
    const { c, auth } = ctl();
    const r = await c.reset({ token: 'ma', password: 'matkhaumoi123' });
    expect(auth.resetPassword).toHaveBeenCalledWith('ma', 'matkhaumoi123');
    expect(r).toEqual({ message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
  });

  it('mã sai hoặc hết hạn thì 400 kèm thông báo tiếng Việt, không rò mã ra ngoài', async () => {
    // 400 chứ không phải 200: giống `verify`, cùng một lý do — 200 khiến client tưởng
    // đã đổi mật khẩu xong rồi hỏi lại mãi với một mã đã chết.
    const { c, auth } = ctl();
    auth.resetPassword.mockResolvedValue(false);
    const e = await c.reset({ token: 'mat-khau-bi-lo', password: 'matkhaumoi123' }).catch((x) => x);
    expect(e.status).toBe(400);
    expect(e.message).toBe('Mã đặt lại không hợp lệ hoặc đã hết hạn');
    expect(String(e.message)).not.toContain('mat-khau-bi-lo');
  });

  it('lỗi của service đi nguyên vẹn ra ngoài, không bị controller nuốt', async () => {
    const { c, auth } = ctl();
    auth.resetPassword.mockRejectedValue(
      Object.assign(new Error('Mật khẩu phải có ít nhất 8 ký tự'), { status: 400 }),
    );
    await expect(
      c.reset({ token: 'ma', password: 'ngan' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('gửi lại link xác nhận', () => {
  it('truyền email và user-agent xuống service, trả nguyên câu của service', async () => {
    const { c, auth } = ctl();
    const r = await c.resend({ headers: { 'user-agent': 'UA' } }, { email: 'a@b.co' });
    expect(auth.resendVerification).toHaveBeenCalledWith('a@b.co', 'UA');
    expect(r).toEqual({ message: RESEND_MSG });
  });

  it('nhận body rỗng hoặc thiếu body thì truyền chuỗi rỗng, không ném 500', async () => {
    const { c, auth } = ctl();
    await c.resend({ headers: {} }, {});
    expect(auth.resendVerification).toHaveBeenLastCalledWith('', undefined);
    await c.resend({ headers: {} }, undefined as never);
    expect(auth.resendVerification).toHaveBeenLastCalledWith('', undefined);
    await c.resend({ headers: {} }, { email: ['a', 'b'] as never });
    expect(auth.resendVerification).toHaveBeenLastCalledWith('a,b', undefined);
  });

  it('không đụng cookie: người gửi lại link chưa có phiên nào để set', () => {
    const { c, res } = ctl();
    c.resend({ headers: {} }, { email: 'a@b.co' });
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

/**
 * Hai route OAuth là **public**: người bấm "Đăng nhập bằng Google" thường chưa có
 * phiên nào, nên `@UseGuards(AuthGuard)` ở đây là khoá cửa trước mặt nút bấm và
 * khiến tính năng chết đúng lúc cần nhất. Chứng minh bằng cả hai chiều: metadata
 * không có `AuthGuard`, và test HTTP bên dưới gọi không cookie vẫn 302.
 */
describe('đăng nhập bằng Google — start', () => {
  /** Cấu hình tối thiểu để `start` chịu phát redirect; không có thì nó báo lỗi. */
  function cauHinhGoogle() {
    setEnv('GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
    // Secret phải có: `start` kiểm cả ba biến, nên thiếu nó thì mọi test trong
    // describe này xanh vì lý do "chưa cấu hình" chứ không phải lý do nó viết ra.
    setEnv('GOOGLE_CLIENT_SECRET', 'csec');
    setEnv('GOOGLE_REDIRECT_URI', 'https://api.go-code.vercel.app/api/auth/oauth/google/callback');
    setEnv('FRONTEND_URL', FE);
  }

  it('302 tới accounts.google.com kèm state, PKCE S256 và scope', async () => {
    cauHinhGoogle();
    const { c, auth, res } = ctl();
    await c.googleStart('/problem/two-sum', res);
    const url = viDenFe(res);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.go-code.vercel.app/api/auth/oauth/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('online');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe(STATE);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // Bỏ `code_challenge` là test này đỏ. Không có nó thì Google chỉ trả 400
    // lúc đổi code, tức mọi assert khác vẫn xanh vì lý do khác.
    expect(url.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(auth.beginGoogleOAuth).toHaveBeenCalledWith('/problem/two-sum');
  });

  it('không dùng prompt=select_account', async () => {
    // Nó ép hiện danh sách tài khoản mỗi lần bấm — đúng thứ không cần ở nút
    // "Đăng nhập bằng Google", và người dùng đã chọn tài khoản một lần rồi.
    cauHinhGoogle();
    const { c, res } = ctl();
    await c.googleStart('/', res);
    expect(viDenFe(res).searchParams.get('prompt')).toBeNull();
  });

  it('redirect_to ngoài nội bộ thì xuống "/" — lần đầu trong hai lần kiểm', async () => {
    cauHinhGoogle();
    for (const raw of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)']) {
      const { c, auth, res } = ctl();
      await c.googleStart(raw, res);
      expect(auth.beginGoogleOAuth).toHaveBeenCalledWith('/');
    }
  });

  it('redirect_to thiếu hoặc sai kiểu (mảng) thì xuống "/", không ném 500', async () => {
    cauHinhGoogle();
    const { c, auth, res } = ctl();
    await c.googleStart(undefined, res);
    expect(auth.beginGoogleOAuth).toHaveBeenLastCalledWith('/');
    await c.googleStart(['/a', '/b'], res);
    expect(auth.beginGoogleOAuth).toHaveBeenLastCalledWith('/');
  });

  it('chưa cấu hình GOOGLE_CLIENT_ID thì báo lỗi, không đẩy sang trang lỗi của Google', async () => {
    cauHinhGoogle();
    setEnv('GOOGLE_CLIENT_ID', undefined);
    const { c, auth, res } = ctl();
    await c.googleStart('/', res);
    const url = viDenFe(res);
    expect(url.origin + url.pathname).toBe(FE + '/sign-in');
    expect(url.searchParams.get('oauth')).toBe('failed');
    // Không sinh state: sinh ra cũng chẳng ai dùng, và mỗi lần bấm nút lại để lại
    // một dòng rác trong bảng state.
    expect(auth.beginGoogleOAuth).not.toHaveBeenCalled();
  });

  it('thiếu GOOGLE_REDIRECT_URI thì cũng báo lỗi, không đẩy sang Google', async () => {
    cauHinhGoogle();
    setEnv('GOOGLE_REDIRECT_URI', undefined);
    const { c, auth, res } = ctl();
    await c.googleStart('/', res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
    expect(auth.beginGoogleOAuth).not.toHaveBeenCalled();
  });

  it('thiếu GOOGLE_CLIENT_SECRET thì báo lỗi ngay, không đẩy sang Google', async () => {
    // Secret chỉ dùng ở `callback`. Thiếu nó thì `start` vẫn chạy trơn, người dùng
    // đi trọn màn hình đồng ý của Google rồi mới nhận `failed` — lỗi cấu hình của
    // ta biến thành "sản phẩm hỏng" đúng lúc người dùng tin ta nhất.
    cauHinhGoogle();
    setEnv('GOOGLE_CLIENT_SECRET', undefined);
    const { c, auth, res } = ctl();
    await c.googleStart('/', res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
    expect(auth.beginGoogleOAuth).not.toHaveBeenCalled();
  });
});

describe('đăng nhập bằng Google — callback', () => {
  beforeEach(() => setEnv('FRONTEND_URL', FE));

  it('không có code thì về cancelled', async () => {
    const { c, auth, res } = ctl();
    await c.googleCallback(req(), undefined, 's', undefined, res);
    const url = viDenFe(res);
    expect(url.origin + url.pathname).toBe(FE + '/sign-in');
    expect(url.searchParams.get('oauth')).toBe('cancelled');
    // Không ăn `state`: state mà không có code thì vô dụng, và ăn nó ở đây làm
    // một state **còn hạn** bị chết oan.
    expect(auth.takeGoogleState).not.toHaveBeenCalled();
  });

  it('người bấm Hủy ở Google (error=access_denied) thì về cancelled', async () => {
    const { c, auth, res } = ctl();
    await c.googleCallback(req(), 'code', 'state', 'access_denied', res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('cancelled');
    expect(auth.takeGoogleState).not.toHaveBeenCalled();
    expect(auth.googleProfile).not.toHaveBeenCalled();
  });

  it('state sai, hết hạn hoặc đã dùng thì về expired, không đổi code', async () => {
    const { c, auth, res } = ctl();
    auth.takeGoogleState.mockResolvedValue(null);
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('expired');
    expect(auth.googleProfile).not.toHaveBeenCalled();
    expect(auth.linkOrCreateFromGoogle).not.toHaveBeenCalled();
  });

  it('state thiếu thì vẫn gọi takeGoogleState với chuỗi rỗng, không ném 500', async () => {
    // Cookie rỗng để đi qua bước so khớp: mục tiêu test này là chuỗi rỗng ở
    // `?state=` không làm hỏng request, còn việc chặn cookie lệch có test riêng.
    const { c, auth, res } = ctl();
    auth.takeGoogleState.mockResolvedValue(null);
    await c.googleCallback(
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=` } }, 'code', undefined, undefined, res,
    );
    expect(auth.takeGoogleState).toHaveBeenCalledWith('');
    expect(viDenFe(res).searchParams.get('oauth')).toBe('expired');
  });

  it('lấy không được profile thì về failed', async () => {
    const { c, auth, res } = ctl();
    auth.googleProfile.mockResolvedValue(null);
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
    expect(auth.linkOrCreateFromGoogle).not.toHaveBeenCalled();
  });

  it('fetch tới Google ném lỗi mạng thì về failed chứ không 500', async () => {
    // `googleProfile` trả `null` cho lỗi phía Google nhưng `fetch` có thể ném
    // (mạng, DNS). Không bắt thì callback trả 500 và người dùng thấy lỗi server
    // thay vì câu "thử lại sau một lát".
    const { c, auth, res } = ctl();
    auth.googleProfile.mockRejectedValue(new Error('fetch failed'));
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
  });

  it('thành công thì đặt cả hai cookie rồi 302 về redirectTo', async () => {
    const { c, auth, res } = ctl();
    auth.takeGoogleState.mockResolvedValue({ codeVerifier: VERIFIER, redirectTo: '/premium' });
    await c.googleCallback(req({ 'user-agent': 'UA/1.0' }), 'code', 'state', undefined, res,
    );
    expect(auth.googleProfile).toHaveBeenCalledWith('code', VERIFIER);
    expect(auth.linkOrCreateFromGoogle).toHaveBeenCalledWith(PROFILE, null);
    expect(auth.issueSessionForUserId).toHaveBeenCalledWith(7, 'UA/1.0');
    expect(res.cookie.mock.calls.map((x) => x[0])).toEqual([SESSION_COOKIE, REFRESH_COOKIE]);
    expect(viDenFe(res).origin + viDenFe(res).pathname).toBe(FE + '/premium');
  });

  it('redirectTo lưu trong DB mà ra ngoài nội bộ thì về "/"', async () => {
    for (const raw of ['https://evil.com', '//evil.com']) {
      const { c, auth, res } = ctl();
      auth.takeGoogleState.mockResolvedValue({ codeVerifier: VERIFIER, redirectTo: raw });
      await c.googleCallback(req(), 'code', 'state', undefined, res);
      expect(viDenFe(res).origin + viDenFe(res).pathname).toBe(FE + '/');
    }
  });

  it('email đã có tài khoản thì về exists kèm email đã mã hoá, tuyệt đối không cấp phiên', async () => {
    const { c, auth, res } = ctl();
    auth.linkOrCreateFromGoogle.mockResolvedValue({
      kind: 'needs-password', email: 'a+b@b.co',
    });
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    const url = viDenFe(res);
    expect(url.searchParams.get('oauth')).toBe('exists');
    expect(url.searchParams.get('email')).toBe('a+b@b.co');
    // Đây là ranh giới bảo mật: nhánh này không được cấp bất kỳ token nào.
    expect(auth.issueSessionForUserId).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('email chưa xác minh thì về unverified, không cấp phiên', async () => {
    const { c, auth, res } = ctl();
    auth.linkOrCreateFromGoogle.mockResolvedValue({ kind: 'unverified' });
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('unverified');
    expect(auth.issueSessionForUserId).not.toHaveBeenCalled();
  });

  it('sub đã gắn với user khác thì về conflict — không gộp vào unverified', async () => {
    // Câu của `unverified` là "Google chưa xác minh email" — với `conflict` thì
    // câu đó sai hoàn toàn và dắt người dùng vào ngõ cụt.
    const { c, auth, res } = ctl();
    auth.linkOrCreateFromGoogle.mockResolvedValue({ kind: 'conflict' });
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('conflict');
    expect(auth.issueSessionForUserId).not.toHaveBeenCalled();
  });

  it('user bị xoá giữa chừng thì về failed chứ không 500', async () => {
    const { c, auth, res } = ctl();
    auth.issueSessionForUserId.mockResolvedValue(null);
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('DB chết ở takeGoogleState thì về failed chứ không 500', async () => {
    // Ba lời gọi dưới `takeGoogleState` đều đi tới DB nên đều có thể ném, và
    // callback là trang người dùng nhìn thấy trực tiếp — ném ra ngoài là màn
    // trắng. Chỉ `googleProfile` được bọc `.catch()`, nên thiếu `try` ở đây là
    // `500` thật chứ không phải giả định.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { c, auth, res } = ctl();
    auth.takeGoogleState.mockRejectedValue(new Error('connection terminated'));
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
    expect(auth.linkOrCreateFromGoogle).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('linkOrCreateFromGoogle ném lỗi DB thì về failed, tuyệt đối không cấp phiên', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { c, auth, res } = ctl();
    auth.linkOrCreateFromGoogle.mockRejectedValue(new Error('hết thời gian chờ'));
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
    expect(auth.issueSessionForUserId).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    // Một lần redirect duy nhất: `catch` không được phát ra `Location` lần nữa
    // sau khi nhánh trong `try` đã phát rồi mới ném.
    expect(res.redirect).toHaveBeenCalledTimes(1);
  });

  it('issueSessionForUserId ném lỗi thì về failed và không đặt cookie nào', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { c, auth, res } = ctl();
    auth.issueSessionForUserId.mockRejectedValue(new Error('db down'));
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('failed');
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledTimes(1);
  });

  it('cookie session hợp lệ thì ghép vào đúng user đang đăng nhập', async () => {
    const { c, auth, res } = ctl();
    const jwt = await signAccessToken(42, 'user');
    await c.googleCallback(
      req({ cookie: 'session=' + jwt }), 'code', 'state', undefined, res,
    );
    expect(auth.linkOrCreateFromGoogle).toHaveBeenCalledWith(PROFILE, 42);
    expect(auth.issueSessionForUserId).toHaveBeenCalledWith(7, undefined);
  });

  it('cookie session rác thì coi như khách, không 500', async () => {
    const { c, auth, res } = ctl();
    await c.googleCallback(
      req({ cookie: 'session=khong-phai-jwt' }), 'code', 'state', undefined, res,
    );
    expect(auth.linkOrCreateFromGoogle).toHaveBeenCalledWith(PROFILE, null);
  });

  it('chỉ có cookie refresh (session hết hạn từ lâu) thì vẫn ghép đúng tài khoản', async () => {
    // Ngõ cụt M4: cookie `session` sống 15 phút còn phiên thật sống 30 ngày.
    // Người chỉ dùng Google mở trang, để quá 15 phút rồi bấm nút ⇒ nếu chỉ đọc
    // `session` thì `linkOrCreateFromGoogle` nhận `null` và trả `needs-password`
    // **cho một tài khoản không có mật khẩu**: không có màn hình nào để thoát.
    const { c, auth, res } = ctl();
    auth.userIdForRefresh.mockResolvedValue(42);
    await c.googleCallback(
      req({ cookie: 'refresh=' + REFRESH }), 'code', 'state', undefined, res,
    );
    expect(auth.linkOrCreateFromGoogle).toHaveBeenCalledWith(PROFILE, 42);
    // Cố ý **không** gọi `refresh()`: hàm đó xoá dòng phiên sau khi cấp token mới,
    // tức hỏi "ai đang bấm" mà xoá phiên người dùng.
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('cookie refresh không dùng được thì vẫn coi là khách, không ném', async () => {
    const { c, auth, res } = ctl();
    auth.userIdForRefresh.mockResolvedValue(null);
    await c.googleCallback(
      req({ cookie: 'refresh=het-han-hoac-thu-hoi' }), 'code', 'state', undefined, res,
    );
    expect(auth.linkOrCreateFromGoogle).toHaveBeenCalledWith(PROFILE, null);
  });

  it('cookie session hợp lệ thì không cần hỏi cookie refresh', async () => {
    // Ưu tiên `session`: nó không tốn lượt đọc DB nào. Hỏi `refresh` khi đã có
    // `session` là một vòng DB thừa trên mọi lần ghép tài khoản.
    const { c, auth, res } = ctl();
    const jwt = await signAccessToken(42, 'user');
    await c.googleCallback(
      req({ cookie: `session=${jwt}; refresh=${REFRESH}` }), 'code', 'state', undefined, res,
    );
    expect(auth.userIdForRefresh).not.toHaveBeenCalled();
    expect(auth.linkOrCreateFromGoogle).toHaveBeenCalledWith(PROFILE, 42);
  });

  it('cookie session hỏng thì mới hỏi tới cookie refresh', async () => {
    const { c, auth, res } = ctl();
    auth.userIdForRefresh.mockResolvedValue(42);
    await c.googleCallback(
      req({ cookie: 'session=rac; refresh=' + REFRESH }), 'code', 'state', undefined, res,
    );
    expect(auth.userIdForRefresh).toHaveBeenCalledWith(REFRESH);
    expect(auth.linkOrCreateFromGoogle).toHaveBeenCalledWith(PROFILE, 42);
  });

  it('mọi nhánh trả về đều là URL tuyệt đối trỏ về FE', async () => {
    for (const kind of ['ok', 'needs-password', 'unverified', 'conflict'] as const) {
      const { c, auth, res } = ctl();
      auth.linkOrCreateFromGoogle.mockResolvedValue(
        kind === 'ok' ? { kind: 'ok', userId: 7 } : { kind, email: 'a@b.co' },
      );
      await c.googleCallback(req(), 'code', 'state', undefined, res);
      expect(viDenFe(res).origin).toBe(FE);
    }
  });

  it('thiếu FRONTEND_URL thì về localhost:3000, không phải chuỗi "undefined"', async () => {
    setEnv('FRONTEND_URL', undefined);
    const { c, res } = ctl();
    await c.googleCallback(req(), undefined, 'state', undefined, res);
    expect(res.redirect.mock.calls[0][1]).toBe('http://localhost:3000/sign-in?oauth=cancelled');
  });
});

/**
 * Login CSRF: `state` chỉ chứng minh "một ai đó từng bấm nút", không chứng minh
 * "trình duyệt này đã bấm nút". Không có cookie ràng buộc thì kẻ tấn công làm
 * trọn luồng của mình, chụp `callback?code=C&state=S` **trước khi** dùng, rồi gửi
 * link đó cho nạn nhân — nạn nhân bị đăng nhập vào tài khoản của hắn.
 */
describe('đăng nhập bằng Google — chống login CSRF', () => {
  // `start` kiểm **cả ba** biến Google rồi mới set cookie, nên thiếu bất kỳ biến
  // nào thì `res.cookie` không bao giờ chạy và các test dưới đây kiểm cookie sẽ
  // đỏ sai lý do. Đặt ở `beforeEach` để không test nào trong nhóm này phụ thuộc
  // `.env` của máy đang chạy — `afterEach` khôi phục về `OLD_ENV`, mà ở CI
  // `OLD_ENV` không có các biến này nên trước đây nhóm này chỉ xanh ở máy có
  // `.env` thật.
  beforeEach(() => {
    setEnv('FRONTEND_URL', FE);
    setEnv('GOOGLE_CLIENT_ID', 'cid');
    setEnv('GOOGLE_CLIENT_SECRET', 'csec');
    setEnv('GOOGLE_REDIRECT_URI', 'https://api/cb');
  });

  it('start đặt cookie httpOnly chứa state, cùng khuôn với cookie phiên', async () => {
    // Cookie này là thứ kẻ tấn công không dựng lại được. Bỏ lời gọi `res.cookie`
    // ở `start` là toàn bộ describe này mất tác dụng.
    const { c, auth, res } = ctl();
    setEnv('GOOGLE_CLIENT_ID', 'cid');
    setEnv('GOOGLE_REDIRECT_URI', 'https://api/cb');
    await c.googleStart('/', res);
    const call = res.cookie.mock.calls.find((x) => x[0] === OAUTH_STATE_COOKIE);
    expect(call).toBeDefined();
    // Giá trị phải **bằng** `state` mà `start` vừa sinh, không phải bản hash: hai
    // bên so khớp thì cookie phải mang đúng thứ callback nhận.
    const state = new URL(viDenFe(res).toString()).searchParams.get('state')!;
    expect(call![1]).toBe(state);
    expect(auth.beginGoogleOAuth).toHaveBeenCalledWith('/');
  });

  it('cookie state httpOnly và sống cùng hạn với state', async () => {
    const { c, res } = ctl();
    setEnv('GOOGLE_CLIENT_ID', 'cid');
    setEnv('GOOGLE_REDIRECT_URI', 'https://api/cb');
    await c.googleStart('/', res);
    const idx = res.cookie.mock.calls.findIndex((x) => x[0] === OAUTH_STATE_COOKIE);
    const o = opts(res, idx);
    // Không `httpOnly` thì XSS đọc được `state` và tự dựng lại request callback.
    expect(o.httpOnly).toBe(true);
    expect(o.path).toBe('/');
    // Hết hạn cùng `STATE_TTL_MS` (10 phút): sống lâu hơn state thì cookie trở
    // thành nonce thứ hai không ai quản lý.
    expect(o.maxAge).toBe(STATE_TTL_MS);
  });

  it('cookie state ở production là SameSite=None; Secure', async () => {
    // Cùng lý do và cùng khuôn với `session`/`refresh`: production đặt BE và FE ở
    // hai domain khác nhau, nên cookie phải qua được bước điều hướng từ
    // `accounts.google.com`. Ở local thì `lax` là đủ.
    const { c, res } = ctl();
    setEnv('VERCEL', '1');
    setEnv('GOOGLE_CLIENT_ID', 'cid');
    setEnv('GOOGLE_REDIRECT_URI', 'https://api/cb');
    await c.googleStart('/', res);
    const idx = res.cookie.mock.calls.findIndex((x) => x[0] === OAUTH_STATE_COOKIE);
    expect(opts(res, idx)).toMatchObject({ sameSite: 'none', secure: true });
  });

  it('cookie lệch với ?state= thì chặn, không ăn state và không đổi code', async () => {
    // Đây chính là link độc hại: `state` của kẻ tấn công, cookie của nạn nhân.
    // Bỏ khối so khớp là test này đỏ và lỗ hổng quay lại.
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { c, auth, res } = ctl();
    await c.googleCallback(
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=state-cua-nan-nhan` } },
      'code', 'state', undefined, res,
    );
    expect(viDenFe(res).searchParams.get('oauth')).toBe('expired');
    expect(auth.takeGoogleState).not.toHaveBeenCalled();
    expect(auth.googleProfile).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('không có cookie state thì chặn — kể cả khi state trong DB còn hạn', async () => {
    // Nhánh nguy hiểm nhất: không có cookie nghĩa là trình duyệt chưa từng bấm nút
    // ở đâu cả, đúng hình dạng của request do kẻ khác dựng ra.
    const { c, auth, res } = ctl();
    await c.googleCallback({ headers: {} }, 'code', 'state', undefined, res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('expired');
    expect(auth.takeGoogleState).not.toHaveBeenCalled();
  });

  it('cookie thiếu `state` trong query thì chặn, không so sánh với chuỗi rỗng', async () => {
    // `timingSafeEqual` **ném** khi hai buffer khác độ dài. Không có kiểm độ dài ở
    // trước thì `?state=` thiếu biến làm callback thành 500.
    const { c, auth, res } = ctl();
    await c.googleCallback(
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=state` } }, 'code', undefined, undefined, res,
    );
    expect(viDenFe(res).searchParams.get('oauth')).toBe('expired');
    expect(auth.takeGoogleState).not.toHaveBeenCalled();
  });

  it('cookie khớp thì xoá cookie ngay, kể cả khi luồng sau đó thất bại', async () => {
    // Giữ lại cookie sau lần dùng là mở lại đúng lỗ hổng: link đã dùng vẫn dùng
    // lại được. Bỏ `clearCookie` là test này đỏ.
    const { c, auth, res } = ctl();
    auth.googleProfile.mockResolvedValue(null);
    await c.googleCallback(req(), 'code', 'state', undefined, res);
    expect(names(res)).toContain(OAUTH_STATE_COOKIE);
    // Xoá cookie cần `path: '/'`: browser khớp cookie để xoá theo name+domain+path
    // (RFC 6265 §5.3), thiếu `path` thì cookie cũ vẫn còn.
    const call = res.clearCookie.mock.calls.find((c2) => c2[0] === OAUTH_STATE_COOKIE)!;
    expect(call[1]).toMatchObject({ path: '/' });
  });

  it('cookie lệch thì KHÔNG xoá cookie — không được biến thành công cụ phá phiên', async () => {
    // Người dùng thật có thể đang mở hai luồng song song. Xoá cookie ở nhánh lệch
    // nghĩa là một request rác từ kẻ khác xoá sạch cookie của người dùng.
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { c, res } = ctl();
    await c.googleCallback(
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=khac` } }, 'code', 'state', undefined, res,
    );
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('người bấm Hủy ở Google thì KHÔNG xoá cookie state', async () => {
    // Nhánh `cancelled` chạy trước khối so khớp, và mọi thứ trong request đó đều do
    // bên kia kiểm soát — kể cả `?error=access_denied`. Xoá cookie ở đây là trao
    // cho kẻ tấn công cách phá luồng OAuth đang dở của người dùng.
    const { c, res } = ctl();
    await c.googleCallback(req(), 'code', 'state', 'access_denied', res);
    expect(viDenFe(res).searchParams.get('oauth')).toBe('cancelled');
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

/**
 * Nest đọc guard của route từ metadata `__guards__` (hằng `GUARDS_METADATA` trong
 * `@nestjs/common/constants`), nên đây là chỗ duy nhất để chứng minh route nào thật
 * sự được bảo vệ. Phần "có thật sự chạy không" thì test bên dưới dùng `ThrottleGuard`
 * thật với chính method của controller.
 */
function guardsOf(handler: (...args: never[]) => unknown): unknown[] {
  return (Reflect.getMetadata('__guards__', handler) as unknown[] | undefined) ?? [];
}

/** Cùng logic với `guardsOf`, nhưng đọc metadata của `ThrottleGuard`. */
function throttleOf(
  name:
    | 'register'
    | 'verify'
    | 'login'
    | 'refresh'
    | 'forgot'
    | 'reset'
    | 'resend'
    | 'googleStart'
    | 'googleCallback',
) {
  const found = Reflect.getMetadata(THROTTLE_KEY, AuthController.prototype[name]) as
    | { limit: number; ttl: number }
    | undefined;
  if (!found) throw new Error(`${name} không có @Throttle`);
  return found;
}

function ctxFor(handler: (...args: never[]) => unknown, ip: string): ExecutionContext {
  const req = { ip, headers: {} as Record<string, string> };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => AuthController,
  } as unknown as ExecutionContext;
}

function statusOf(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : null;
  }
}

describe('guard và giới hạn tần suất', () => {
  it('me và logout-all dùng AuthGuard', () => {
    expect(guardsOf(AuthController.prototype.me)).toContain(AuthGuard);
    expect(guardsOf(AuthController.prototype.logoutAll)).toContain(AuthGuard);
  });

  it('register, verify, login, refresh mang @Throttle và không còn decorator ThrottleGuard', () => {
    // `ThrottleGuard` đã chuyển từ `@UseGuards` rải rác sang đăng ký **một lần**
    // ở tầng `APP_GUARD` (`app.module.ts`), để ngưỡng mặc định 100/phút phủ được
    // cả những route không gắn `@Throttle` sau khi gỡ `express-rate-limit`.
    // Nếu vừa đăng ký ở tầng đó vừa giữ `@UseGuards(ThrottleGuard)` thì Nest
    // chạy guard **hai lần mỗi request** và ngưỡng bị chia đôi (20/giờ -> 10).
    //
    // Vì vậy ở đây kiểm tra **metadata `@Throttle`** (ngưỡng riêng của route) và
    // kiểm tra decorator đã được gỡ. Việc guard có thật sự chạy và chạy đúng một
    // lần thì các test hành vi ngay dưới đây và `throttle.default.spec.ts` lo.
    for (const h of ['register', 'verify', 'login', 'refresh'] as const) {
      expect(throttleOf(h)).toBeDefined();
      expect(guardsOf(AuthController.prototype[h])).not.toContain(ThrottleGuard);
    }
  });

  it('forgot-password và reset-password mang @Throttle, không còn decorator ThrottleGuard', () => {
    // Hai route này là đầu vào để bơm mail và dò mã, không thể thiếu chặn tần suất.
    for (const h of ['forgot', 'reset'] as const) {
      expect(throttleOf(h)).toBeDefined();
      expect(guardsOf(AuthController.prototype[h])).not.toContain(ThrottleGuard);
    }
  });

  it('resend-verification mang @Throttle, không dùng AuthGuard', () => {
    // Đầu vào để bơm mail xác nhận y hệt `register`, nên chặn tần suất là bắt buộc.
    // Không `AuthGuard`: người bấm nút này đang ở giữa lúc đăng ký, chưa có phiên.
    expect(throttleOf('resend')).toBeDefined();
    expect(guardsOf(AuthController.prototype.resend)).not.toContain(ThrottleGuard);
    expect(guardsOf(AuthController.prototype.resend)).not.toContain(AuthGuard);
  });

  it('hai route OAuth không dùng AuthGuard — nút Google phải bấm được khi chưa đăng nhập', () => {
    for (const h of ['googleStart', 'googleCallback'] as const) {
      expect(guardsOf(AuthController.prototype[h])).not.toContain(AuthGuard);
    }
  });

  it('hai route OAuth mang @Throttle — không để bị dùng để spam Google', () => {
    for (const h of ['googleStart', 'googleCallback'] as const) {
      expect(throttleOf(h)).toBeDefined();
      expect(guardsOf(AuthController.prototype[h])).not.toContain(ThrottleGuard);
    }
  });

  it('số giới hạn tần suất của hai route OAuth đúng như đã chốt', () => {
    expect(throttleOf('googleStart')).toEqual({ limit: 20, ttl: 60 * 60 * 1000 });
    expect(throttleOf('googleCallback')).toEqual({ limit: 20, ttl: 60 * 60 * 1000 });
  });

  it('start bị chặn sau 20 lần trong 1 giờ', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.googleStart as never, '10.0.0.8');
    for (let i = 0; i < 20; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('callback bị chặn sau 20 lần trong 1 giờ', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.googleCallback as never, '10.0.0.9');
    for (let i = 0; i < 20; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('logout không dùng AuthGuard — access token hết hạn vẫn phải đăng xuất được', () => {
    expect(guardsOf(AuthController.prototype.logout)).not.toContain(AuthGuard);
  });

  /**
   * Ghim **từng con số** của giới hạn tần suất. Số này là quyết định sản phẩm (xem
   * docblock trên `AuthController`), không phải chi tiết cài đặt: nền tảng có IP
   * dùng chung nên số phải rộng, nhưng hở thì mất tác dụng.
   */
  it('số giới hạn tần suất đúng như đã chốt', () => {
    expect(throttleOf('register')).toEqual({ limit: 20, ttl: 60 * 60 * 1000 });
    expect(throttleOf('login')).toEqual({ limit: 30, ttl: 15 * 60 * 1000 });
    expect(throttleOf('verify')).toEqual({ limit: 20, ttl: 60 * 1000 });
    // `refresh` trước đây khai 120/phút, nhưng đó là **code chết**:
    // `express-rate-limit` chặn ở 100/phút cho *mọi* route nên 120 không bao giờ
    // có tác dụng. Gỡ tầng đó thì 120 sẽ thành số thật và **nới** ngưỡng so với
    // hành vi đang chạy, nên đã hạ về 100 cho khớp đúng mức thực tế cũ.
    expect(throttleOf('refresh')).toEqual({ limit: 100, ttl: 60 * 1000 });
    // Hai route mới ở đúng mức `register`: 20 lần/giờ. IP dùng chung ở Việt Nam
    // rất phổ biến nên không thể siết thêm mà không chặn nhầm người thật.
    expect(throttleOf('forgot')).toEqual({ limit: 20, ttl: 60 * 60 * 1000 });
    expect(throttleOf('reset')).toEqual({ limit: 20, ttl: 60 * 60 * 1000 });
    // Gửi lại link xác nhận là đầu vào bơm mail **cùng hình dạng** với `register`
    // (cùng một loại mail, cùng một tài khoản có thể bị bơm), nên đúng mức đó.
    expect(throttleOf('resend')).toEqual({ limit: 20, ttl: 60 * 60 * 1000 });
  });

  it('quên mật khẩu bị chặn sau 20 lần trong 1 giờ', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.forgot as never, '10.0.0.5');
    for (let i = 0; i < 20; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('đặt lại mật khẩu bị chặn sau 20 lần trong 1 giờ, không dò được mã', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.reset as never, '10.0.0.6');
    for (let i = 0; i < 20; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('đăng ký bị chặn sau 20 lần trong 1 giờ', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.register as never, '10.0.0.1');
    for (let i = 0; i < 20; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('gửi lại link xác nhận bị chặn sau 20 lần trong 1 giờ, không bơm được mail', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.resend as never, '10.0.0.7');
    for (let i = 0; i < 20; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('đăng nhập bị chặn sau 30 lần trong 15 phút', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.login as never, '10.0.0.2');
    for (let i = 0; i < 30; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('verify bị chặn theo IP, không dò được mã xác nhận', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.verify as never, '10.0.0.3');
    for (let i = 0; i < 20; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('refresh bị chặn sau 100 lần trong 1 phút', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.refresh as never, '10.0.0.4');
    for (let i = 0; i < 100; i += 1) expect(g.canActivate(ctx)).toBe(true);
    expect(statusOf(() => g.canActivate(ctx))).toBe(429);
  });

  it('giới hạn tính theo IP: IP khác thì không dùng chung bộ đếm', () => {
    const g = new ThrottleGuard(new Reflector());
    const a = ctxFor(AuthController.prototype.register as never, '10.0.1.1');
    for (let i = 0; i < 20; i += 1) g.canActivate(a);
    expect(statusOf(() => g.canActivate(a))).toBe(429);
    const b = ctxFor(AuthController.prototype.register as never, '10.0.1.2');
    expect(g.canActivate(b)).toBe(true);
  });
});

/**
 * Phần này bọc controller vào một Nest app thật và gọi bằng HTTP thật, vì có những
 * lỗi mà gọi method trực tiếp không bao giờ thấy: `@Query` nhầm thành `@Param`
 * (mã xác nhận luôn `undefined`), thiếu `@HttpCode` (POST trả 201 thay vì 200), và
 * cookie không thật sự được serialize với `HttpOnly`.
 *
 * `AuthService` ở đây là fake — thứ cần chứng minh là route + guard + cookie, không
 * phải service (service có 51 test riêng trong `auth.service.spec.ts`).
 */
describe('route thật qua Nest', () => {
  let app: INestApplication;
  let auth: ReturnType<typeof ctl>['auth'];

  beforeAll(async () => {
    auth = ctl().auth;
    const m = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
    app = m.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/auth/verify?token= đọc token từ query string', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/verify?token=ma-xac-nhan')
      .set('User-Agent', 'UA/1.0');
    expect(res.status).toBe(200);
    expect(auth.verifyEmail).toHaveBeenCalledWith('ma-xac-nhan', 'UA/1.0');
  });

  it('thiếu token trong query thì 400, không đoán mò token rỗng', async () => {
    auth.verifyEmail.mockResolvedValue(null);
    const res = await request(app.getHttpServer()).get('/api/auth/verify').set('User-Agent', 'UA/1.0');
    expect(res.status).toBe(400);
    expect(auth.verifyEmail).toHaveBeenLastCalledWith('', 'UA/1.0');
  });

  it('POST đăng nhập trả 200 chứ không 201 mặc định của Nest', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'matkhau123' });
    expect(res.status).toBe(200);
  });

  it('POST đăng ký trả 200 và không set cookie nào — chưa xác minh thì chưa có phiên', async () => {
    // Bản trước của test này assert `AuthController.prototype.register.length === 2`
    // — đếm số tham số, không đỏ vì bất kỳ lý do hành vi nào, nên không canh được gì.
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'a@b.co', password: 'matkhau123' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /api/auth/refresh không có cookie thì 401 kèm Clear-Cookie cả hai', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Không có phiên để làm mới');
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(' | ');
    expect(cookies).toContain('session=;');
    expect(cookies).toContain('refresh=;');
    expect(cookies).toContain('Path=/');
  });

  it('Set-Cookie thật có HttpOnly, Path=/ và Max-Age đúng hạn', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'matkhau123' });
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(' | ');
    expect(cookies).toContain('session=a');
    expect(cookies).toContain('refresh=');
    expect(cookies.match(/HttpOnly/g) ?? []).toHaveLength(2);
    expect(cookies.match(/Path=\//g) ?? []).toHaveLength(2);
    // `Max-Age` tính bằng giây, `maxAge` của cookie tính bằng mili giây.
    expect(cookies).toContain(`Max-Age=${ACCESS_TTL_SECONDS}`);
    expect(cookies).toContain(`Max-Age=${REFRESH_TTL_MS / 1000}`);
  });

  it('GET /api/auth/me không có cookie thì 401 do AuthGuard thật', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Thiếu phiên đăng nhập');
  });

  it('POST /api/auth/refresh đọc được cookie thô khi không có cookie-parser', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `session=jwt; refresh=${REFRESH}`)
      .set('User-Agent', 'UA/1.0');
    expect(res.status).toBe(200);
    expect(auth.refresh).toHaveBeenCalledWith(REFRESH, 'UA/1.0');
  });

  it('POST /api/auth/logout xoá cả hai cookie bằng Set-Cookie hết hạn', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', `refresh=${REFRESH}`);
    expect(res.status).toBe(200);
    expect(auth.logout).toHaveBeenCalledWith(REFRESH);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(' | ');
    expect(cookies).toContain('session=;');
    expect(cookies).toContain('refresh=;');
    expect(cookies).toContain('Path=/');
  });

  it('POST /api/auth/forgot-password trả 200 chứ không 201, và không set cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'a@b.co' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: RESET_MSG });
    expect(auth.forgotPassword).toHaveBeenCalledWith('a@b.co');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /api/auth/forgot-password thiếu body vẫn 200, không phải 500', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/forgot-password');
    expect(res.status).toBe(200);
    expect(auth.forgotPassword).toHaveBeenLastCalledWith('');
  });

  it('POST /api/auth/reset-password với mã hợp lệ thì 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'ma-hop-le', password: 'matkhaumoi123' });
    expect(res.status).toBe(200);
    expect(auth.resetPassword).toHaveBeenCalledWith('ma-hop-le', 'matkhaumoi123');
  });

  it('POST /api/auth/reset-password với mã chết thì 400 kèm thông báo tiếng Việt', async () => {
    auth.resetPassword.mockResolvedValue(false);
    const res = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'ma-chet', password: 'matkhaumoi123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Mã đặt lại không hợp lệ hoặc đã hết hạn');
    auth.resetPassword.mockResolvedValue(true);
  });

  it('POST /api/auth/resend-verification trả 200 chứ không 201, và không set cookie', async () => {
    // 200 chứ không 409 như `register`: đây là hành động đăng ký lại, mà
    // `register` ném 409 vì email đã tồn tại — tức đúng nút bấm để thoát khỏi
    // trạng thái đó lại là nút chết.
    const res = await request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: 'a@b.co' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: RESEND_MSG });
    expect(auth.resendVerification).toHaveBeenCalledWith('a@b.co', undefined);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('GET /api/auth/oauth/google/start không cookie vẫn 302 tới Google, không phải 401', async () => {
    setEnv('FRONTEND_URL', FE);
    setEnv('GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
    setEnv('GOOGLE_CLIENT_SECRET', 'csec');
    setEnv('GOOGLE_REDIRECT_URI', 'https://api/cb');
    const res = await request(app.getHttpServer()).get('/api/auth/oauth/google/start');
    expect(res.status).toBe(302);
    const url = new URL(String(res.headers.location));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(auth.beginGoogleOAuth).toHaveBeenCalledWith('/');
    // `Set-Cookie` thật phải mang `HttpOnly` + `Path=/` — thiếu `HttpOnly` thì
    // XSS đọc được `state` và tự dựng lại request callback.
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(' | ');
    expect(cookies).toContain(`${OAUTH_STATE_COOKIE}=`);
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('Path=/');
  });

  it('GET /api/auth/oauth/google/start đọc redirect_to từ query string', async () => {
    // `@Query` chứ không phải `@Param`: path không có `/:redirect_to` nên
    // `@Param` sẽ ra `undefined` và mọi `redirect_to` đều bị bỏ qua.
    setEnv('GOOGLE_CLIENT_ID', 'cid');
    setEnv('GOOGLE_CLIENT_SECRET', 'csec');
    setEnv('GOOGLE_REDIRECT_URI', 'https://api/cb');
    const res = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/start?redirect_to=/premium');
    expect(res.status).toBe(302);
    expect(auth.beginGoogleOAuth).toHaveBeenLastCalledWith('/premium');
  });

  it('GET /api/auth/oauth/google/callback không tham số thì 302 về FE kèm cancelled', async () => {
    setEnv('FRONTEND_URL', FE);
    const res = await request(app.getHttpServer()).get('/api/auth/oauth/google/callback');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FE + '/sign-in?oauth=cancelled');
  });

  it('GET /api/auth/oauth/google/callback đọc code, state và error từ query string', async () => {
    setEnv('FRONTEND_URL', FE);
    const res = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/callback?code=abc&state=xyz')
      .set('Cookie', `${OAUTH_STATE_COOKIE}=xyz`);
    expect(res.status).toBe(302);
    expect(auth.takeGoogleState).toHaveBeenLastCalledWith('xyz');
    expect(auth.googleProfile).toHaveBeenLastCalledWith('abc', VERIFIER);

    // `error` khiến nhánh cancelled chạy trước, nên `googleProfile` phải **không**
    // được gọi thêm — xoá lịch sử lần gọi của nhánh hợp lệ trước khi so.
    auth.googleProfile.mockClear();
    await request(app.getHttpServer())
      .get('/api/auth/oauth/google/callback?error=access_denied&state=xyz')
      .set('Cookie', `${OAUTH_STATE_COOKIE}=xyz`);
    expect(auth.googleProfile).not.toHaveBeenCalled();
  });

  it('GET /api/auth/oauth/google/callback không có cookie state thì chặn, không 302 tới Google', async () => {
    // Bằng chứng ở tầng HTTP thật: bỏ khối so khớp ở controller thì test này đỏ
    // (`takeGoogleState` sẽ được gọi với state không hề có cookie nào đi kèm).
    setEnv('FRONTEND_URL', FE);
    auth.takeGoogleState.mockClear();
    const res = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/callback?code=abc&state=xyz');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(FE + '/sign-in?oauth=expired');
    expect(auth.takeGoogleState).not.toHaveBeenCalled();
  });

  it('state chỉ dùng được một lần: callback thứ hai về expired', async () => {
    setEnv('FRONTEND_URL', FE);
    // Lần đầu cố tình hỏng để dừng ở sau bước ăn state: như vậy test chỉ chứng
    // minh "state chết", không lẫn vào nhánh thành công.
    auth.googleProfile.mockResolvedValueOnce(null);
    auth.takeGoogleState
      .mockResolvedValueOnce({ codeVerifier: VERIFIER, redirectTo: '/' })
      .mockResolvedValue(null);
    const lan1 = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/callback?code=abc&state=' + STATE)
      .set('Cookie', `${OAUTH_STATE_COOKIE}=${STATE}`);
    expect(lan1.status).toBe(302);
    expect(lan1.headers.location).toBe(FE + '/sign-in?oauth=failed');
    const lan2 = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/callback?code=abc&state=' + STATE)
      .set('Cookie', `${OAUTH_STATE_COOKIE}=${STATE}`);
    expect(lan2.status).toBe(302);
    // Lần hai vẫn 302 tới `expired` nhưng vì **state đã bị ăn**, không phải vì
    // cookie lệch: test dưới chứng minh cookie khớp vẫn tới được bước ăn state.
    expect(lan2.headers.location).toBe(FE + '/sign-in?oauth=expired');
  });

  it('POST /api/auth/resend-verification thiếu body vẫn 200, không phải 500', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/resend-verification');
    expect(res.status).toBe(200);
    expect(auth.resendVerification).toHaveBeenLastCalledWith('', undefined);
  });
});
