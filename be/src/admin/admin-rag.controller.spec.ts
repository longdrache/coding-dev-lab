import { describe, expect, it, vi } from 'vitest';
import { AdminRagController, MAX_INGEST_BYTES } from './admin-rag.controller.ts';
import type { RagBotClient } from '../rag/rag.bot-client.ts';

function fakeBot() {
  const post = vi.fn().mockResolvedValue({ status: 200, ok: true as const, text: '' });
  return { post } as unknown as RagBotClient & { post: typeof post };
}

describe('AdminRagController', () => {
  it('forward source/text và trả ok', async () => {
    const bot = fakeBot();
    const ctrl = new AdminRagController(bot);

    await expect(ctrl.ingest({ source: '  tai-lieu ', text: 'nội dung' })).resolves.toEqual({ ok: true });
    expect(bot.post).toHaveBeenCalledWith('/ingest', { source: 'tai-lieu', text: 'nội dung' }, 60_000);
  });

  it('từ chối source rỗng hoặc quá dài', async () => {
    const ctrl = new AdminRagController(fakeBot());
    await expect(ctrl.ingest({ source: '  ', text: 'x' })).rejects.toThrow(/source/i);
    await expect(ctrl.ingest({ source: 'a'.repeat(121), text: 'x' })).rejects.toThrow(/120/);
  });

  it('từ chối tài liệu rỗng hoặc quá 5MB', async () => {
    const ctrl = new AdminRagController(fakeBot());
    await expect(ctrl.ingest({ source: 's', text: '   ' })).rejects.toThrow(/rỗng/i);
    await expect(
      ctrl.ingest({ source: 's', text: 'a'.repeat(MAX_INGEST_BYTES + 1) }),
    ).rejects.toThrow(/5MB/);
  });
});
