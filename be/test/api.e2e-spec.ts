import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from './../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateKeyPair, SignJWT } from 'jose';
import { AppModule } from './../src/app.module.ts';
import { signAccessToken } from './../src/auth/tokens.ts';
import type { UserRole } from './../src/auth/auth.types.ts';

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
 * Kiểm kê mọi route đã đăng nhập sau khi `ClerkAuthGuard` bị thay bằng
 * `AuthGuard`. Mục tiêu là hành vi bảo mật, không phải "code chạy được": mỗi
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
  { method: 'post', path: '/api/premium/sweep-expired-admin' },
];

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;

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
    // dọn dữ liệu test
    await db.qnaQuestion.deleteMany({ where: { email: 'e2e@test.local' } });
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

  // ===== Guard phiên đăng nhập: `ClerkAuthGuard` → `AuthGuard =====

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

    it('GET /api/qna 200 với cookie hợp lệ (trước đó là route chỉ Clerk)', async () => {
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
});
