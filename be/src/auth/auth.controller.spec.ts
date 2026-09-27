import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { ThrottleGuard, THROTTLE_KEY } from '../common/throttle.guard.ts';
import { AuthController, REFRESH_COOKIE, SESSION_COOKIE } from './auth.controller.ts';
import { AuthGuard } from './auth.guard.ts';
import { AuthService, REFRESH_TTL_MS } from './auth.service.ts';
import { ACCESS_TTL_SECONDS } from './tokens.ts';
import type { UserRole } from './auth.types.ts';

const OLD_ENV = { ...process.env };

const USER = { id: 7, email: 'a@b.co', name: null, role: 'user' as UserRole };
const REFRESH = 'r'.repeat(64);

function ctl() {
  const auth = {
    register: vi.fn().mockResolvedValue({ message: 'ok' }),
    login: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: REFRESH, user: USER }),
    verifyEmail: vi.fn().mockResolvedValue({ accessToken: 'v', refreshToken: REFRESH, user: USER }),
    refresh: vi.fn().mockResolvedValue({ accessToken: 'b', refreshToken: 's'.repeat(64), user: USER }),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue(USER),
  };
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
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
});

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
 * Nest đọc guard của route từ metadata `__guards__` (hằng `GUARDS_METADATA` trong
 * `@nestjs/common/constants`), nên đây là chỗ duy nhất để chứng minh route nào thật
 * sự được bảo vệ. Phần "có thật sự chạy không" thì test bên dưới dùng `ThrottleGuard`
 * thật với chính method của controller.
 */
function guardsOf(handler: (...args: never[]) => unknown): unknown[] {
  return (Reflect.getMetadata('__guards__', handler) as unknown[] | undefined) ?? [];
}

/** Cùng logic với `guardsOf`, nhưng đọc metadata của `ThrottleGuard`. */
function throttleOf(name: 'register' | 'verify' | 'login' | 'refresh') {
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

  it('register, verify, login, refresh dùng ThrottleGuard', () => {
    for (const h of ['register', 'verify', 'login', 'refresh'] as const) {
      expect(guardsOf(AuthController.prototype[h])).toContain(ThrottleGuard);
    }
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
    expect(throttleOf('refresh')).toEqual({ limit: 120, ttl: 60 * 1000 });
  });

  it('đăng ký bị chặn sau 20 lần trong 1 giờ', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.register as never, '10.0.0.1');
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

  it('refresh bị chặn sau 120 lần trong 1 phút', () => {
    const g = new ThrottleGuard(new Reflector());
    const ctx = ctxFor(AuthController.prototype.refresh as never, '10.0.0.4');
    for (let i = 0; i < 120; i += 1) expect(g.canActivate(ctx)).toBe(true);
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
});
