import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { ProblemsService } from '../problems/problems.service.ts';
import { VipProblemService } from '../problems/vip-problem.service.ts';
import { SubmissionsService } from '../submissions/submissions.service.ts';
import { ProgressService } from '../progress/progress.service.ts';
import { PROBLEM_VIP_ONLY_CODE } from '../problems/vip-problem.policy.ts';

/**
 * Cờ VIP là **cột của bài**, và bài là thứ mọi endpoint đều chạm tới. Vì vậy test
 * ở đây không dựng app Nest, mà dựng đúng các service thật dùng chung **một**
 * database giả, rồi hỏi: trước và sau khi admin đổi cờ, mỗi đường đi còn giữ
 * đúng không.
 *
 * Dùng service thật (không stub policy) là điều kiện để test này có tác dụng:
 * stub sẵn `isVipProblemLocked` thì chuyện cần chứng minh — bài vừa khoá thì có
 * thật sự bị chặn ở từng nơi không — biến thành kiểm tra bản thân của test.
 */
type Row = Record<string, unknown> & { slug: string; isVip: boolean };

/**
 * Database giả đủ dùng cho các service trong test này. Bảng `Problem` là một
 * `Map` nên **chính là** nơi `AdminService` ghi cờ — toggle của admin và các
 * policy đọc cờ dùng chung một nguồn sự thật, y như production.
 *
 * `select` bị bỏ qua: các service chỉ dùng nó để lấy *ít hơn* cột, trả thêm
 * không làm sai hành vi nào. `findUnique` trả về bản sao để không ai vô tình sửa
 * được "dòng trong DB" mà không đi qua `update`.
 */
function fakeDb(rows: Row[]) {
  const bang = new Map(rows.map((r) => [r.slug, { ...r }]));
  return {
    bang,
    db: {
      problem: {
        findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
          const hit = bang.get(where.slug);
          return hit ? { ...hit } : null;
        }),
        update: vi.fn(async ({ where, data }: { where: { slug: string }; data: { isVip: boolean } }) => {
          const cur = bang.get(where.slug);
          if (!cur) throw Object.assign(new Error('P2025'), { code: 'P2025' });
          const next = { ...cur, ...data };
          bang.set(where.slug, next);
          return { ...next };
        }),
        findMany: vi.fn(async () => [...bang.values()].map((r) => ({ ...r }))),
      },
      submission: { findMany: vi.fn(async () => []), create: vi.fn(async () => ({ id: 1 })) },
      solvedProblem: { upsert: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
      activityDay: { findMany: vi.fn(async () => []) },
      // `ProgressService.recordSolved` gọi `getDashboard` sau khi ghi; ở nhánh
      // "vip/admin đi qua" test cần nó chạy hết để chứng minh không chặn.
      userBadge: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({})) },
    },
  };
}

/** Bài thường, đã publish, mô tả dài đủ để nhận ra là có lất nội dung hay không. */
const BAI_THUONG: Row = {
  slug: 'bai-01',
  title: 'Bài 1',
  difficulty: 'Dễ',
  topic: 'array',
  status: 'published',
  isVip: false,
  description: 'NOI_DUNG_DAY_DU_HAI_CHU_THAT',
  examples: [{ input: '1', output: '1' }],
  tests: [],
  hiddenTests: [],
};

describe('AdminService.setProblemVip', () => {
  it('bật được cờ VIP, ghi đúng boolean xuống DB và trả cờ mới', async () => {
    const { bang, db } = fakeDb([BAI_THUONG]);
    const svc = new AdminService(db as any);
    const res = await svc.setProblemVip('bai-01', true);
    expect(res).toEqual({ slug: 'bai-01', isVip: true });
    expect(bang.get('bai-01')!.isVip).toBe(true);
    // `update` chỉ được chạm đúng cột cờ — sửa cờ không được đụng nội dung bài.
    expect(db.problem.update.mock.calls[0][0].data).toEqual({ isVip: true });
  });

  it('tắt được cờ VIP trở lại false', async () => {
    const { bang, db } = fakeDb([{ ...BAI_THUONG, isVip: true }]);
    const svc = new AdminService(db as any);
    const res = await svc.setProblemVip('bai-01', false);
    expect(res).toEqual({ slug: 'bai-01', isVip: false });
    expect(bang.get('bai-01')!.isVip).toBe(false);
  });

  it('slug không tồn tại → 404, không phải lỗi Prisma P2025 (500)', async () => {
    const { db } = fakeDb([BAI_THUONG]);
    const svc = new AdminService(db as any);
    await expect(svc.setProblemVip('khong-ton-tai', true)).rejects.toMatchObject({
      status: 404,
    });
    // Không có lần `update` nào chạy: 404 phải dừng trước khi ghi.
    expect(db.problem.update).not.toHaveBeenCalled();
  });

  it('từ chối mọi giá trị không phải boolean, kể cả chuỗi "false"', async () => {
    const { db } = fakeDb([BAI_THUONG]);
    const svc = new AdminService(db as any);
    // `"false"` là chuỗi truthy: nếu lọt tới `update` thì lệnh "gỡ cờ VIP" của
    // admin lại bật cờ VIP. Đây là lý do không dùng `@Transform(() => Boolean)`.
    for (const sai of ['false', 'true', '0', '1', '', 'no', 0, 1, null, undefined, {}, []]) {
      await expect(svc.setProblemVip('bai-01', sai), String(sai)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(db.problem.update).not.toHaveBeenCalled();
  });

  it('thiếu `isVip` cũng bị từ chối — không hiểu là "đặt mặc định"', async () => {
    const { db } = fakeDb([BAI_THUONG]);
    const svc = new AdminService(db as any);
    await expect(svc.setProblemVip('bai-01', undefined)).rejects.toMatchObject({ status: 400 });
    expect(db.problem.update).not.toHaveBeenCalled();
  });

  it('xoá cache bài sau khi đổi cờ, với slug đúng', async () => {
    const { db } = fakeDb([BAI_THUONG]);
    const problems = { invalidateProblemCache: vi.fn() };
    const svc = new AdminService(db as any, undefined, problems as any);
    await svc.setProblemVip('bai-01', true);
    expect(problems.invalidateProblemCache).toHaveBeenCalledWith('bai-01');
  });

  it('ghi log hành động admin (nói rõ hướng đổi), không lộ nội dung bài', async () => {
    const { db } = fakeDb([BAI_THUONG]);
    // `logger` là field riêng của từng instance nên phải chặn ở prototype của
    // `Logger` — không chặn được ở `AdminService.prototype`.
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const svc = new AdminService(db as any);
    await svc.setProblemVip('bai-01', true);
    await svc.setProblemVip('bai-01', false);
    const noiDung = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(noiDung).toContain('bai-01');
    expect(noiDung).toContain('false -> true');
    expect(noiDung).toContain('true -> false');
    // Mô tả bài không được nằm trong log.
    expect(noiDung).not.toContain('NOI_DUNG_DAY_DU');
    log.mockRestore();
  });
});

/**
 * Phần quan trọng nhất: **khoá có hiệu lực ngay** trên mọi đường đi, và ngay cả khi
 * `ProblemsService` đã cache sẵn bản đầy đủ của bài trước lúc admin bật cờ.
 */
describe('bật cờ VIP: mọi khoá hiện có vẫn đúng, và đúng ngay lập tức', () => {
  /** Dựng 5 service thật trên cùng một database giả. */
  function dung() {
    const { bang, db } = fakeDb([BAI_THUONG]);
    const vip = new VipProblemService(db as any);
    const problems = new ProblemsService(db as any, {} as any);
    const subs = new SubmissionsService(db as any, vip);
    const progress = new ProgressService(db as any, vip);
    const admin = new AdminService(db as any, undefined, problems);
    return { bang, db, vip, problems, subs, progress, admin };
  }

  /**
   * Sáu đường chạm tới bài, đúng theo bảng `ENDPOINTS_CHUA_KHOA` ở
   * `test/api.e2e-spec.ts`. Ở tầng service chỉ còn bốn vì `submit` và `solve` đi
   * qua cùng một `assertSlugAllowed`; `GET /:slug` và danh sách là hai chỗ khác.
   */
  it('đọc được bài thường, rồi bật cờ thì bị chặn ở mọi nơi — kể cả bản đã cache', async () => {
    const { problems, subs, progress, admin, bang } = dung();

    // 1. Trước khi khoá: mở được, và có mô tả thật.
    const doc = await problems.findBySlug('bai-01', 'user');
    expect(doc).toBeTruthy();
    expect(doc!['description']).toBe('NOI_DUNG_DAY_DU_HAI_CHU_THAT');
    const danhSach = await problems.findAll('user');
    expect(danhSach[0]).toMatchObject({
      slug: 'bai-01',
      title: 'Bài 1',
      isVip: false,
    });

    // 2. Admin bật cờ.
    await admin.setProblemVip('bai-01', true);
    expect(bang.get('bai-01')!.isVip).toBe(true);

    // 3. Chi tiết: chặn ngay, **không** cần chờ hết TTL của cache.
    await expect(problems.findBySlug('bai-01', 'user')).rejects.toMatchObject({
      response: { code: PROBLEM_VIP_ONLY_CODE },
    });

    // 4. Danh sách: cắt còn allowlist, không còn mô tả.
    const sau = await problems.findAll('user');
    expect(Object.keys(sau[0]!).sort()).toEqual(['difficulty', 'isVip', 'slug', 'title', 'topic']);
    expect(JSON.stringify(sau)).not.toContain('NOI_DUNG_DAY_DU');
    // ...và role vip vẫn nhận mô tả đầy đủ: cờ bài không liên quan hạ VIP của user.
    expect((await problems.findAll('vip'))[0]).toMatchObject({
      slug: 'bai-01',
      title: 'Bài 1',
      isVip: true,
    });

    // 5. `POST /api/history` (ghi lịch sử) và `GET /api/history?slug=` (đọc).
    await expect(
      subs.create(1, { problemSlug: 'bai-01', languageId: 71, sourceCode: 'print(1)' }, 'user'),
    ).rejects.toMatchObject({ response: { code: PROBLEM_VIP_ONLY_CODE } });
    await expect(subs.findByUser(1, 'bai-01', 'user')).rejects.toMatchObject({
      response: { code: PROBLEM_VIP_ONLY_CODE },
    });

    // 6. `POST /api/progress/solve`.
    await expect(progress.recordSolved(1, 'bai-01', 'Dễ', 'user')).rejects.toMatchObject({
      response: { code: PROBLEM_VIP_ONLY_CODE },
    });

    // Lịch sử chung (không có `slug`) là dữ liệu riêng của người gọi nên vẫn qua.
    await expect(subs.findByUser(1, undefined, 'user')).resolves.toEqual([]);
  });

  it('tắt cờ thì bài thường mở lại, và cache cũng được làm mới', async () => {
    const { problems, admin } = dung();
    await admin.setProblemVip('bai-01', true);
    await expect(problems.findBySlug('bai-01', 'user')).rejects.toBeTruthy();
    await admin.setProblemVip('bai-01', false);
    // Không có `invalidateProblemCache` thì dòng này đỏ: cache còn giữ
    // `isVip: true` và người thường bị chặn nhầm một bài đã mở khoá.
    const doc = await problems.findBySlug('bai-01', 'user');
    expect(doc!['description']).toBe('NOI_DUNG_DAY_DU_HAI_CHU_THAT');
    expect((await problems.findAll('user'))[0]).toMatchObject({
      slug: 'bai-01',
      title: 'Bài 1',
      isVip: false,
    });
  });

  it('người có VIP và admin vẫn mở được sau khi bật cờ', async () => {
    const { problems, subs, progress, admin } = dung();
    await admin.setProblemVip('bai-01', true);
    for (const role of ['vip', 'admin'] as const) {
      const doc = await problems.findBySlug('bai-01', role);
      expect(doc!['description']).toBe('NOI_DUNG_DAY_DU_HAI_CHU_THAT');
      expect((await problems.findAll(role))[0]).toMatchObject({
        slug: 'bai-01',
        title: 'Bài 1',
        isVip: true,
      });
      await expect(subs.findByUser(1, 'bai-01', role)).resolves.toEqual([]);
      await expect(
        subs.create(1, { problemSlug: 'bai-01', languageId: 71, sourceCode: 'x' }, role),
      ).resolves.toBeTruthy();
      await expect(progress.recordSolved(1, 'bai-01', 'Dễ', role)).resolves.toBeTruthy();
    }
  });

  it('bài khác không bị cờ của bài này ảnh hưởng', async () => {
    const { problems, admin } = dung();
    await problems.findBySlug('bai-01', 'user'); // nạp cache trước
    await admin.setProblemVip('khong-ton-tai', true).catch(() => undefined);
    const doc = await problems.findBySlug('bai-01', 'user');
    expect(doc!['description']).toBe('NOI_DUNG_DAY_DU_HAI_CHU_THAT');
    expect((await problems.findAll('user'))[0]).toMatchObject({
      slug: 'bai-01',
      title: 'Bài 1',
      isVip: false,
    });
  });
});

describe('AdminService.setProblemVip: không phụ thuộc .env của máy', () => {
  beforeEach(() => {
    // Set lại trong `beforeEach` (không phải module scope) đúng bài học từ f4d04c4:
    // `afterEach` của vitest khôi phục về `OLD_ENV`, mà ở CI `OLD_ENV` rỗng — biến
    // set ở module scope sẽ mất trước khi test sau chạy.
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL;
  });

  it('chạy được khi máy không có GOOGLE/FRONTEND_URL, service không đụng tới', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.FRONTEND_URL;
    const { db } = fakeDb([BAI_THUONG]);
    await expect(new AdminService(db as any).setProblemVip('bai-01', true)).resolves.toEqual({
      slug: 'bai-01',
      isVip: true,
    });
  });
});
