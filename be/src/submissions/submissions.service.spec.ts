import { describe, expect, it, vi } from 'vitest';
import { SubmissionsService } from './submissions.service.ts';

function makeService(problemExists = true) {
  const db = {
    problem: { findUnique: vi.fn().mockResolvedValue(problemExists ? { slug: 'two-sum' } : null) },
    submission: { create: vi.fn().mockImplementation((args: unknown) => Promise.resolve(args)) },
  };
  return { svc: new SubmissionsService(db as any), db };
}

const base = {
  problemSlug: 'two-sum',
  languageId: 71,
  sourceCode: 'print(1)',
};

describe('SubmissionsService.create', () => {
  it('từ chối problemSlug rỗng / bài không tồn tại', async () => {
    const { svc } = makeService();
    await expect(svc.create('u1', { ...base, problemSlug: '  ' })).rejects.toThrow('problemSlug');
    const { svc: svc2 } = makeService(false);
    await expect(svc2.create('u1', base)).rejects.toThrow('không tồn tại');
  });

  it('từ chối languageId sai và sourceCode rỗng/quá dài', async () => {
    const { svc } = makeService();
    await expect(svc.create('u1', { ...base, languageId: NaN })).rejects.toThrow('languageId');
    await expect(svc.create('u1', { ...base, sourceCode: '' })).rejects.toThrow('sourceCode');
    await expect(
      svc.create('u1', { ...base, sourceCode: 'x'.repeat(64_001) }),
    ).rejects.toThrow('sourceCode');
  });

  it('chuẩn hóa field phụ và gắn clerkId', async () => {
    const { svc, db } = makeService();
    await svc.create('u1', {
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
    expect(data.clerkId).toBe('u1');
    expect(String(data.status)).toHaveLength(60);
    expect(data.statusId).toBeNull();
    expect(data.passed).toBeNull();
    expect(data.passedCount).toBe(2);
    expect(String(data.time)).toHaveLength(20);
  });
});
