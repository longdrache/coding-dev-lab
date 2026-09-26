import { describe, expect, it, vi } from 'vitest';
import { QnaService } from './qna.service.ts';

describe('QnaService', () => {
  it('create truyền đủ field + clerkId optional', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'q1' });
    const svc = new QnaService({ qnaQuestion: { create } } as any);
    await svc.create({ name: 'A', email: 'a@x.com', question: 'Q?' });
    expect(create).toHaveBeenCalledWith({
      data: { name: 'A', email: 'a@x.com', question: 'Q?', clerkId: undefined },
    });
  });

  it('findAll mới nhất trước, tối đa 100', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const svc = new QnaService({ qnaQuestion: { create: vi.fn(), findMany } } as any);
    await svc.findAll();
    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 100 });
  });
});
