import { describe, expect, it, vi } from 'vitest';
import { RagController } from './rag.controller.ts';
import type { RagService } from './rag.service.ts';

describe('RagController', () => {
  it('chuyển body nguyên vẹn cho service', async () => {
    const ask = vi.fn().mockResolvedValue({ answer: 'ok' });
    const controller = new RagController({ ask } as unknown as RagService);

    await expect(controller.chat({ message: 'hỏi' })).resolves.toEqual({ answer: 'ok' });
    expect(ask).toHaveBeenCalledWith({ message: 'hỏi' });
  });
});
