/**
 * Submissions pilot cho integration test: `ProblemsService.submit` (đường chấm
 * bài) + `SubmissionsService` (CRUD lịch sử) với Postgres thật.
 *
 * Ranh giới mock duy nhất là `fetch` tới Judge0 (dịch vụ ngoài, không dựng
 * được trong test): stub ở biên HTTP, trả đúng hình Judge0 thật (mảng token /
 * `{ submissions }`, stdout base64). Mọi thứ khác thật: tìm bài, check VIP,
 * poll, chấm đúng/sai, ghi `Submission`/`SolvedProblem`.
 *
 * Vì sao mock ở `fetch` chứ không mock `Judge0Service`: stub cả service là bỏ
 * qua luôn lớp dịch lỗi mạng/401/404/5xx của nó — mà chính lớp đó từng là
 * nguyên nhân test e2e đỏ (Judge0 chết → 502, không phải 201).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service.ts';
import { Judge0Service } from '../src/judge0/judge0.service.ts';
import { ProblemsService } from '../src/problems/problems.service.ts';
import { VipProblemService } from '../src/problems/vip-problem.service.ts';
import { SubmissionsService } from '../src/submissions/submissions.service.ts';
import {
  requireTestDatabaseUrl,
  resetAuthTables,
  uniqueEmail,
} from './db-integration.ts';

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');
const verdict = (token: string, stdout: string, statusId = 3) => ({
  token,
  status: { id: statusId, description: statusId === 3 ? 'Accepted' : 'Wrong Answer' },
  stdout: b64(stdout),
  stderr: null,
  compile_output: null,
  message: null,
  time: '0.01',
  memory: 1000,
});

describe('Submit + Submissions (integration, DB thật, Judge0 stub ở fetch)', () => {
  let db: DatabaseService;
  let problems: ProblemsService;
  let subs: SubmissionsService;
  const fetchMock = vi.fn();

  /** Judge0 giả ở biên HTTP: POST batch → token, GET batch → verdicts cho sẵn. */
  function mockJudge0(verdicts: ReturnType<typeof verdict>[]) {
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.includes('/submissions/batch')) {
        const body = JSON.parse(String((init as { body?: unknown }).body)) as {
          submissions: unknown[];
        };
        return {
          ok: true,
          status: 201,
          json: async () => body.submissions.map((_, i) => ({ token: `t${i}` })),
        };
      }
      if (u.includes('/submissions/batch')) {
        return { ok: true, status: 200, json: async () => ({ submissions: verdicts }) };
      }
      throw new Error(`URL Judge0 không ngờ tới trong test: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  beforeAll(async () => {
    requireTestDatabaseUrl();
    db = new DatabaseService();
    try {
      await db.$connect();
    } catch (e) {
      throw new Error(
        `Không nối được DB test — chạy \`prisma migrate deploy\` vào DB đó trước. ` +
          `Gốc: ${e instanceof Error ? e.message : e}`,
      );
    }
    const vip = new VipProblemService(db);
    problems = new ProblemsService(db, new Judge0Service());
    subs = new SubmissionsService(db, vip);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  let n = 0;
  /** Bài thi slug duy nhất — dọn theo prefix nên không đụng seed data. */
  async function seedProblem(opts: { isVip?: boolean; hiddenTests?: unknown[] } = {}) {
    n += 1;
    const slug = `itest-bai-${Date.now()}-${n}`;
    return db.problem.create({
      data: {
        slug,
        title: `Bài test ${n}`,
        difficulty: 'easy',
        topic: 'arrays',
        description: 'đề test',
        tests: [],
        hiddenTests: opts.hiddenTests ?? [
          { stdin: '', expected: '42' },
          { stdin: '', expected: '7' },
        ],
        isVip: opts.isVip ?? false,
      },
    });
  }

  async function seedUser() {
    return db.user.create({ data: { email: uniqueEmail('itest-sub') } });
  }

  beforeEach(async () => {
    await db.submission.deleteMany({ where: { problemSlug: { startsWith: 'itest-' } } });
    await db.solvedProblem.deleteMany({ where: { slug: { startsWith: 'itest-' } } });
    await db.problem.deleteMany({ where: { slug: { startsWith: 'itest-' } } });
    await resetAuthTables(db);
  });

  it('Accepted: stdout khớp hết → ghi Submission + đánh dấu solved', async () => {
    const p = await seedProblem();
    const u = await seedUser();
    mockJudge0([verdict('t0', '42\n'), verdict('t1', '7\n')]);
    const r = await problems.submit(p.slug, u.id, 71, 'print(1)', 'user');
    expect(r).toMatchObject({ passed: true, passedCount: 2, totalCount: 2, status: 'Accepted' });
    const row = await db.submission.findFirst({ where: { userId: u.id, problemSlug: p.slug } });
    expect(row).toMatchObject({ status: 'Accepted', statusId: 3, passedCount: 2, totalCount: 2 });
    expect(
      await db.solvedProblem.findUnique({ where: { userId_slug: { userId: u.id, slug: p.slug } } }),
    ).not.toBeNull();
  });

  it('sai test 2 → Wrong Answer, failedIndex 2, không solved', async () => {
    const p = await seedProblem();
    const u = await seedUser();
    mockJudge0([verdict('t0', '42\n'), verdict('t1', 'sai\n')]);
    const r = await problems.submit(p.slug, u.id, 71, 'print(1)', 'user');
    expect(r).toMatchObject({ passed: false, passedCount: 1, failedIndex: 2, status: 'Wrong Answer' });
    const row = await db.submission.findFirst({ where: { userId: u.id, problemSlug: p.slug } });
    expect(row?.status).toBe('Wrong Answer');
    expect(
      await db.solvedProblem.findUnique({ where: { userId_slug: { userId: u.id, slug: p.slug } } }),
    ).toBeNull();
  });

  it('sai ngay test 1 thì fail-fast ở failedIndex 1', async () => {
    const p = await seedProblem();
    const u = await seedUser();
    mockJudge0([verdict('t0', 'sai\n'), verdict('t1', '7\n')]);
    const r = await problems.submit(p.slug, u.id, 71, 'print(1)', 'user');
    expect(r.failedIndex).toBe(1);
    expect(r.passedCount).toBe(0);
  });

  it('bài VIP + role thường bị chặn TRƯỚC khi gọi Judge0', async () => {
    const p = await seedProblem({ isVip: true });
    const u = await seedUser();
    mockJudge0([verdict('t0', '42\n'), verdict('t1', '7\n')]);
    await expect(problems.submit(p.slug, u.id, 71, 'print(1)', 'user')).rejects.toMatchObject({
      status: 403,
    });
    // Chặn muộn là đã tiêu tài nguyên máy chấm — nên không được có call nào.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await db.submission.count({ where: { userId: u.id } })).toBe(0);
  });

  it('bài không có test ẩn / quá 10 test → 404, không gọi Judge0', async () => {
    const rong = await seedProblem({ hiddenTests: [] });
    const nhieu = await seedProblem({
      hiddenTests: Array.from({ length: 11 }, (_, i) => ({ stdin: '', expected: String(i) })),
    });
    const u = await seedUser();
    mockJudge0([]);
    await expect(problems.submit(rong.slug, u.id, 71, 'x', 'user')).rejects.toMatchObject({
      status: 404,
    });
    await expect(problems.submit(nhieu.slug, u.id, 71, 'x', 'user')).rejects.toMatchObject({
      status: 404,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Judge0 chết (rớt mạng) → BadGateway 502, không ghi Submission nửa vời', async () => {
    const p = await seedProblem();
    const u = await seedUser();
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);
    // Đây chính là lỗi từng làm Playwright CI đỏ ở test nộp bài: submit không
    // bao giờ trả 201 khi Judge0 không reachable — ghim lại ở tầng BE.
    await expect(problems.submit(p.slug, u.id, 71, 'print(1)', 'user')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(await db.submission.count({ where: { userId: u.id } })).toBe(0);
  });

  it('SubmissionsService.create ghi đủ field, ép kiểu rác thành null', async () => {
    const p = await seedProblem();
    const u = await seedUser();
    const row = await subs.create(
      u.id,
      {
        problemSlug: p.slug,
        languageId: 71,
        sourceCode: 'print(1)',
        status: 'Accepted',
        statusId: 3,
        passed: true,
        passedCount: '2' as unknown as number,
        totalCount: 2,
      },
      'user',
    );
    expect(row).toMatchObject({ problemSlug: p.slug, status: 'Accepted', passedCount: null });
  });

  it('create chặn VIP với role thường, cho qua với vip', async () => {
    const p = await seedProblem({ isVip: true });
    const u = await seedUser();
    await expect(
      subs.create(u.id, { problemSlug: p.slug, languageId: 71, sourceCode: 'x' }, 'user'),
    ).rejects.toMatchObject({ status: 403 });
    const ok = await subs.create(
      u.id,
      { problemSlug: p.slug, languageId: 71, sourceCode: 'x' },
      'vip',
    );
    expect(ok.problemSlug).toBe(p.slug);
  });

  it('create validate: thiếu slug / languageId rác / source quá dài / bài không tồn tại', async () => {
    const u = await seedUser();
    const base = { problemSlug: 'itest-khong-ton-tai', languageId: 71, sourceCode: 'x' };
    await expect(subs.create(u.id, { ...base, problemSlug: '  ' }, 'user')).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      subs.create(u.id, { ...base, languageId: Number.NaN }, 'user'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      subs.create(u.id, { ...base, sourceCode: 'x'.repeat(64_001) }, 'user'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(subs.create(u.id, base, 'user')).rejects.toMatchObject({ status: 400 });
  });

  it('findByUser trả mới-nhất-trước tối đa 50; hỏi bài VIP thì 403 chứ không []', async () => {
    const p = await seedProblem();
    const vip = await seedProblem({ isVip: true });
    const u = await seedUser();
    await subs.create(u.id, { problemSlug: p.slug, languageId: 71, sourceCode: 'a' }, 'user');
    await subs.create(u.id, { problemSlug: p.slug, languageId: 71, sourceCode: 'b' }, 'user');
    const all = await subs.findByUser(u.id);
    expect(all).toHaveLength(2);
    expect(all[0].sourceCode).toBe('b');
    // Kẻ dò bài VIP so 403 với 200 để biết bài nào đã có người nộp — nên slug
    // VIP với role thường phải 403, không được trả [].
    await expect(subs.findByUser(u.id, vip.slug, 'user')).rejects.toMatchObject({ status: 403 });
    // Lịch sử chung (không slug) không hỏi VIP — đó là dữ liệu của chính caller.
    expect((await subs.findByUser(u.id)).length).toBe(2);
  });
});
