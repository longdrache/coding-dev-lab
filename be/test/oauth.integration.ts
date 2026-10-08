/**
 * Google OAuth pilot cho integration test: `beginGoogleOAuth` →
 * `takeGoogleState` → `googleProfile` → `linkOrCreateFromGoogle` với Postgres
 * thật. Ranh giới stub duy nhất là `fetch` tới Google (2 endpoint: đổi code
 * lấy token, lấy userinfo) — trả đúng hình Google thật.
 *
 * Không test ở mức HTTP controller ở đây: logic cookie/redirect của controller
 * đã được `auth.controller.spec.ts` phủ; cái cần DB thật là đối chiếu tài khoản
 * (khớp theo `sub`, chống ghép theo email, race P2002) — nằm hết ở service.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { AuthMailer } from '../src/auth/auth.mailer.ts';
import { PremiumService } from '../src/premium/premium.service.ts';
import { verifyAccessToken } from '../src/auth/tokens.ts';
import type { GoogleProfile } from '../src/auth/auth.service.ts';
import {
  ensureJwtKeys,
  requireTestDatabaseUrl,
  resetAuthTables,
  uniqueEmail,
} from './db-integration.ts';

const GOOGLE_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
const OLD_ENV: Record<string, string | undefined> = {};

const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: `google-sub-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  email: uniqueEmail('oauth'),
  emailVerified: true,
  name: 'Người Dùng Google',
  avatarUrl: null,
  ...over,
});

describe('Google OAuth (integration, DB thật, fetch Google stub)', () => {
  let db: DatabaseService;
  let svc: AuthService;
  const fetchMock = vi.fn();

  /** Google giả ở biên HTTP: token endpoint + userinfo endpoint. */
  function mockGoogle(userinfo: Record<string, unknown>, tokenOk = true) {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return {
          ok: tokenOk,
          status: tokenOk ? 200 : 400,
          json: async () => (tokenOk ? { access_token: 'gg-access-1' } : {}),
        };
      }
      if (u.includes('openidconnect.googleapis.com/v1/userinfo')) {
        return { ok: true, status: 200, json: async () => userinfo };
      }
      throw new Error(`URL Google không ngờ tới trong test: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  beforeAll(async () => {
    requireTestDatabaseUrl();
    ensureJwtKeys();
    for (const k of GOOGLE_VARS) OLD_ENV[k] = process.env[k];
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:4000/api/auth/oauth/google/callback';
    db = new DatabaseService();
    try {
      await db.$connect();
    } catch (e) {
      throw new Error(
        `Không nối được DB test — chạy \`prisma migrate deploy\` vào DB đó trước. ` +
          `Gốc: ${e instanceof Error ? e.message : e}`,
      );
    }
    // Mailer thật nhưng các luồng dưới không gửi mail.
    svc = new AuthService(db, new AuthMailer(), new PremiumService(db));
  });

  afterAll(async () => {
    for (const k of GOOGLE_VARS) {
      if (OLD_ENV[k] === undefined) delete process.env[k];
      else process.env[k] = OLD_ENV[k];
    }
    await resetAuthTables(db);
    await db.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  beforeEach(async () => {
    await resetAuthTables(db);
  });

  it('begin ghi state hash + verifier + redirect đã lọc, take ăn đúng một lần', async () => {
    const { state, codeVerifier } = await svc.beginGoogleOAuth('/premium');
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    const rows = await db.userOAuthState.findMany({});
    expect(rows).toHaveLength(1);
    // Chỉ lưu hash — lộ DB cũng không dựng lại được state để callback giả.
    expect(rows[0].stateHash).not.toBe(state);
    expect(rows[0].codeVerifier).toBe(codeVerifier);
    expect(rows[0].redirectTo).toBe('/premium');
    const first = await svc.takeGoogleState(state);
    expect(first).toMatchObject({ codeVerifier, redirectTo: '/premium' });
    // Ăn lần hai chết — state dùng một lần (chống replay callback).
    await expect(svc.takeGoogleState(state)).resolves.toBeNull();
    await expect(svc.takeGoogleState('state-la')).resolves.toBeNull();
  });

  it('redirect ngoài bị ép về / ngay ở begin', async () => {
    const { state } = await svc.beginGoogleOAuth('https://site-gia-mao.com');
    const consumed = await svc.takeGoogleState(state);
    expect(consumed?.redirectTo).toBe('/');
  });

  it('googleProfile gửi code_verifier (PKCE) và ép email_verified === true', async () => {
    mockGoogle({ sub: 's1', email: 'a@b.co', email_verified: true, name: 'A', picture: 'pic' });
    const p = await svc.googleProfile('ma-code', 'verifier-abc');
    expect(p).toMatchObject({ sub: 's1', emailVerified: true });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
    // Không gửi verifier là PKCE chết — Google đổi code cho bất kỳ ai có code.
    expect(String(init.body.get('code_verifier'))).toBe('verifier-abc');
  });

  it('email_verified "false" (chuỗi truthy) vẫn thành unverified, thiếu sub/email thì null', async () => {
    mockGoogle({ sub: 's1', email: 'a@b.co', email_verified: 'false' });
    const p = await svc.googleProfile('ma-code', 'v');
    expect(p?.emailVerified).toBe(false);
    expect(await svc.linkOrCreateFromGoogle({ ...p!, emailVerified: false }, null)).toEqual({
      kind: 'unverified',
    });
    mockGoogle({ email: 'a@b.co', email_verified: true });
    await expect(svc.googleProfile('ma-code', 'v')).resolves.toBeNull();
  });

  it('thiếu cấu hình Google thì googleProfile null chứ không ném', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    mockGoogle({});
    await expect(svc.googleProfile('ma-code', 'v')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  });

  it('email mới: tạo user đã xác minh + gắn UserAccount, mở được phiên', async () => {
    const p = profile({ email: uniqueEmail('moi') });
    const r = await svc.linkOrCreateFromGoogle(p, null);
    expect(r.kind).toBe('ok');
    const userId = (r as { userId: number }).userId;
    const user = await db.user.findUnique({ where: { id: userId } });
    // Google đã xác minh email này — để null là tài khoản mới bị login chặn
    // vĩnh viễn (không có đường nào gửi mã xác minh tới đó).
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.passwordHash).toBeNull();
    const link = await db.userAccount.findFirst({ where: { userId } });
    expect(link).toMatchObject({ provider: 'google', providerUserId: p.sub });
    const tokens = await svc.issueSessionForUserId(userId, 'UA');
    expect(await verifyAccessToken(tokens!.accessToken)).toMatchObject({
      sub: String(userId),
    });
  });

  it('cùng sub đăng nhập lại vào đúng user cũ + đồng bộ avatar mới', async () => {
    const p = profile({ avatarUrl: null });
    const first = await svc.linkOrCreateFromGoogle(p, null);
    const userId = (first as { userId: number }).userId;
    const second = await svc.linkOrCreateFromGoogle({ ...p, avatarUrl: 'https://img/new.png' }, null);
    expect(second).toEqual({ kind: 'ok', userId });
    expect((await db.user.findUnique({ where: { id: userId } }))?.avatarUrl).toBe(
      'https://img/new.png',
    );
  });

  it('email đã có (tài khoản mật khẩu), chưa đăng nhập → needs-password, không ghi link', async () => {
    const email = uniqueEmail('co-san');
    const owner = await db.user.create({
      data: { email, passwordHash: 'hash-gia', emailVerifiedAt: new Date() },
    });
    const r = await svc.linkOrCreateFromGoogle(profile({ email, sub: 'sub-la' }), null);
    expect(r).toEqual({ kind: 'needs-password', email });
    // Ghép ở đây là lỗ chiếm tài khoản theo email — phải không có dòng link nào.
    expect(await db.userAccount.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('hoa/thường email vẫn bắt needs-password (Postgres unique phân biệt hoa thường)', async () => {
    const email = uniqueEmail('hoa-thuong');
    await db.user.create({
      data: { email, passwordHash: 'hash-gia', emailVerifiedAt: new Date() },
    });
    const r = await svc.linkOrCreateFromGoogle(
      profile({ email: email.toUpperCase(), sub: 'sub-la-2' }),
      null,
    );
    expect(r.kind).toBe('needs-password');
    // Fail-open ở đây là sinh user mới trùng email khác hoa/thường.
    expect(await db.user.count({ where: { email } })).toBe(1);
  });

  it('đang đăng nhập đúng chủ thì ghép link, khác chủ thì conflict', async () => {
    const email = uniqueEmail('ghep');
    const owner = await db.user.create({
      data: { email, passwordHash: 'hash-gia', emailVerifiedAt: new Date() },
    });
    const nguoiKhac = await db.user.create({
      data: { email: uniqueEmail('khac'), passwordHash: 'hash-gia', emailVerifiedAt: new Date() },
    });
    const ok = await svc.linkOrCreateFromGoogle(profile({ email, sub: 'sub-ghep' }), owner.id);
    expect(ok).toEqual({ kind: 'ok', userId: owner.id });
    expect(
      await db.userAccount.count({ where: { userId: owner.id, providerUserId: 'sub-ghep' } }),
    ).toBe(1);
    // sub đã thuộc owner, người khác đang đăng nhập cầm callback đó → conflict.
    const conflict = await svc.linkOrCreateFromGoogle(
      profile({ email, sub: 'sub-ghep' }),
      nguoiKhac.id,
    );
    expect(conflict).toEqual({ kind: 'conflict' });
  });
});
