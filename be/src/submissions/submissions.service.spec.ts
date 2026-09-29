import { describe, expect, it, vi } from 'vitest';
import { SubmissionsService } from './submissions.service.ts';
import { VipProblemService } from '../problems/vip-problem.service.ts';
import { PROBLEM_VIP_ONLY_CODE } from '../problems/vip-problem.policy.ts';

function makeService(problemExists = true) {
  const db = {
    problem: { findUnique: vi.fn().mockResolvedValue(problemExists ? { slug: 'two-sum' } : null) },
    submission: {
      create: vi.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const vip = new VipProblemService({
    problem: { findUnique: vi.fn().mockResolvedValue({ isVip: false }) },
  } as any);
  return { svc: new SubmissionsService(db as any, vip), db, vip };
}

/** Đổi cột `isVip` mà `VipProblemService` đọc, để mô phỏng bài VIP thật. */
function withVip(slug: string) {
  const db = {
    problem: { findUnique: vi.fn().mockResolvedValue({ slug }) },
    submission: { create: vi.fn().mockResolvedValue({ id: 's1' }), findMany: vi.fn().mockResolvedValue([]) },
  };
  const vip = new VipProblemService({
    problem: { findUnique: vi.fn().mockResolvedValue({ isVip: true }) },
  } as any);
  return { svc: new SubmissionsService(db as any, vip), db };
}

const base = {
  problemSlug: 'two-sum',
  languageId: 71,
  sourceCode: 'print(1)',
};

describe('SubmissionsService.create chặn bài VIP', () => {
  it('VIP + user thường → 403 problem_vip_only, không ghi Submission', async () => {
    const { svc, db } = withVip('trapping-rain-water');
    await expect(
      svc.create(1, { ...base, problemSlug: 'trapping-rain-water' }, 'user'),
    ).rejects.toMatchObject({ response: { code: PROBLEM_VIP_ONLY_CODE } });
    expect(db.submission.create).not.toHaveBeenCalled();
  });

  it('VIP + vip/admin thì ghi được', async () => {
    for (const role of ['vip', 'admin'] as const) {
      const { svc, db } = withVip('trapping-rain-water');
      await svc.create(1, { ...base, problemSlug: 'trapping-rain-water' }, role);
      expect(db.submission.create).toHaveBeenCalledOnce();
    }
  });

  it('bài thường + user thường thì không đổi hành vi cũ', async () => {
    const { svc, db } = makeService();
    await svc.create(1, base, 'user');
    expect(db.submission.create).toHaveBeenCalledOnce();
  });
});

describe('SubmissionsService.findByUser chặn bài VIP', () => {
  it('VIP + user thường → 403, không trả lịch sử của bài đó', async () => {
    const { svc, db } = withVip('trapping-rain-water');
    await expect(svc.findByUser(1, 'trapping-rain-water', 'user')).rejects.toMatchObject({
      response: { code: PROBLEM_VIP_ONLY_CODE },
    });
    expect(db.submission.findMany).not.toHaveBeenCalled();
  });

  it('VIP + vip thì trả lịch sử bình thường', async () => {
    const { svc } = withVip('trapping-rain-water');
    await expect(svc.findByUser(1, 'trapping-rain-water', 'vip')).resolves.toEqual([]);
  });

  it('không có slug (lịch sử chung) thì không hỏi cột isVip — role nào cũng qua', async () => {
    const { svc } = withVip('trapping-rain-water');
    await expect(svc.findByUser(1, undefined, 'user')).resolves.toEqual([]);
  });

  it('bài thường + slug → trả lịch sử như cũ', async () => {
    const { svc } = makeService();
    await expect(svc.findByUser(1, 'two-sum', 'user')).resolves.toEqual([]);
  });
});

describe('SubmissionsService.create', () => {
  it('từ chối problemSlug rỗng / bài không tồn tại', async () => {
    const { svc } = makeService();
    await expect(svc.create(1, { ...base, problemSlug: '  ' })).rejects.toThrow('problemSlug');
    const { svc: svc2 } = makeService(false);
    await expect(svc2.create(1, base)).rejects.toThrow('không tồn tại');
  });

  it('từ chối languageId sai và sourceCode rỗng/quá dài', async () => {
    const { svc } = makeService();
    await expect(svc.create(1, { ...base, languageId: NaN })).rejects.toThrow('languageId');
    await expect(svc.create(1, { ...base, sourceCode: '' })).rejects.toThrow('sourceCode');
    await expect(
      svc.create(1, { ...base, sourceCode: 'x'.repeat(64_001) }),
    ).rejects.toThrow('sourceCode');
  });

  it('chuẩn hóa field phụ và gắn userId', async () => {
    const { svc, db } = makeService();
    await svc.create(1, {
      ...base,
      status: 'Accepted' + 'x'.repeat(100),
      statusId: '3' as unknown as number,
      passed: 'yes' as unknown as boolean,
      passedCount: 2,
      totalCount: 3,
      time: '0.12345678901234567890123',
      memory: 1024,
    });
    const data = (db.submission.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.userId).toBe(1);
    expect(String(data.status)).toHaveLength(60);
    expect(data.statusId).toBeNull();
    expect(data.passed).toBeNull();
    expect(data.passedCount).toBe(2);
    expect(String(data.time)).toHaveLength(20);
  });
});
