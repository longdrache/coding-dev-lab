import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AdminController } from './admin.controller.ts';
import { AdminGuard } from './admin.guard.ts';
import { AdminService } from './admin.service.ts';
import { ViewsService } from '../views/views.service.ts';
import { DatabaseService } from '../database/database.service.ts';

/**
 * Bằng chứng ở tầng HTTP: route có thật, `AdminGuard` thật sự treo trên nó, và
 * `ValidationPipe` thật sự chặn `"false"`.
 *
 * Vì sao không dựng `AppModule`: `AppModule` cần Postgres, còn ở đây cần chứng
 * minh **hợp đồng của endpoint** — ai gọi được, ai không, body sai thì sao. Stub
 * `DatabaseService` là đủ và giữ test này chạy được không cần DB.
 */

/** `AdminGuard` chấp nhận `Authorization: Bearer` — không cần cookie-parser. */
function dbStub() {
  const rows = new Map([
    ['bai-01', { slug: 'bai-01', isVip: false, status: 'published', title: 'Bài 1' }],
  ]);
  return {
    rows,
    db: {
      problem: {
        findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => rows.get(where.slug) ?? null),
        update: vi.fn(async ({ where, data }: { where: { slug: string }; data: { isVip: boolean } }) => {
          const cur = rows.get(where.slug);
          if (!cur) throw Object.assign(new Error('P2025'), { code: 'P2025' });
          const next = { ...cur, ...data };
          rows.set(where.slug, next);
          return next;
        }),
      },
    },
  };
}

describe('PATCH /api/admin/problems/:slug/vip', () => {
  let app: INestApplication;
  let rows: Map<string, { slug: string; isVip: boolean }>;
  let db: any;
  let privateKey: string;

  beforeEach(async () => {
    // Khoá RSA sinh tại chỗ: test không phụ thuộc `.env` của máy (nếu dùng
    // `ADMIN_JWT_*` từ `.env` thì local xanh còn CI đỏ).
    const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.ADMIN_JWT_PRIVATE_KEY = privateKey;
    process.env.ADMIN_JWT_PUBLIC_KEY = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const fx = dbStub();
    rows = fx.rows as never;
    db = fx.db;
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminService,
        AdminGuard,
        // Token class đúng như wiring thật: `AdminService` nhận `DatabaseService`
        // qua `design:paramtypes`. Cung cấp token khác sẽ khiến Nest dựng
        // service thiếu dependency và test đỏ vì lý do không liên quan.
        { provide: DatabaseService, useValue: db },
        { provide: ViewsService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  function adminToken(payload: Record<string, unknown> = { sub: 'admin', role: 'admin' }) {
    return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '30m' });
  }

  function patch(slug: string, body: unknown, token?: string) {
    const req = request(app.getHttpServer()).patch(`/api/admin/problems/${slug}/vip`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body as object);
  }

  it('admin bật được: 200, cờ true, DB đã đổi', async () => {
    const res = await patch('bai-01', { isVip: true }, adminToken()).expect(200);
    expect(res.body).toEqual({ slug: 'bai-01', isVip: true });
    expect(rows.get('bai-01')!.isVip).toBe(true);
  });

  it('admin tắt được: 200, cờ false', async () => {
    rows.set('bai-01', { slug: 'bai-01', isVip: true, status: 'published' } as never);
    const res = await patch('bai-01', { isVip: false }, adminToken()).expect(200);
    expect(res.body).toEqual({ slug: 'bai-01', isVip: false });
    expect(rows.get('bai-01')!.isVip).toBe(false);
  });

  it('không token → 401', async () => {
    await patch('bai-01', { isVip: true }).expect(401);
  });

  it('token rác → 401', async () => {
    await patch('bai-01', { isVip: true }, 'khong-phai-jwt').expect(401);
  });

  it('token hợp lệ nhưng role không phải admin → 401, không đổi cờ', async () => {
    await patch('bai-01', { isVip: true }, adminToken({ sub: '1', role: 'user' })).expect(401);
    expect(rows.get('bai-01')!.isVip).toBe(false);
  });

  it('token hợp lệ nhưng role vip → 401 (VIP của user không phải quyền admin)', async () => {
    await patch('bai-01', { isVip: true }, adminToken({ sub: '1', role: 'vip' })).expect(401);
  });

  it('isVip là chuỗi "false" → 400, không đổi cờ', async () => {
    await patch('bai-01', { isVip: 'false' }, adminToken()).expect(400);
    expect(rows.get('bai-01')!.isVip).toBe(false);
  });

  it('thiếu isVip → 400', async () => {
    await patch('bai-01', {}, adminToken()).expect(400);
  });

  it('slug không tồn tại → 404', async () => {
    await patch('khong-ton-tai', { isVip: true }, adminToken()).expect(404);
  });

  it('trường lạ trong body → 400 (bề mặt quyền hẹp)', async () => {
    await patch('bai-01', { isVip: true, status: 'published' }, adminToken()).expect(400);
  });
});
