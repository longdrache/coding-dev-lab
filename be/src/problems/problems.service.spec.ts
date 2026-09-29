import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ProblemsService } from './problems.service.ts';
import { PROBLEM_VIP_ONLY_CODE } from './vip-problem.policy.ts';

/** Dòng bài VIP đầy đủ nội dung — dùng để chứng minh payload không rò. */
const vipRow = {
  slug: 'trapping-rain-water',
  title: 'Hứng nước mưa',
  difficulty: 'Khó',
  topic: 'array',
  status: 'published',
  description: 'NOI_DUNG_DE_BAI_VIP',
  inputFormat: 'DONG_1_LA_CHUOI',
  outputFormat: 'IN_RA_SO',
  constraints: ['n <= 10^5'],
  examples: [{ input: '[[1,0]]', output: '1' }],
  tests: [{ stdin: '[[1,0]]', expected: '1' }],
  hiddenTests: [{ stdin: '[[2,1]]', expected: '1' }],
  starterCodes: { '71': 'STARTER_CODE_VIP' },
  isVip: true,
};
const normalRow = {
  slug: 'two-sum',
  title: 'Hai số có tổng bằng mục tiêu',
  difficulty: 'Dễ',
  topic: 'array',
  status: 'published',
  description: 'NOI_DUNG_DE_BAI_THUONG',
  inputFormat: '',
  outputFormat: '',
  constraints: [],
  examples: [],
  tests: [{ stdin: '1', expected: '2' }],
  hiddenTests: [{ stdin: '2', expected: '3' }],
  isVip: false,
};

function makeService(overrides?: {
  problem?: unknown;
  problems?: unknown[];
  submissions?: Record<string, unknown>[];
}) {
  const db = {
    problem: {
      findMany: vi.fn().mockResolvedValue(overrides?.problems ?? []),
      findUnique: vi.fn().mockResolvedValue(overrides?.problem ?? null),
    },
    submission: { create: vi.fn().mockResolvedValue({ id: 's1' }) },
    solvedProblem: { upsert: vi.fn().mockResolvedValue({}) },
    activityDay: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const judge0 = {
    createBatchSubmissions: vi.fn().mockResolvedValue([]),
    getBatchSubmissions: vi.fn(),
  };
  const svc = new ProblemsService(db as any, judge0 as any);
  return { svc, db, judge0 };
}

const done = (stdout: string, id = 3) => ({
  status: { id, description: 'ok' },
  stdout,
  time: '0.01',
  memory: 1000,
});
const pending = () => ({ status: { id: 1, description: 'queued' } });

describe('ProblemsService.findAll', () => {
  it('chỉ trả bài published và ẩn hiddenTests', async () => {
    const { svc } = makeService({
      problems: [
        { slug: 'a', status: 'published', hiddenTests: [{ stdin: 'x', expected: 'y' }] },
      ],
    });
    const rows = await svc.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('hiddenTests');
    expect(rows[0]).toHaveProperty('slug', 'a');
  });

  it('bài VIP trong danh sách chỉ còn slug/tiêu đề/độ khó/chủ đề/cờ khoá', async () => {
    const { svc } = makeService({ problems: [vipRow, normalRow] });
    const rows = await svc.findAll();
    const vip = rows.find((r) => r['slug'] === 'trapping-rain-water')!;
    expect(Object.keys(vip).sort()).toEqual([
      'difficulty',
      'isVip',
      'slug',
      'title',
      'topic',
    ]);
    expect(JSON.stringify(vip)).not.toContain('NOI_DUNG_DE_BAI_VIP');
    expect(JSON.stringify(vip)).not.toContain('STARTER_CODE_VIP');
  });

  it('bài VIP vẫn hiện tiêu đề trong danh sách — người không VIP phải thấy nó', async () => {
    const { svc } = makeService({ problems: [vipRow] });
    const rows = await svc.findAll();
    expect(rows[0]).toMatchObject({
      slug: 'trapping-rain-water',
      title: 'Hứng nước mưa',
      isVip: true,
    });
  });

  it('bài thường giữ nguyên nội dung như trước', async () => {
    const { svc } = makeService({ problems: [normalRow] });
    const rows = await svc.findAll();
    expect(rows[0]).toHaveProperty('description', 'NOI_DUNG_DE_BAI_THUONG');
    expect(rows[0]).not.toHaveProperty('hiddenTests');
  });

  it('cache của findAll cũng phải đã cắt — không có đường nào lấy lại được bản đầy', async () => {
    const { svc } = makeService({ problems: [vipRow] });
    await svc.findAll();
    const lanHai = await svc.findAll();
    expect(lanHai[0]).not.toHaveProperty('description');
    expect(lanHai[0]).toMatchObject({ isVip: true });
  });
});

describe('ProblemsService.findAll theo role — mô tả đầy đủ cho người có VIP', () => {
  it('vip/admin nhận mô tả đầy đủ của bài VIP, vẫn không bao giờ có hiddenTests', async () => {
    for (const role of ['vip', 'admin'] as const) {
      const { svc } = makeService({ problems: [vipRow, normalRow] });
      const rows = await svc.findAll(role);
      const vip = rows.find((r) => r['slug'] === 'trapping-rain-water')!;
      expect(vip).toHaveProperty('description', 'NOI_DUNG_DE_BAI_VIP');
      // Cùng hình dạng với `findBySlug`: mở được bài VIP thì đọc được đề, nhưng
      // danh sách không bao giờ mang test ẩn.
      expect(vip).not.toHaveProperty('hiddenTests');
      // Bài thường trong cùng danh sách không đổi so với trước.
      const thuong = rows.find((r) => r['slug'] === 'two-sum')!;
      expect(thuong).toHaveProperty('description', 'NOI_DUNG_DE_BAI_THUONG');
      expect(thuong).not.toHaveProperty('hiddenTests');
    }
  });

  it('khách/user: bài VIP cắt còn đúng 5 trường, tuyệt đối không có mô tả', async () => {
    for (const role of ['user', undefined] as const) {
      const { svc } = makeService({ problems: [vipRow, normalRow] });
      const rows = await svc.findAll(role);
      const vip = rows.find((r) => r['slug'] === 'trapping-rain-water')!;
      expect(Object.keys(vip).sort()).toEqual([
        'difficulty',
        'isVip',
        'slug',
        'title',
        'topic',
      ]);
      const chuoiVip = JSON.stringify(vip);
      expect(chuoiVip).not.toContain('NOI_DUNG_DE_BAI_VIP');
      expect(chuoiVip).not.toContain('STARTER_CODE_VIP');
      for (const field of ['description', 'examples', 'constraints', 'tests']) {
        expect(chuoiVip, `còn sót ${field}`).not.toContain(field);
      }
      // Bài thường thì vẫn có mô tả như cũ — không phải endpoint nào cũng bị cắt.
      expect(JSON.stringify(rows)).toContain('NOI_DUNG_DE_BAI_THUONG');
    }
  });

  /**
   * Cache `findAll` dùng chung cho mọi người trong tiến trình, nên thứ tự gọi
   * không được đổi được câu trả lời. Trước khi sửa, cache lưu kết quả đã cắt
   * nên gọi VIP trước là nguy cơ rò; nếu đổi sang lưu bản đầu thì ngược lại là
   * khách gọi trước làm VIP mất mô tả giữa chừng. Hai chiều đều phải đúng.
   */
  it('gọi VIP trước không làm khách sau lấy được bản đầy (và ngược lại)', async () => {
    const vipFirst = makeService({ problems: [vipRow, normalRow] });
    expect((await vipFirst.svc.findAll('vip'))[0]).toHaveProperty(
      'description',
      'NOI_DUNG_DE_BAI_VIP',
    );
    const sau = await vipFirst.svc.findAll();
    expect(JSON.stringify(sau)).not.toContain('NOI_DUNG_DE_BAI_VIP');
    expect(sau.find((r) => r['slug'] === 'trapping-rain-water')).toMatchObject({ isVip: true });

    const khachFirst = makeService({ problems: [vipRow, normalRow] });
    expect(JSON.stringify(await khachFirst.svc.findAll())).not.toContain('NOI_DUNG_DE_BAI_VIP');
    expect((await khachFirst.svc.findAll('vip'))[0]).toHaveProperty(
      'description',
      'NOI_DUNG_DE_BAI_VIP',
    );
  });

  it('findAll chỉ query DB một lần dù lần này VIP và lần sau khách', async () => {
    const { svc, db } = makeService({ problems: [vipRow, normalRow] });
    await svc.findAll('vip');
    await svc.findAll();
    await svc.findAll('admin');
    expect(db.problem.findMany).toHaveBeenCalledOnce();
  });
});

describe('ProblemsService.findBySlug chặn bài VIP', () => {
  it('bài VIP + role user/khách → 403 problem_vip_only, không rò nội dung', async () => {
    for (const role of ['user', undefined] as const) {
      const { svc } = makeService({ problem: vipRow });
      let err: unknown;
      try {
        await svc.findBySlug('trapping-rain-water', role);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: PROBLEM_VIP_ONLY_CODE,
      });
      expect(JSON.stringify((err as ForbiddenException).getResponse())).not.toContain(
        'NOI_DUNG_DE_BAI_VIP',
      );
    }
  });

  it('bài VIP + vip/admin → trả đầy đủ, ẩn hiddenTests như mọi bài', async () => {
    for (const role of ['vip', 'admin'] as const) {
      const { svc } = makeService({ problem: vipRow });
      const p = await svc.findBySlug('trapping-rain-water', role);
      expect(p).toMatchObject({ slug: 'trapping-rain-water', isVip: true });
      expect(p).toHaveProperty('description', 'NOI_DUNG_DE_BAI_VIP');
      expect(p).not.toHaveProperty('hiddenTests');
    }
  });

  it('bài thường + role nào cũng qua, kể cả khách', async () => {
    for (const role of ['user', 'vip', 'admin', undefined] as const) {
      const { svc } = makeService({ problem: normalRow });
      const p = await svc.findBySlug('two-sum', role);
      expect(p).toMatchObject({ slug: 'two-sum', isVip: false });
    }
  });
});

describe('ProblemsService.submit chặn bài VIP', () => {
  const hidden = [{ stdin: 'in0', expected: 'out0' }];

  it('bài VIP + role thường → 403 trước khi gọi Judge0', async () => {
    const { svc, judge0, db } = makeService({
      problem: { ...vipRow, hiddenTests: hidden },
    });
    await expect(
      svc.submit('trapping-rain-water', 1, 71, 'code', 'user'),
    ).rejects.toMatchObject({ response: { code: PROBLEM_VIP_ONLY_CODE } });
    expect(judge0.createBatchSubmissions).not.toHaveBeenCalled();
    expect(db.submission.create).not.toHaveBeenCalled();
    expect(db.solvedProblem.upsert).not.toHaveBeenCalled();
  });

  it('bài VIP + vip thì vẫn chấm được', async () => {
    const { svc, judge0 } = makeService({
      problem: { ...vipRow, hiddenTests: hidden },
    });
    judge0.createBatchSubmissions.mockResolvedValue([{ token: 't0' }]);
    judge0.getBatchSubmissions.mockResolvedValue({ submissions: [done('out0')] });
    const res = await svc.submit('trapping-rain-water', 1, 71, 'code', 'vip');
    expect(res.passed).toBe(true);
  });

  it('bài thường + role thường thì vẫn nộp được như cũ', async () => {
    const { svc, judge0 } = makeService({
      problem: { ...normalRow, hiddenTests: hidden },
    });
    judge0.createBatchSubmissions.mockResolvedValue([{ token: 't0' }]);
    judge0.getBatchSubmissions.mockResolvedValue({ submissions: [done('out0')] });
    const res = await svc.submit('two-sum', 1, 71, 'code', 'user');
    expect(res.passed).toBe(true);
  });
});

describe('ProblemsService.findBySlug', () => {
  it('trả null khi không tồn tại hoặc chưa publish', async () => {
    const { svc } = makeService({ problem: null });
    await expect(svc.findBySlug('nope')).resolves.toBeNull();
  });

  it('ẩn hiddenTests khi trả chi tiết', async () => {
    const { svc } = makeService({
      problem: { slug: 'a', status: 'published', hiddenTests: [{ stdin: 'x', expected: 'y' }] },
    });
    const p = await svc.findBySlug('a');
    expect(p).not.toHaveProperty('hiddenTests');
  });
});

describe('cache bài toán', () => {
  const published = { slug: 'a', status: 'published', hiddenTests: [{ stdin: 'x', expected: 'y' }] };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('findAll chỉ query DB một lần trong TTL', async () => {
    const { svc, db } = makeService({ problems: [published] });
    await svc.findAll();
    await svc.findAll();
    await svc.findAll();
    expect(db.problem.findMany).toHaveBeenCalledOnce();
  });

  it('findAll query lại khi hết TTL 60s', async () => {
    const { svc, db } = makeService({ problems: [published] });
    await svc.findAll();
    vi.advanceTimersByTime(59_999);
    await svc.findAll();
    expect(db.problem.findMany).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await svc.findAll();
    expect(db.problem.findMany).toHaveBeenCalledTimes(2);
  });

  it('findBySlug chỉ query DB một lần trong TTL', async () => {
    const { svc, db } = makeService({ problem: published });
    await svc.findBySlug('a');
    await svc.findBySlug('a');
    expect(db.problem.findUnique).toHaveBeenCalledOnce();
  });

  it('findBySlug query lại khi hết TTL 300s', async () => {
    const { svc, db } = makeService({ problem: published });
    await svc.findBySlug('a');
    vi.advanceTimersByTime(299_999);
    await svc.findBySlug('a');
    expect(db.problem.findUnique).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await svc.findBySlug('a');
    expect(db.problem.findUnique).toHaveBeenCalledTimes(2);
  });

  it('không cache null: bài draft vừa publish là thấy ngay', async () => {
    const { svc, db } = makeService({ problem: null });
    await expect(svc.findBySlug('a')).resolves.toBeNull();
    await expect(svc.findBySlug('a')).resolves.toBeNull();
    expect(db.problem.findUnique).toHaveBeenCalledTimes(2);
  });

  it('mỗi slug một entry riêng, không đụng nhau', async () => {
    const { svc, db } = makeService({ problem: published });
    await svc.findBySlug('a');
    await svc.findBySlug('b');
    expect(db.problem.findUnique).toHaveBeenCalledTimes(2);
  });

  it('dữ liệu lấy từ cache vẫn ẩn hiddenTests', async () => {
    const { svc } = makeService({ problem: published });
    const first = await svc.findBySlug('a');
    expect(first).not.toHaveProperty('hiddenTests');
    const second = await svc.findBySlug('a');
    expect(second).not.toHaveProperty('hiddenTests');
  });
});

describe('ProblemsService.submit', () => {
  const hiddenTests = [
    { stdin: 'in0', expected: 'out0' },
    { stdin: 'in1', expected: 'out1' },
    { stdin: 'in2', expected: 'out2' },
  ];

  it('báo lỗi khi thiếu bài / thiếu test ẩn / quá 10 test', async () => {
    const { svc } = makeService({ problem: null });
    await expect(svc.submit('x', 1, 71, 'code')).rejects.toThrow('Không tìm thấy');
    const svc2 = makeService({ problem: { slug: 'x', hiddenTests: [] } } as any);
    await expect(svc2.svc.submit('x', 1, 71, 'code')).rejects.toThrow('test ẩn');
    const svc3 = makeService({
      problem: { slug: 'x', hiddenTests: Array.from({ length: 11 }, () => ({ stdin: '', expected: '' })) },
    } as any);
    await expect(svc3.svc.submit('x', 1, 71, 'code')).rejects.toThrow('Quá nhiều');
  });

  it('fail-fast: dừng ngay khi test đầu rớt, không đợi test sau', async () => {
    const { svc, db, judge0 } = makeService({
      problem: { slug: 'x', difficulty: 'Dễ', hiddenTests },
    } as any);
    judge0.createBatchSubmissions.mockResolvedValue([{ token: 't0' }, { token: 't1' }, { token: 't2' }]);
    // poll 1: test0 đúng, test1 sai, test2 chưa xong
    judge0.getBatchSubmissions.mockResolvedValue({
      submissions: [done('out0'), done('WRONG'), pending()],
    });
    const res = await svc.submit('x', 1, 71, 'code');
    expect(res.failedIndex).toBe(2);
    expect(res.passedCount).toBe(1);
    expect(res.passed).toBe(false);
    expect(judge0.getBatchSubmissions).toHaveBeenCalledTimes(1);
    expect(db.submission.create).toHaveBeenCalledOnce();
    expect(db.solvedProblem.upsert).not.toHaveBeenCalled();
  });

  it('accepted khi đúng hết + đánh dấu solved', async () => {
    const { svc, db, judge0 } = makeService({
      problem: { slug: 'x', difficulty: 'Dễ', hiddenTests },
    } as any);
    judge0.createBatchSubmissions.mockResolvedValue([{ token: 't0' }, { token: 't1' }, { token: 't2' }]);
    // poll 1: chưa xong hết -> poll 2: xong hết đúng
    judge0.getBatchSubmissions
      .mockResolvedValueOnce({ submissions: [done('out0'), pending(), pending()] })
      .mockResolvedValueOnce({ submissions: [done('out0'), done('out1'), done('out2')] });
    const res = await svc.submit('x', 1, 71, 'code');
    expect(res.failedIndex).toBeNull();
    expect(res.passedCount).toBe(3);
    expect(res.passed).toBe(true);
    expect(judge0.getBatchSubmissions).toHaveBeenCalledTimes(2);
    expect(db.solvedProblem.upsert).toHaveBeenCalledOnce();
  });
});
