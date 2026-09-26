import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from './../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from './../src/app.module.ts';

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
  });

  it('GET /api/problems/:slug 404 khi không tồn tại', async () => {
    await request(app.getHttpServer()).get('/api/problems/no-such-slug').expect(404);
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
});
