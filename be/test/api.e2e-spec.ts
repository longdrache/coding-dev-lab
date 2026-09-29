import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from './../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateKeyPair, SignJWT } from 'jose';
import { AppModule } from './../src/app.module.ts';
import { signAccessToken, hashToken } from './../src/auth/tokens.ts';
import { OAUTH_STATE_COOKIE } from './../src/auth/auth.controller.ts';
import type { UserRole } from './../src/auth/auth.types.ts';
// Quy tắc chọn 20 bài VIP nằm ở data dùng chung (FE + script seed), không phải
// ở BE — import thẳng để test e2e kiểm đúng cái danh sách đang nằm trong DB.
import { VIP_PROBLEM_COUNT, VIP_SLUGS } from '../../FE/app/data/problems.ts';


// `tokens.ts` đọc khoá RSA một cách lazy, nên đặt ở đây (sau các import, trước
// lúc ký token đầu tiên) là đủ. Nếu biến đã có sẵn thì giữ nguyên, để chạy
// local vẫn dùng khoá trong `be/.env`.
if (!process.env.ADMIN_JWT_PRIVATE_KEY || !process.env.ADMIN_JWT_PUBLIC_KEY) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.ADMIN_JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.ADMIN_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

/**
 * `AuthGuard` chỉ xác minh chữ ký RS256 rồi đọc claim `sub`/`role`, KHÔNG tra
 * bảng `User`. Nên token ký tại chỗ bằng khoá RSA trong `.env` là đủ cho mọi
 * route chỉ cần qua guard — không cần dựng user thật, trừ endpoint nào còn tra
 * dữ liệu theo user thì `sub` phải là id có thật trong DB.
 */
async function authCookie(userId = 1, role: UserRole = 'user'): Promise<string> {
  return `session=${await signAccessToken(userId, role)}`;
}

/**
 * Token có cấu trúc JWT đúng (alg RS256, đúng iss/aud) nhưng ký bằng cặp khoá
 * sinh ra tại chỗ, không phải khoá trong `.env`. Guard phải chặn ở bước xác minh
 * chữ ký chứ không chỉ "parse được là cho qua".
 */
async function foreignKeyToken(): Promise<string> {
  const { privateKey } = await generateKeyPair('RS256');
  return new SignJWT({ role: 'user' satisfies UserRole })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('1')
    .setIssuer('gocode')
    .setAudience('gocode-api')
    .setIssuedAt()
    .setExpirationTime('900s')
    .sign(privateKey);
}

type ProtectedRoute = { method: 'get' | 'post' | 'delete'; path: string };

/**
 * Kiểm kê mọi route đã đăng nhập sau khi guard cũ bị thay bằng `AuthGuard`.
 * Mục tiêu là hành vi bảo mật, không phải "code chạy được": mỗi
 * route phải chặn cả khi không cookie lẫn khi cookie là rác.
 *
 * Route nằm trong bảng thì xoá `@UseGuards(AuthGuard)` ở nó sẽ làm test 401
 * đỏ — đó là cách chứng minh guard thật sự còn treo trên route.
 */
const PROTECTED_ROUTES: ProtectedRoute[] = [
  { method: 'get', path: '/api/vip/health' },
  { method: 'post', path: '/api/submissions' },
  { method: 'post', path: '/api/submissions/batch' },
  { method: 'get', path: '/api/submissions/batch' },
  { method: 'get', path: '/api/submissions/tok_e2e' },
  { method: 'post', path: '/api/problems/two-sum/submit' },
  { method: 'get', path: '/api/progress/dashboard' },
  { method: 'get', path: '/api/progress/solved' },
  { method: 'get', path: '/api/progress/badges' },
  { method: 'get', path: '/api/progress/favorites' },
  { method: 'post', path: '/api/progress/solve' },
  { method: 'post', path: '/api/progress/favorites' },
  { method: 'delete', path: '/api/progress/favorites/two-sum' },
  { method: 'post', path: '/api/history' },
  { method: 'get', path: '/api/history' },
  { method: 'get', path: '/api/history/me' },
  { method: 'post', path: '/api/activity/login' },
  { method: 'post', path: '/api/activity/run' },
  { method: 'get', path: '/api/activity/me' },
  { method: 'get', path: '/api/qna' },
  { method: 'post', path: '/api/premium/checkout' },
  { method: 'post', path: '/api/premium/grant-vip' },
  { method: 'post', path: '/api/premium/cancel-vip' },
  { method: 'get', path: '/api/premium/status' },
  { method: 'post', path: '/api/premium/check-expired' },
];

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;

  /**
   * Hash của mọi `state` mà các test dưới đây tạo ra, để `afterAll` xoá **đúng**
   * dòng của test này.
   *
   * Vì sao phải theo dõi thay vì `deleteMany({})`: bảng `UserOAuthState` là bảng
   * dùng chung với người thật, và state chỉ sống 10 phút — xoá vô hạn là xoá luôn
   * luồng OAuth đang dở của họ, và người dùng bấm Google xong bị `expired` vì
   * chạy test của ta. Đây là database Neon production, không phải database riêng
   * cho test.
   */
  const stateDaTao = new Set<string>();

  /**
   * Dòng `UserOAuthState` ứng với `state` mà `start` vừa phát ra, đồng thời ghi
   * nhớ hash để `afterAll` xoá. `null` nghĩa là dòng đó không còn trong bảng — tức
   * đã bị `consumeState` ăn, hoặc đã hết hạn và bị lịch quét dọn.
   *
   * Tra theo `stateHash` chứ không phải `findMany()[0]`: bảng dùng chung với người
   * thật nên `[0]` có thể là dòng của ai đó, và mọi assert trên nó sẽ xanh vì lý do
   * hoàn toàn khác.
   *
   * Dùng `hashToken` của `tokens.ts` thay vì `hashState` riêng của `oauth-state.ts`:
   * cả hai đều là sha256 hex, nên nếu thuật toán đổi thì test này **đỏ** (không tìm
   * thấy dòng) chứ không xanh oan — đây là phụ thuộc thật, không phải khẳng định
   * trùng hợp.
   */
  async function dongState(state: string) {
    const stateHash = hashToken(state);
    stateDaTao.add(stateHash);
    return db.userOAuthState.findUnique({ where: { stateHash } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // rawBody cho Stripe webhook (giống main.ts)
    const express = (await import('express')).default;
    app.use(express.json({
      verify: (req: Record<string, unknown>, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }));
    await app.init();

    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
  });

  afterAll(async () => {
    // Dọn dữ liệu test. **Không** `userOAuthState.deleteMany({})`: bảng đó dùng
    // chung với người thật, và xoá vô hạn là xoá luôn luồng OAuth đang dở của họ
    // (state chỉ sống 10 phút, xoá đi thì người dùng bấm Google xong bị `expired`).
    // Chỉ xoá dòng mà chính test này tạo — xem `xoaStateCuaTest`.
    await db.qnaQuestion.deleteMany({ where: { email: 'e2e@test.local' } });
    for (const hash of stateDaTao) await db.userOAuthState.deleteMany({ where: { stateHash: hash } });
    await db.pageView.deleteMany({ where: { path: '/e2e-probe' } });
    await db.$disconnect();
    await app.close();
  });

  it('GET /api/problems trả danh sách đã duyệt, không lộ hiddenTests', async () => {
    const res = await request(app.getHttpServer()).get('/api/problems').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const p of res.body) {
      expect(p).not.toHaveProperty('hiddenTests');
      expect(p.slug).toBeTruthy();
    }
    expect(res.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    );
  });

  it('GET /api/problems/:slug trả bài kèm Cache-Control dài hạn', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/problems/two-sum')
      .expect(200);
    expect(res.body).not.toHaveProperty('hiddenTests');
    expect(res.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    );
  });

  it('GET /api/problems/:slug 404 khi không tồn tại', async () => {
    const res = await request(app.getHttpServer()).get('/api/problems/no-such-slug').expect(404);
    // Tài liệu hành vi đã đánh đổi: Nest ghi header trước khi gọi handler
    // nên 404 cũng mang Cache-Control và bị CDN giữ tới hết TTL.
    expect(res.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    );
  });

  it('POST /api/problems/:slug/submit 401 khi thiếu token', async () => {
    await request(app.getHttpServer())
      .post('/api/problems/two-sum/submit')
      .send({ languageId: 71, sourceCode: 'print(1)' })
      .expect(401);
  });

  it('POST /api/qna 400 khi thiếu field / sai email', async () => {
    await request(app.getHttpServer())
      .post('/api/qna')
      .send({ name: '', email: 'x', question: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/qna')
      .send({ name: 'E2E', email: 'not-an-email', question: 'hello world' })
      .expect(400);
  });

  it('POST /api/qna tạo câu hỏi hợp lệ', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/qna')
      .send({ name: 'E2E', email: 'e2e@test.local', question: ' cau hoi e2e?' })
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBeTruthy();
  });

  it('POST /api/views/track ghi nhận pageview', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/views/track')
      .send({ path: '/e2e-probe' })
      .expect(201);
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/premium/webhook 400 khi thiếu signature', async () => {
    await request(app.getHttpServer())
      .post('/api/premium/webhook')
      .send({ id: 'evt_x' })
      .expect(400);
  });

  it('POST /api/admin/login 401 khi sai credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ email: 'nope', password: 'nope' })
      .expect(401);
  });

  it('GET /api/admin/stats 401 khi thiếu token', async () => {
    await request(app.getHttpServer()).get('/api/admin/stats').expect(401);
  });

  it('POST /api/history 401 khi thiếu token', async () => {
    await request(app.getHttpServer())
      .post('/api/history')
      .send({ problemSlug: 'two-sum', languageId: 71, sourceCode: 'print(1)' })
      .expect(401);
  });

  // ===== Guard phiên đăng nhập =====

  // Hai test dưới đây là "anchor" đặt tên riêng cho hợp đồng bảo mật: route cần
  // đăng nhập phải chặn ở cả hai trạng thái xấu. Chúng cố ý không nằm trong vòng
  // lặp `PROTECTED_ROUTES` bên dưới, để khi ai đó xoá nhầm route khỏi bảng kiểm
  // kê thì bằng chứng ở đây vẫn còn nguyên.
  it('route cần đăng nhập trả 401 khi không có cookie', async () => {
    await request(app.getHttpServer()).get('/api/progress/dashboard').expect(401);
  });

  it('cookie phiên giả không qua được AuthGuard', async () => {
    await request(app.getHttpServer())
      .get('/api/progress/dashboard')
      .set('Cookie', 'session=khong-phai-jwt; refresh=x')
      .expect(401);
  });

  describe('route đã đăng nhập chặn cả cookie rỗng lẫn cookie rác', () => {
    // Không `async`: cần trả về chính object `Test` của supertest để `.set()` nối
    // được header sau, chứ không phải Promise đã resolve thành response.
    function call(method: ProtectedRoute['method'], path: string) {
      const req = request(app.getHttpServer());
      if (method === 'get') return req.get(path);
      if (method === 'delete') return req.delete(path);
      return req.post(path);
    }

    for (const route of PROTECTED_ROUTES) {
      const label = `${route.method.toUpperCase()} ${route.path}`;

      it(`${label} — 401 khi không có cookie`, async () => {
        expect((await call(route.method, route.path)).status).toBe(401);
      });

      it(`${label} — 401 khi cookie "session" là chuỗi rác`, async () => {
        const res = await call(route.method, route.path).set(
          'Cookie',
          'session=khong-phai-jwt',
        );
        expect(res.status).toBe(401);
      });
    }
  });

  describe('cookie hợp lệ đi qua được guard', () => {
    it('GET /api/vip/health 200 với role vip trong token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/vip/health')
        .set('Cookie', await authCookie(1, 'vip'))
        .expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('GET /api/vip/health 403 với role user — RolesGuard đọc roles từ token', async () => {
      await request(app.getHttpServer())
        .get('/api/vip/health')
        .set('Cookie', await authCookie(1, 'user'))
        .expect(403);
    });

    it('GET /api/vip/health 200 với role admin — decorator cho phép cả vip lẫn admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/vip/health')
        .set('Cookie', await authCookie(1, 'admin'))
        .expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('POST /api/premium/grant-vip 403 khi role trong token không phải admin', async () => {
      await request(app.getHttpServer())
        .post('/api/premium/grant-vip')
        .send({ userId: '1', plan: 'monthly' })
        .set('Cookie', await authCookie(1, 'vip'))
        .expect(403);
    });

    it('GET /api/progress/dashboard 200 — guard trả userId dạng chuỗi, controller phải Number()', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/progress/dashboard')
        .set('Cookie', await authCookie())
        .expect(200);
      expect(res.body.solved.total).toBe(0);
      expect(typeof res.body.streak).toBe('number');
    });

    it('GET /api/activity/me 200 với cookie hợp lệ', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/activity/me')
        .set('Cookie', await authCookie())
        .expect(200);
      expect(res.body.map).toEqual({});
    });

    it('GET /api/history 200 với cookie hợp lệ', async () => {
      await request(app.getHttpServer())
        .get('/api/history')
        .set('Cookie', await authCookie())
        .expect(200);
    });

    it('GET /api/qna 200 với cookie hợp lệ (trước đây chỉ nhận token của guard cũ)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/qna')
        .set('Cookie', await authCookie())
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('token không đúng khoá bị từ chối', () => {
    it('401 khi token khoá khác, dù cấu trúc JWT hợp lệ', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/progress/dashboard')
        .set('Cookie', 'session=' + (await foreignKeyToken()))
        .expect(401);
      expect(res.body.message).toBe('Phiên không hợp lệ hoặc đã hết hạn');
    });
  });

  // ===== Route Google OAuth =====
  //
  // Hai route này **public**: người bấm nút "Đăng nhập bằng Google" thường chưa có
  // cookie phiên nào, nên chúng phải trả 302 chứ không phải 401. Đây là bằng
  // chứng ở tầng HTTP thật; tầng unit (`auth.controller.spec.ts`) canh thêm
  // metadata `__guards__` để `@UseGuards(AuthGuard)` bị gắn nhầm là lộ ra.
  describe('route Google OAuth không yêu cầu phiên', () => {
    const FRONTEND_URL_CU = process.env.FRONTEND_URL;
    const CLIENT_ID_CU = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET_CU = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI_CU = process.env.GOOGLE_REDIRECT_URI;

    /** `start` từ chối phát redirect khi chưa cấu hình đủ ba biến, nên test tự đặt. */
    function cauHinhGoogle() {
      process.env.GOOGLE_CLIENT_ID = 'e2e.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'e2e-client-secret';
      process.env.GOOGLE_REDIRECT_URI = 'https://api.go-code.vercel.app/api/auth/oauth/google/callback';
      process.env.FRONTEND_URL = 'https://go-code.vercel.app';
    }

    afterEach(() => {
      // Phải khôi phục **có điều kiện** cả ba biến, y hệt `FRONTEND_URL`: `start` kiểm
      // cả ba nên để sót giá trị đã đặt ở test trước là các test sau "chưa cấu
      // hình" xanh sai lý do. Trước đây `GOOGLE_CLIENT_SECRET` không hề được set
      // cũng không được khôi phục, tức test này sẽ rò cấu hình sang test sau.
      if (CLIENT_ID_CU === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = CLIENT_ID_CU;
      if (CLIENT_SECRET_CU === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = CLIENT_SECRET_CU;
      if (REDIRECT_URI_CU === undefined) delete process.env.GOOGLE_REDIRECT_URI;
      else process.env.GOOGLE_REDIRECT_URI = REDIRECT_URI_CU;
      if (FRONTEND_URL_CU === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = FRONTEND_URL_CU;
    });

    it('GET start không cookie thì 302 tới accounts.google.com, không phải 401', async () => {
      cauHinhGoogle();
      const res = await request(app.getHttpServer()).get('/api/auth/oauth/google/start');
      expect(res.status).toBe(302);
      const url = new URL(String(res.headers.location));
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('e2e.apps.googleusercontent.com');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('state')).toBeTruthy();
      // PKCE S256 là thứ chống chặn đoạn `code`; thiếu nó thì Google trả 400
      // lúc đổi code và mọi test khác vẫn xanh vì lý do khác.
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('GET callback không tham số thì 302 về FE, không phải 401 và không phải 500', async () => {
      cauHinhGoogle();
      const res = await request(app.getHttpServer()).get('/api/auth/oauth/google/callback');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=cancelled');
    });

    it('redirect_to ngoài nội bộ thì dòng state lưu "/" chứ không lưu URL đó', async () => {
      cauHinhGoogle();
      const res = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/start?redirect_to=https://evil.com');
      expect(res.status).toBe(302);
      const state = new URL(String(res.headers.location)).searchParams.get('state')!;
      const dong = await dongState(state);
      expect(dong?.redirectTo).toBe('/');
      // State lưu dạng hash, không lưu bản rõ — rò bảng này cũng không cấp được
      // phiên.
      expect(dong?.stateHash).not.toBe(state);
      expect(dong?.stateHash).toHaveLength(64);
    });

    it('redirect_to hợp lệ thì dòng state lưu nguyên đường dẫn', async () => {
      cauHinhGoogle();
      const res = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/start?redirect_to=/problem/two-sum');
      const state = new URL(String(res.headers.location)).searchParams.get('state')!;
      const dong = await dongState(state);
      expect(dong?.redirectTo).toBe('/problem/two-sum');
    });

    it('start đặt cookie ràng buộc state, httpOnly và Path=/', async () => {
      cauHinhGoogle();
      const res = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/start?redirect_to=/premium');
      const cookies = (res.headers['set-cookie'] as unknown as string[]).join(' | ');
      // Cookie này là thứ chặn login CSRF: callback so nó với `?state=`, và trình
      // duyệt không dựng lại được vì `HttpOnly`.
      expect(cookies).toContain(`${OAUTH_STATE_COOKIE}=`);
      expect(cookies).toContain('HttpOnly');
      expect(cookies).toContain('Path=/');
    });

    it('state dùng một lần rồi chết: callback thứ hai về expired', async () => {
      cauHinhGoogle();
      const start = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/start?redirect_to=/premium');
      const state = new URL(String(start.headers.location)).searchParams.get('state')!;
      // Cookie phải mang **đúng** `state` mà `start` vừa sinh: đây là bằng chứng
      // `Set-Cookie` thật sự đi kèm `Location`, ở tầng HTTP chứ không phải ở unit
      // với `res.cookie` là mock. Không có nó thì callback chặn ở bước so khớp và
      // lần đầu cũng ra `expired` — test xanh vì lý do khác.
      const cookie = `${OAUTH_STATE_COOKIE}=${state}`;

      // Bỏ cấu hình trước khi gọi callback: `googleProfile` không có `fetch`
      // nào để gọi nên trả `null` ngay, test chạy ngoài mạng và chỉ chứng minh
      // "state chết sau một lần" chứ không lẫn vào nhánh thành công.
      delete process.env.GOOGLE_CLIENT_ID;
      const lan1 = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/callback?code=abc&state=' + state)
        .set('Cookie', cookie);
      expect(lan1.status).toBe(302);
      expect(lan1.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=failed');

      const lan2 = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/callback?code=abc&state=' + state)
        .set('Cookie', cookie);
      expect(lan2.status).toBe(302);
      expect(lan2.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=expired');
    });

    it('callback không có cookie state thì chặn, không đụng tới state trong DB', async () => {
      cauHinhGoogle();
      const start = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/start?redirect_to=/premium');
      const state = new URL(String(start.headers.location)).searchParams.get('state')!;
      // Không `.set('Cookie', ...)`: mô phỏng đúng link độc hại — `code`+`state` của
      // kẻ tấn công được gửi cho trình duyệt nạn nhân, nạn nhân không hề bấm nút.
      delete process.env.GOOGLE_CLIENT_ID;
      const res = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/callback?code=abc&state=' + state);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=expired');
      // Dòng state phải **còn nguyên**: ăn nó ở nhánh lệch biến một request rác
      // thành công cụ phá phiên của người dùng thật.
      expect(await dongState(state)).not.toBeNull();
    });

    it('cookie state lệch với ?state= thì chặn và không xoá cookie', async () => {
      cauHinhGoogle();
      const start = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/start?redirect_to=/premium');
      const state = new URL(String(start.headers.location)).searchParams.get('state')!;
      delete process.env.GOOGLE_CLIENT_ID;
      const res = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/callback?code=abc&state=' + state)
        .set('Cookie', `${OAUTH_STATE_COOKIE}=cookie-cua-nguoi-khac`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=expired');
      expect(await dongState(state)).not.toBeNull();
      // **Không** `Clear-Cookie` ở nhánh lệch: người dùng thật có thể đang mở hai
      // luồng song song, và xoá ở đây là cho phép request rác phá phiên họ.
      const cleared = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
      expect(cleared.join(' | ')).not.toContain(`${OAUTH_STATE_COOKIE}=;`);
    });

    it('callback khớp cookie thì xoá cookie state ngay', async () => {
      cauHinhGoogle();
      const start = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/start?redirect_to=/premium');
      const state = new URL(String(start.headers.location)).searchParams.get('state')!;
      delete process.env.GOOGLE_CLIENT_ID;
      const res = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/callback?code=abc&state=' + state)
        .set('Cookie', `${OAUTH_STATE_COOKIE}=${state}`);
      const cleared = ((res.headers['set-cookie'] as unknown as string[]) ?? []).join(' | ');
      expect(cleared).toContain(`${OAUTH_STATE_COOKIE}=;`);
      expect(cleared).toContain('Path=/');
    });

    it('state không tồn tại thì về expired, không 500', async () => {
      cauHinhGoogle();
      const res = await request(app.getHttpServer())
        .get('/api/auth/oauth/google/callback?code=abc&state=khong-ton-tai');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=expired');
    });

    it('chưa cấu hình GOOGLE_CLIENT_ID thì start báo lỗi, không đẩy sang Google', async () => {
      process.env.FRONTEND_URL = 'https://go-code.vercel.app';
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_REDIRECT_URI;
      const res = await request(app.getHttpServer()).get('/api/auth/oauth/google/start');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=failed');
    });

    it('thiếu GOOGLE_CLIENT_SECRET thì start báo lỗi ngay, không đẩy sang Google', async () => {
      // Secret chỉ dùng ở `callback`. Thiếu nó thì `start` chạy trơn và người dùng
      // đi trọn màn hình đồng ý của Google rồi mới nhận `failed`.
      process.env.FRONTEND_URL = 'https://go-code.vercel.app';
      process.env.GOOGLE_CLIENT_ID = 'e2e.apps.googleusercontent.com';
      process.env.GOOGLE_REDIRECT_URI = 'https://api.go-code.vercel.app/api/auth/oauth/google/callback';
      delete process.env.GOOGLE_CLIENT_SECRET;
      const res = await request(app.getHttpServer()).get('/api/auth/oauth/google/start');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://go-code.vercel.app/sign-in?oauth=failed');
    });
  });

  // ===== Bảng nền cho Google OAuth =====
  //
  // Chỉ khẳng định "bảng có thật trong database và đúng hợp đồng cột", không
  // assert hành vi OAuth — phần đó thuộc các task sau. Đọc thẳng
  // `information_schema`/`pg_catalog` vì đó mới là bằng chứng migration đã
  // được áp dụng: client Prisma được sinh từ `schema.prisma` nên vẫn có
  // `db.userAccount` ngay cả khi bảng chưa tồn tại trong database.
  describe('bảng UserAccount + UserOAuthState', () => {
    async function columnsOf(table: string): Promise<string[]> {
      const rows = await db.$queryRaw<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
        ORDER BY column_name
      `;
      return rows.map((row) => row.column_name);
    }

    it('UserAccount có đúng 5 cột đã khai báo', async () => {
      expect(await columnsOf('UserAccount')).toEqual([
        'createdAt',
        'id',
        'provider',
        'providerUserId',
        'userId',
      ]);
    });

    it('UserOAuthState có đúng 5 cột, stateHash là khoá chính', async () => {
      expect(await columnsOf('UserOAuthState')).toEqual([
        'codeVerifier',
        'expiresAt',
        'redirectTo',
        'stateHash',
        'usedAt',
      ]);
      const pk = await db.$queryRaw<{ column_name: string }[]>`
        SELECT a.attname AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = ${'"UserOAuthState"'}::regclass AND c.contype = 'p'
      `;
      expect(pk.map((row) => row.column_name)).toEqual(['stateHash']);
    });

    // Unique (provider, providerUserId) là chốt chặn đăng nhập trùng — nếu mất
    // index này thì task sau vẫn chạy được nhưng có thể gắn một tài khoản
    // Google vào hai user khác nhau, nên phải có test canh. Lấy cột thật của
    // index từ `pg_catalog` thay vì so chuỗi `pg_indexes.indexdef` — chuỗi đó
    // còn lẫn schema và `USING btree`, chi tiết không liên quan tới hợp đồng.
    it('UserAccount có đúng một unique index trên (provider, providerUserId)', async () => {
      const unique = await db.$queryRaw<{ index_name: string; columns: string }[]>`
        SELECT i.relname AS index_name,
               string_agg(a.attname, ',' ORDER BY a.attname) AS columns
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_attribute a
          ON a.attrelid = x.indrelid AND a.attnum = ANY(x.indkey)
        WHERE x.indrelid = ${'"UserAccount"'}::regclass
          AND x.indisunique
          AND NOT x.indisprimary
        GROUP BY i.relname
      `;
      expect(unique.map((row) => row.columns)).toEqual(['provider,providerUserId']);
    });

    // Index thường trên `userId` là đường đi mà mọi truy vấn "danh sách tài
    // khoản liên kết của user" sẽ dùng. Mất index không làm hỏng tính đúng
    // đắn nên dễ lọt — task sau vẫn chạy được, chỉ chậm lại dần. Vì vậy phải
    // canh riêng, tách khỏi test unique ở trên vì `indisunique` ở đây là FALSE.
    it('UserAccount có đúng một index thường trên (userId)', async () => {
      const plain = await db.$queryRaw<{ index_name: string; columns: string }[]>`
        SELECT i.relname AS index_name,
               string_agg(a.attname, ',' ORDER BY a.attname) AS columns
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_attribute a
          ON a.attrelid = x.indrelid AND a.attnum = ANY(x.indkey)
        WHERE x.indrelid = ${'"UserAccount"'}::regclass
          AND NOT x.indisunique
          AND NOT x.indisprimary
        GROUP BY i.relname
      `;
      expect(plain.map((row) => row.columns)).toEqual(['userId']);
    });

    // Lịch dọn dòng OAuth hết hạn quét bằng `WHERE expiresAt <= now()`. Không có
    // index thì mỗi lần quét phải quét cả bảng, và bảng này phình theo **số lần
    // bấm nút** chứ không theo số người. Mất index không làm hỏng tính đúng đắn
    // nên rất dễ lọt, vì vậy phải canh riêng.
    it('UserOAuthState có index thường trên (expiresAt) cho lịch dọn', async () => {
      const plain = await db.$queryRaw<{ index_name: string; columns: string }[]>`
        SELECT i.relname AS index_name,
               string_agg(a.attname, ',' ORDER BY a.attname) AS columns
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_attribute a
          ON a.attrelid = x.indrelid AND a.attnum = ANY(x.indkey)
        WHERE x.indrelid = ${'"UserOAuthState"'}::regclass
          AND NOT x.indisunique
          AND NOT x.indisprimary
        GROUP BY i.relname
      `;
      expect(plain.map((row) => row.columns)).toEqual(['expiresAt']);
    });

    // `avatarUrl` phải **nullable**: migration này chạy trên bảng `User` đã có dữ
    // liệu, và tài khoản đăng ký bằng mật khẩu không có ảnh nào. Nếu cột là NOT
    // NULL thì hoặc migration hỏng, hoặc nó phải ghi đè dữ liệu — test này canh
    // đúng điều đó thay vì tin lời cam kết trong comment của migration.
    it('User.avatarUrl tồn tại và nullable', async () => {
      const cot = await db.$queryRaw<{ column_name: string; is_nullable: string }[]>`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'User'
          AND column_name = 'avatarUrl'
      `;
      expect(cot).toEqual([{ column_name: 'avatarUrl', is_nullable: 'YES' }]);
    });

    it('xoá user thì bay luôn UserAccount nhờ ON DELETE CASCADE', async () => {
      const fks = await db.$queryRaw<{ delete_rule: string }[]>`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = rc.constraint_name
         AND tc.constraint_schema = rc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'UserAccount'
          AND tc.constraint_schema = 'public'
      `;
      expect(fks.map((row) => row.delete_rule)).toEqual(['CASCADE']);
    });
  });

  // ===== Bài VIP =====
  //
  // Nhóm test này là **bằng chứng không lọt**: đi qua HTTP thật với cookie thật,
  // token thật, và soi **payload** chứ không chỉ status — endpoint trả 403 kèm
  // luôn đề bài thì status đúng mà nội dung vẫn lọt.
  describe('bài VIP: cột isVip và 20 bài được đánh dấu', () => {
    it('Problem.isVip tồn tại, NOT NULL, mặc định false', async () => {
      // `NOT NULL DEFAULT false` chứ không phải nullable: cột nullable thì câu
      // `where: { isVip: true }` của script seed âm thầm bỏ sót bài có NULL, và
      // "dựng lại DB cho ra đúng 20 bài VIP" chỉ đúng ở DB mới.
      const cot = await db.$queryRaw<{
        column_name: string;
        is_nullable: string;
        column_default: string;
        data_type: string;
      }[]>`
        SELECT column_name, is_nullable, column_default, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Problem'
          AND column_name = 'isVip'
      `;
      expect(cot).toEqual([
        {
          column_name: 'isVip',
          is_nullable: 'NO',
          column_default: 'false',
          data_type: 'boolean',
        },
      ]);
    });

    it('đúng 20 bài trong DB khớp từng slug với quy tắc tất định ở problems.ts', async () => {
      const vip = await db.problem.findMany({
        where: { isVip: true },
        select: { slug: true },
      });
      expect(vip.map((p) => p.slug).sort()).toEqual([...VIP_SLUGS].sort());
    });

    it('không bài nào ngoài 20 slug đó mang isVip', async () => {
      const ngoai = await db.problem.count({
        where: { isVip: true, slug: { notIn: [...VIP_SLUGS] } },
      });
      expect(ngoai).toBe(0);
    });

    it('20 bài đó đều đã publish — bài draft không lọt vào danh sách VIP', async () => {
      const vip = await db.problem.findMany({
        where: { isVip: true, slug: { in: [...VIP_SLUGS] } },
        select: { status: true },
      });
      expect(vip).toHaveLength(VIP_PROBLEM_COUNT);
      for (const p of vip) expect(p.status).toBe('published');
    });
  });

  describe('bài VIP: danh sách không rò nội dung', () => {
    let slugVip: string;
    let slugThuong: string;

    beforeAll(async () => {
      // `orderBy` chứ không dựa vào `findFirst` trần: lần chạy nào cũng phải bắt
      // **cùng một** bài đại diện, nếu không thì một bài VIP khác có hành vi khác
      // làm test đỏ vì lý do không liên quan.
      const vip = await db.problem.findFirst({
        where: { isVip: true, status: 'published' },
        select: { slug: true },
        orderBy: { slug: 'asc' },
      });
      const thuong = await db.problem.findFirst({
        where: { isVip: false, status: 'published' },
        select: { slug: true },
        orderBy: { slug: 'asc' },
      });
      slugVip = vip!.slug;
      slugThuong = thuong!.slug;
    });

    it('tiêu đề vẫn hiện, payload chỉ còn 5 trường, không có test nào lọt ra', async () => {
      const res = await request(app.getHttpServer()).get('/api/problems').expect(200);
      const row = res.body.find((p: { slug: string }) => p.slug === slugVip);
      expect(row).toBeTruthy();
      expect(row.title).toBeTruthy();
      expect(row.isVip).toBe(true);
      // Allowlist: đủ để vẽ hàng, lọc theo chủ đề; không đủ để làm bài.
      expect(Object.keys(row).sort()).toEqual(['difficulty', 'isVip', 'slug', 'title', 'topic']);
      const chuoi = JSON.stringify(row);
      for (const field of ['hiddenTests', 'description', 'examples', 'constraints', 'tests', 'starterCodes']) {
        expect(chuoi, `còn sót ${field}`).not.toContain(field);
      }
      // Nội dung thật của bài đó không nằm trong payload, kể cả đoạn đầu.
      const goc = await db.problem.findUnique({ where: { slug: slugVip } });
      expect(chuoi).not.toContain(goc!.description.slice(0, 30));
    });

    it('bài thường trong cùng danh sách vẫn có nội dung như cũ', async () => {
      const res = await request(app.getHttpServer()).get('/api/problems').expect(200);
      const row = res.body.find((p: { slug: string }) => p.slug === slugThuong);
      expect(row).toBeTruthy();
      expect(row.isVip).toBe(false);
      expect(row.description).toBeTruthy();
      expect(row).not.toHaveProperty('hiddenTests');
    });

    it('payload phụ thuộc role — và mỗi nhánh mang đúng loại cache của nó', async () => {
      const [khach, vip, admin] = await Promise.all([
        request(app.getHttpServer()).get('/api/problems'),
        request(app.getHttpServer()).get('/api/problems').set('Cookie', await authCookie(1, 'vip')),
        request(app.getHttpServer()).get('/api/problems').set('Cookie', await authCookie(1, 'admin')),
      ]);
      const dong = (res: { status: number; body: Array<{ slug: string }> }) => {
        expect(res.status).toBe(200);
        return JSON.stringify(res.body.find((p) => p.slug === slugVip));
      };
      // Người có VIP nhận mô tả đầy đủ — đúng lỗi "vip chỉ thấy tiêu đề" đã sửa.
      expect(dong(vip)).not.toBe(dong(khach));
      expect(dong(admin)).toBe(dong(vip));
      const goc = await db.problem.findUnique({ where: { slug: slugVip } });
      expect(dong(vip)).toContain(goc!.description.slice(0, 30));
      // Nhưng bản đầy đủ tuyệt đối không lọt sang response của khách.
      expect(JSON.stringify(khach.body)).not.toContain(goc!.description.slice(0, 30));

      /**
       * Điều kiện nghiệm thu: nhánh **có mô tả** thì rời cache chung, nhánh
       * **không mô tả** thì giữ. Đảo chiều là rò nội dung VIP qua CDN — lỗi
       * nghiêm trọng hơn nhiều so với ngược lại.
       */
      for (const res of [vip, admin]) {
        expect(res.headers['cache-control']).toBe('private, no-store');
      }
      expect(khach.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
      );
    });

    it('người có VIP vẫn không bao giờ nhận hiddenTests ở danh sách', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/problems')
        .set('Cookie', await authCookie(1, 'vip'))
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('hiddenTests');
    });
  });

  describe('bài VIP: chi tiết chặn đúng ba trạng thái, không rò gì', () => {
    let slugVip: string;

    beforeAll(async () => {
      const vip = await db.problem.findFirst({
        where: { isVip: true, status: 'published' },
        select: { slug: true },
        orderBy: { slug: 'asc' },
      });
      slugVip = vip!.slug;
    });

    it('khách không cookie → 403 problem_vip_only, body rỗng nội dung, không vào cache chung', async () => {
      const res = await request(app.getHttpServer()).get(`/api/problems/${slugVip}`).expect(403);
      expect(res.body.code).toBe('problem_vip_only');
      const goc = await db.problem.findUnique({ where: { slug: slugVip } });
      const chuoi = JSON.stringify(res.body);
      expect(chuoi).not.toContain(goc!.description.slice(0, 30));
      for (const field of ['hiddenTests', 'examples', 'constraints', 'tests', 'starterCodes']) {
        expect(chuoi, `lọt ${field}`).not.toContain(field);
      }
      // 403 mà mang `s-maxage` thì CDN giữ lại rồi phục vụ cho mọi người.
      expect(res.headers['cache-control'] ?? '').not.toContain('s-maxage');
      expect(res.headers['cache-control'] ?? '').not.toContain('public');
    });

    it('cookie rác → 403 problem_vip_only chứ không 401 và không 500', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/problems/${slugVip}`)
        .set('Cookie', 'session=khong-phai-jwt')
        .expect(403);
      expect(res.body.code).toBe('problem_vip_only');
    });

    it('role user → 403 problem_vip_only, body không chứa nội dung bài', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/problems/${slugVip}`)
        .set('Cookie', await authCookie(1, 'user'))
        .expect(403);
      expect(res.body.code).toBe('problem_vip_only');
      const goc = await db.problem.findUnique({ where: { slug: slugVip } });
      expect(JSON.stringify(res.body)).not.toContain(goc!.description.slice(0, 30));
    });

    it('role vip → 200, có đề bài, không hiddenTests, và rời cache chung', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/problems/${slugVip}`)
        .set('Cookie', await authCookie(1, 'vip'))
        .expect(200);
      expect(res.body.description).toBeTruthy();
      expect(res.body.examples.length).toBeGreaterThan(0);
      expect(res.body).not.toHaveProperty('hiddenTests');
      // `private, no-store`: nội dung bài VIP phụ thuộc người xem nên tuyệt đối
      // không được nằm trong CDN.
      expect(res.headers['cache-control']).toBe('private, no-store');
    });

    it('role admin → 200, có đề bài — admin là người duyệt nội dung', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/problems/${slugVip}`)
        .set('Cookie', await authCookie(1, 'admin'))
        .expect(200);
      expect(res.body.description).toBeTruthy();
    });

    it('bài thường vẫn mở được với khách, header cache chung giữ nguyên', async () => {
      const res = await request(app.getHttpServer()).get('/api/problems/two-sum').expect(200);
      expect(res.body.description).toBeTruthy();
      expect(res.headers['cache-control']).toBe(
        'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
      );
    });
  });

  describe('bài VIP: mọi endpoint chạm tới bài đều bị chặn, không riêng GET chi tiết', () => {
    let slugVip: string;
    let slugThuong: string;
    /** User thật trong DB — `Submission`/`SolvedProblem` có khoá ngoại tới `User`. */
    let userId: number;
    const userEmail = 'e2e-vip-probe@test.local';

    beforeAll(async () => {
      const vip = await db.problem.findFirst({
        where: { isVip: true, status: 'published' },
        select: { slug: true },
        orderBy: { slug: 'asc' },
      });
      slugVip = vip!.slug;
      const thuong = await db.problem.findFirst({
        where: { isVip: false, status: 'published' },
        select: { slug: true },
        orderBy: { slug: 'asc' },
      });
      slugThuong = thuong!.slug;
      const existing = await db.user.findFirst({ where: { email: userEmail }, select: { id: true } });
      const user = existing ?? (await db.user.create({ data: { email: userEmail } }));
      userId = user.id;
    });

    afterAll(async () => {
      await db.submission.deleteMany({ where: { userId } });
      await db.solvedProblem.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    /**
     * Mỗi dòng là **một endpoint** đã khoá.
     *
     * `guest` là status mong đợi cho khách **không cookie**: phần lớn route có
     * `AuthGuard` nên trả 401 trước khi tới chính sách VIP — đó còn mạnh hơn, và
     * ghi rõ ra thay vì để test tự hiểu. Riêng `GET /api/problems/:slug` dùng
     * `OptionalAuthGuard` nên khách tới được và bị chính sách chặn bằng 403.
     *
     * Comment ở từng dòng nói vì sao endpoint đó phải khoá — endpoint mới chạm
     * tới bài mà không thêm dòng thì bảng này không còn là hợp đồng.
     */
    const ENDPOINTS_CHUA_KHOA: Array<{
      label: string;
      guest: 401 | 403;
      call: (cookie: string, slug: string) => request.Test;
    }> = [
      {
        // Chi tiết: đường rò nội dung trực tiếp.
        label: 'GET /api/problems/:slug',
        guest: 403,
        call: (c, s) => request(app.getHttpServer()).get(`/api/problems/${s}`).set('Cookie', c),
      },
      {
        // Nộp bài: chạy Judge0 trên test ẩn. Không khoá thì vừa đốt tài nguyên
        // máy chấm, vừa lộ `Bài toán chưa có test ẩn` / `Quá nhiều test ẩn` —
        // hai câu đó tự nó đã nói bài có bao nhiêu test ẩn.
        label: 'POST /api/problems/:slug/submit',
        guest: 401,
        call: (c, s) =>
          request(app.getHttpServer())
            .post(`/api/problems/${s}/submit`)
            .set('Cookie', c)
            .send({ languageId: 71, sourceCode: 'print(1)' }),
      },
      {
        // Ghi lịch sử thủ công: tự khai "đã giải" một bài không đọc được đề.
        label: 'POST /api/history',
        guest: 401,
        call: (c, s) =>
          request(app.getHttpServer())
            .post('/api/history')
            .set('Cookie', c)
            .send({ problemSlug: s, languageId: 71, sourceCode: 'print(1)' }),
      },
      {
        // Lịch sử theo slug: trả 403 chứ không phải `[]` — `[]` vẫn là câu trả
        // lời **hợp lệ** cho một slug có thật, tức là công cụ dò bài VIP.
        label: 'GET /api/history?slug=',
        guest: 401,
        call: (c, s) =>
          request(app.getHttpServer())
            .get(`/api/history?slug=${encodeURIComponent(s)}`)
            .set('Cookie', c),
      },
      {
        label: 'GET /api/history/me?slug=',
        guest: 401,
        call: (c, s) =>
          request(app.getHttpServer())
            .get(`/api/history/me?slug=${encodeURIComponent(s)}`)
            .set('Cookie', c),
      },
      {
        // Đánh dấu đã giải: nếu lọt thì lên được huy hiệu `solve_50`/`dsa_pro`
        // mà không cần đọc một chữ nào của đề.
        label: 'POST /api/progress/solve',
        guest: 401,
        call: (c, s) =>
          request(app.getHttpServer())
            .post('/api/progress/solve')
            .set('Cookie', c)
            .send({ slug: s, difficulty: 'Khó' }),
      },
    ];

    for (const ep of ENDPOINTS_CHUA_KHOA) {
      it(`${ep.label} — role user: 403 problem_vip_only, body không lọt nội dung bài`, async () => {
        const res = await ep.call(await authCookie(userId, 'user'), slugVip);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('problem_vip_only');
        const goc = await db.problem.findUnique({ where: { slug: slugVip } });
        expect(JSON.stringify(res.body)).not.toContain(goc!.description.slice(0, 30));
      });

      it(`${ep.label} — khách không cookie: ${ep.guest}`, async () => {
        const res = await ep.call('', slugVip);
        expect(res.status).toBe(ep.guest);
        if (ep.guest === 403) expect(res.body.code).toBe('problem_vip_only');
      });
    }

    it('không endpoint nào ghi được Submission/SolvedProblem cho bài VIP', async () => {
      const cookie = await authCookie(userId, 'user');
      const truoc = {
        sub: await db.submission.count({ where: { userId, problemSlug: slugVip } }),
        solved: await db.solvedProblem.count({ where: { userId, slug: slugVip } }),
      };
      await request(app.getHttpServer())
        .post('/api/history')
        .set('Cookie', cookie)
        .send({ problemSlug: slugVip, languageId: 71, sourceCode: 'print(1)' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/progress/solve')
        .set('Cookie', cookie)
        .send({ slug: slugVip, difficulty: 'Khó' })
        .expect(403);
      const sau = {
        sub: await db.submission.count({ where: { userId, problemSlug: slugVip } }),
        solved: await db.solvedProblem.count({ where: { userId, slug: slugVip } }),
      };
      expect(sau).toEqual(truoc);
    });

    // Những endpoint này **không** chạy Judge0 nên vẫn kiểm tra được "vip đi
    // qua" ở tầng HTTP. Riêng `submit` xem test ngay bên dưới.
    const KHONG_TOAO_JUDGE0 = ENDPOINTS_CHUA_KHOA.filter(
      (ep) => ep.label !== 'POST /api/problems/:slug/submit',
    );

    for (const ep of KHONG_TOAO_JUDGE0) {
      it(`${ep.label} — role vip thì không bị chính sách VIP chặn`, async () => {
        const res = await ep.call(await authCookie(userId, 'vip'), slugVip);
        expect(res.status, `${ep.label} trả ${res.status}`).not.toBe(403);
      });
    }

    it('bài thường qua được các endpoint trên với role user', async () => {
      const cookie = await authCookie(userId, 'user');
      for (const ep of KHONG_TOAO_JUDGE0) {
        const res = await ep.call(cookie, slugThuong);
        expect(res.status, `${ep.label} trả ${res.status}`).not.toBe(403);
      }
    });
  });

  describe('bài VIP: thứ tự chặn ở endpoint submit, không chạm Judge0', () => {
    /**
     * Bài **draft** có `hiddenTests: []` tạo ra ngay trong test.
     *
     * Vì sao phải tự tạo: gọi `submit` thật trên bài VIP đã seed sẽ chạy Judge0
     * và poll tới 90 giây — chậm, tốn hạn mức, và khiến test phụ thuộc dịch vụ
     * ngoài. `hiddenTests: []` cho đúng kết quả cần: sau khi qua được cổng VIP
     * thì service dừng ở `404 Bài toán chưa có test ẩn`, **trước** khi gọi
     * Judge0 — nhờ đó test vừa chứng minh người VIP đi qua, vừa chứng minh thứ
     * tự chặn chạy trước mọi việc đọc test ẩn.
     */
    const SLUG_VIP = 'e2e-vip-submit-probe';
    const SLUG_THUONG = 'e2e-normal-submit-probe';

    beforeAll(async () => {
      for (const [slug, isVip] of [
        [SLUG_VIP, true],
        [SLUG_THUONG, false],
      ] as const) {
        await db.problem.upsert({
          where: { slug },
          create: {
            slug,
            title: `probe ${slug}`,
            difficulty: 'Dễ',
            topic: 'array',
            status: 'draft',
            isVip,
            description: 'PROBE_NOI_DUNG_DE_BAI',
            tests: [],
            hiddenTests: [],
          },
          update: { isVip, hiddenTests: [], status: 'draft' },
        });
      }
    });

    afterAll(async () => {
      await db.problem.deleteMany({
        where: { slug: { in: [SLUG_VIP, SLUG_THUONG] } },
      });
    });

    function submit(slug: string, cookie: string) {
      return request(app.getHttpServer())
        .post(`/api/problems/${slug}/submit`)
        .set('Cookie', cookie)
        .send({ languageId: 71, sourceCode: 'print(1)' });
    }

    it('bài VIP: role user bị chặn trước khi đọc test ẩn (404 chưa kịp xảy ra)', async () => {
      const res = await submit(SLUG_VIP, await authCookie(1, 'user'));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('problem_vip_only');
    });

    it('bài VIP: role vip đi qua cổng VIP, dừng ở "chưa có test ẩn" chứ không gọi Judge0', async () => {
      const res = await submit(SLUG_VIP, await authCookie(1, 'vip'));
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('test ẩn');
    });

    it('bài thường: role user đi thẳng tới bước sau cổng VIP, không bị 403', async () => {
      const res = await submit(SLUG_THUONG, await authCookie(1, 'user'));
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('test ẩn');
    });
  });

  /**
   * Admin bật/tắt cờ VIP qua HTTP thật.
   *
   * Đây là bằng chứng cho **cả vòng đời cờ**: trước khi bật thì bài mở được, sau
   * khi bật thì mọi endpoint trong `ENDPOINTS_CHUA_KHOA` chặn đúng, và sau khi tắt
   * thì mở lại. Chỉ kiểm "endpoint trả 200" thì chưa đủ — cờ có thể chưa từng
   * được ghi, hoặc ghi sai cột, mà test vẫn xanh.
   *
   * Bài probe tự tạo và `isVip` luôn trả về `false` ở `afterAll`: các test phía
   * trên ghim "đúng 20 bài VIP khớp `VIP_SLUGS`", nên để sót một bài VIP ngoài danh
   * sách đó sẽ làm đỏ chúng ở lần chạy kế tiếp. Dùng slug riêng, không đụng vào
   * 20 bài thật.
   *
   * `beforeEach` chứ không `beforeAll`: test "bài vừa bật VIP..." dọn dòng probe của
   * nó ở `finally` (đúng để lần chạy sau không kế thừa bài VIP "mồ côi"), nên
   * `beforeAll` — vốn chạy **một** lần cho cả nhóm — đã xoá sạch bài probe trước khi
   * test cuối kịp chạy. Test sau đó gọi `PATCH .../vip` trên một slug không còn
   * trong DB và nhận 404. 404 đó là hành vi **đúng** của sản phẩm, nhưng ở chỗ này
   * nó che mất ý nghĩa của test. Xem `taoProbe` bên dưới.
   */
  describe('admin bật/tắt cờ VIP: cờ có hiệu lực thật, không chỉ trả 200', () => {
    const SLUG = 'e2e-admin-vip-toggle-probe';
    /**
     * Bài thường đi cùng nhóm, dùng cho test "đổi cờ bài này không đụng bài kia".
     * Tự tạo chứ không bòe ra một bài từ seed: bài lấy từ seed là dữ liệu của
     * `scripts/seed-problems.ts`, đổi seed là đổi cả ý nghĩa test, và lần chạy
     * sau test này sẽ để sót một bài `isVip` bằng true ngoài 20 slug VIP ghim ở
     * các test phía trên.
     */
    const SLUG_KHAC = 'e2e-admin-vip-toggle-probe-khac';
    const MO_TA = 'NOI_DUNG_BAI_PROBE_HAI_CHU_THAT_ABCDEFGHIJ';
    const MO_TA_KHAC = 'NOI_DUNG_BAI_PROBE_KHAC_HAI_CHU_THAT_ZYXWVUTSRQP';

    /** Token admin ký bằng đúng khoá mà `AdminGuard` dùng để verify. */
    function adminCookie(): string {
      const t = jwt.sign({ sub: 'admin', role: 'admin' }, process.env.ADMIN_JWT_PRIVATE_KEY!, {
        algorithm: 'RS256',
        expiresIn: '30m',
      });
      return `admin_token=${t}`;
    }

    function doiVip(isVip: boolean) {
      return request(app.getHttpServer())
        .patch(`/api/admin/problems/${SLUG}/vip`)
        .set('Cookie', adminCookie())
        .send({ isVip });
    }

    /**
     * Tạo (hoặc tạo lại) một bài probe ở trạng thái đã biết: `isVip: false` và
     * `hiddenTests: []` để không bao giờ chạm Judge0, `description` riêng để assert
     * "bài này còn mô tả" không lẫn với bài kia.
     *
     * `upsert` chứ không `create` vì phải chạy lại được sau mỗi lần test tự dọn.
     */
    function taoProbe(slug: string, description: string, status: 'draft' | 'published') {
      return db.problem.upsert({
        where: { slug },
        create: {
          slug,
          title: 'probe toggle VIP',
          difficulty: 'Dễ',
          topic: 'array',
          status,
          isVip: false,
          description,
          tests: [],
          hiddenTests: [],
        },
        update: { isVip: false, status, description, hiddenTests: [] },
      });
    }

    beforeEach(async () => {
      // Mỗi test bắt đầu từ cùng một trạng thái, không phụ thuộc test trước để
      // lại bỏ sót dữ liệu. `SLUG_KHAC` để `draft` ở đây và chỉ publish trong
      // test cần nó — bài thật của seed không bị đụng tới ở bất kỳ đâu.
      await taoProbe(SLUG, MO_TA, 'draft');
      await taoProbe(SLUG_KHAC, MO_TA_KHAC, 'draft');
    });

    afterAll(async () => {
      await db.problem.deleteMany({
        where: { slug: { in: [SLUG, SLUG_KHAC] } },
      });
    });

    it('thiếu token → 401, role không phải admin → 401', async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/problems/${SLUG}/vip`)
        .send({ isVip: true })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/admin/problems/${SLUG}/vip`)
        .set('Cookie', await authCookie(1, 'user'))
        .send({ isVip: true })
        .expect(401);
    });

    it('isVip là chuỗi → 400, và cờ trong DB không đổi', async () => {
      const truoc = (await db.problem.findUnique({ where: { slug: SLUG } }))!.isVip;
      // Chuỗi "false" là chuỗi truthy: nếu BE ép kiểu thì lệnh "gỡ cờ" lại bật cờ.
      for (const isVip of ['false', 'true', '0', '1']) {
        await doiVip(isVip as unknown as boolean).expect(400);
      }
      const sau = (await db.problem.findUnique({ where: { slug: SLUG } }))!.isVip;
      expect(sau).toBe(truoc);
    });

    it('slug không tồn tại → 404 chứ không phải 500', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/problems/khong-ton-tai-khong-bao-gio/vip')
        .set('Cookie', adminCookie())
        .send({ isVip: true });
      expect(res.status).toBe(404);
    });

    it('bật cờ → cột `isVip` đổi thật trong DB và response trả về cờ mới', async () => {
      const truoc = await db.problem.findUnique({ where: { slug: SLUG } });
      expect(truoc!.isVip).toBe(false);
      const res = await doiVip(true).expect(200);
      expect(res.body).toEqual({ slug: SLUG, isVip: true });
      const sau = await db.problem.findUnique({ where: { slug: SLUG } });
      expect(sau!.isVip).toBe(true);
    });

    it('tắt cờ → cột `isVip` trở lại false', async () => {
      const res = await doiVip(false).expect(200);
      expect(res.body).toEqual({ slug: SLUG, isVip: false });
      expect((await db.problem.findUnique({ where: { slug: SLUG } }))!.isVip).toBe(false);
    });

    /**
     * Vòng đời đầy đủ trên bài **đã publish**, vì `isVip` chỉ ảnh hưởng người đọc
     * khi bài đang nằm trong danh sách công khai — `beforeAll` để `draft` là vì
     * các test cơ chế chặn ở trên không cần nó hiện ra.
     */
    it('bài vừa bật VIP thì người thường mất mọi đường vào, tắt thì mở lại', async () => {
      await db.problem.update({ where: { slug: SLUG }, data: { status: 'published' } });
      try {
        // Trước khi khoá: mở được, và danh sách có mô tả.
        const mo = await request(app.getHttpServer()).get(`/api/problems/${SLUG}`).expect(200);
        expect(mo.body.description).toBe(MO_TA);
        const listMo = await request(app.getHttpServer()).get('/api/problems').expect(200);
        expect(
          JSON.stringify(listMo.body.find((p: { slug: string }) => p.slug === SLUG)),
        ).toContain(MO_TA);

        await doiVip(true).expect(200);

        // Sau khi khoá: **ngay lập tức**, không chờ hết TTL cache.
        const khoa = await request(app.getHttpServer()).get(`/api/problems/${SLUG}`).expect(403);
        expect(khoa.body.code).toBe('problem_vip_only');
        // Danh sách cắt còn allowlist — không còn mô tả.
        const listKhoa = await request(app.getHttpServer()).get('/api/problems').expect(200);
        const dong = listKhoa.body.find((p: { slug: string }) => p.slug === SLUG);
        expect(Object.keys(dong).sort()).toEqual(['difficulty', 'isVip', 'slug', 'title', 'topic']);
        expect(JSON.stringify(listKhoa.body)).not.toContain(MO_TA);

        // Các endpoint còn lại trong bảng khoá cũng phải chặn, dù bài này không
        // chạy Judge0 (nên dùng `hiddenTests: []` ở `beforeAll`).
        const cookie = await authCookie(1, 'user');
        const ck: Array<[string, () => request.Test]> = [
          ['POST /:slug/submit', () => request(app.getHttpServer()).post(`/api/problems/${SLUG}/submit`).set('Cookie', cookie).send({ languageId: 71, sourceCode: 'print(1)' })],
          ['POST /api/history', () => request(app.getHttpServer()).post('/api/history').set('Cookie', cookie).send({ problemSlug: SLUG, languageId: 71, sourceCode: 'print(1)' })],
          ['GET /api/history?slug=', () => request(app.getHttpServer()).get(`/api/history?slug=${SLUG}`).set('Cookie', cookie)],
          ['GET /api/history/me?slug=', () => request(app.getHttpServer()).get(`/api/history/me?slug=${SLUG}`).set('Cookie', cookie)],
          ['POST /api/progress/solve', () => request(app.getHttpServer()).post('/api/progress/solve').set('Cookie', cookie).send({ slug: SLUG, difficulty: 'Khó' })],
        ];
        for (const [label, call] of ck) {
          const res = await call();
          expect(res.status, `${label} trả ${res.status}`).toBe(403);
          expect(res.body.code, label).toBe('problem_vip_only');
          expect(JSON.stringify(res.body), label).not.toContain(MO_TA);
        }

        // Người có VIP vẫn đọc được: cờ của bài không liên quan hạ VIP của user.
        const vipDoc = await request(app.getHttpServer())
          .get(`/api/problems/${SLUG}`)
          .set('Cookie', await authCookie(1, 'vip'))
          .expect(200);
        expect(vipDoc.body.description).toBe(MO_TA);

        // Tắt cờ: mở lại ngay, không chờ hết TTL.
        await doiVip(false).expect(200);
        const lai = await request(app.getHttpServer()).get(`/api/problems/${SLUG}`).expect(200);
        expect(lai.body.description).toBe(MO_TA);
        const listLai = await request(app.getHttpServer()).get('/api/problems').expect(200);
        expect(
          JSON.stringify(listLai.body.find((p: { slug: string }) => p.slug === SLUG)),
        ).toContain(MO_TA);
      } finally {
        // Luôn trả DB về `isVip: false` kể cả khi assert ở giữa đường đỏ, để
        // lần chạy sau không kế thừa bài VIP "mồ côi".
        await doiVip(false).catch(() => undefined);
        await db.problem.deleteMany({ where: { slug: SLUG } });
      }
    });

    it('đổi cờ một bài không làm đổi khoá của bài khác', async () => {
      // Bài "bên kia" tự tạo và tự xoá, không mượn bài nào của seed: bài thật thì
      // cột `isVip` của nó nằm trong tầm tay các test ghim "đúng 20 bài VIP".
      await taoProbe(SLUG_KHAC, MO_TA_KHAC, 'published');
      await doiVip(true).expect(200);
      try {
        // Bài thường vẫn mở được, và vẫn có mô tả trong danh sách.
        const res = await request(app.getHttpServer())
          .get(`/api/problems/${SLUG_KHAC}`)
          .expect(200);
        expect(res.body.description).toBe(MO_TA_KHAC);
        const list = await request(app.getHttpServer()).get('/api/problems').expect(200);
        expect(
          JSON.stringify(list.body.find((p: { slug: string }) => p.slug === SLUG_KHAC)),
        ).toContain(MO_TA_KHAC);
      } finally {
        await doiVip(false).catch(() => undefined);
        await db.problem.deleteMany({ where: { slug: SLUG_KHAC } });
      }
    });
  });
});
