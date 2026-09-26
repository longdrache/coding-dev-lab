import { describe, expect, it, vi } from 'vitest';
import { ProblemsService } from './problems.service.ts';

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

describe('ProblemsService.submit', () => {
  const hiddenTests = [
    { stdin: 'in0', expected: 'out0' },
    { stdin: 'in1', expected: 'out1' },
    { stdin: 'in2', expected: 'out2' },
  ];

  it('báo lỗi khi thiếu bài / thiếu test ẩn / quá 10 test', async () => {
    const { svc } = makeService({ problem: null });
    await expect(svc.submit('x', 'u1', 71, 'code')).rejects.toThrow('Không tìm thấy');
    const svc2 = makeService({ problem: { slug: 'x', hiddenTests: [] } } as any);
    await expect(svc2.svc.submit('x', 'u1', 71, 'code')).rejects.toThrow('test ẩn');
    const svc3 = makeService({
      problem: { slug: 'x', hiddenTests: Array.from({ length: 11 }, () => ({ stdin: '', expected: '' })) },
    } as any);
    await expect(svc3.svc.submit('x', 'u1', 71, 'code')).rejects.toThrow('Quá nhiều');
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
    const res = await svc.submit('x', 'u1', 71, 'code');
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
    const res = await svc.submit('x', 'u1', 71, 'code');
    expect(res.failedIndex).toBeNull();
    expect(res.passedCount).toBe(3);
    expect(res.passed).toBe(true);
    expect(judge0.getBatchSubmissions).toHaveBeenCalledTimes(2);
    expect(db.solvedProblem.upsert).toHaveBeenCalledOnce();
  });
});
