import { afterEach, describe, expect, it, vi } from 'vitest';
import { RagBotClient } from './rag.bot-client.ts';

describe('RagBotClient', () => {
  const client = new RagBotClient();
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  function stubFetch(response: { ok: boolean; status: number; text: string }) {
    fetchMock.mockResolvedValue({
      ok: response.ok,
      status: response.status,
      text: () => Promise.resolve(response.text),
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('gửi JSON + Bearer tới BOT_URL và trả text', async () => {
    vi.stubEnv('BOT_URL', 'http://bot.local/');
    vi.stubEnv('ADMIN_KEY', 'secret');
    stubFetch({ ok: true, status: 200, text: '{"answer":"ok"}' });

    const res = await client.post('/chat', { message: 'hi' }, 1000);

    expect(res).toEqual({ status: 200, ok: true, text: '{"answer":"ok"}' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://bot.local/chat');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(JSON.parse(String(init.body))).toEqual({ message: 'hi' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('thiếu cấu hình thì báo 503', async () => {
    vi.stubEnv('BOT_URL', '');
    vi.stubEnv('ADMIN_KEY', '');

    await expect(client.post('/chat', {}, 1000)).rejects.toThrow(/BOT_URL|ADMIN_KEY/);
  });

  it('bot trả lỗi thì báo 502 kèm mã', async () => {
    vi.stubEnv('BOT_URL', 'http://bot.local');
    vi.stubEnv('ADMIN_KEY', 'secret');
    stubFetch({ ok: false, status: 401, text: 'no' });

    await expect(client.post('/chat', {}, 1000)).rejects.toThrow('401');
  });

  it('mất kết nối thì báo 502', async () => {
    vi.stubEnv('BOT_URL', 'http://bot.local');
    vi.stubEnv('ADMIN_KEY', 'secret');
    fetchMock.mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.post('/chat', {}, 1000)).rejects.toThrow(/kết nối/i);
  });
});
