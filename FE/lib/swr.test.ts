import { afterEach, describe, expect, it, vi } from 'vitest';
import { authedFetcher, swrFetcher } from './swr';

describe('swrFetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('trả JSON khi ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ a: 1 }),
    }));
    await expect(swrFetcher('/x')).resolves.toEqual({ a: 1 });
  });

  it('ném lỗi khi HTTP lỗi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(swrFetcher('/x')).rejects.toThrow('500');
  });
});

describe('authedFetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gắn Bearer token khi có', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = authedFetcher(() => Promise.resolve('tok123'));
    await fetcher('/x');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
  });

  it('không gắn header khi chưa đăng nhập', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = authedFetcher(() => Promise.resolve(null));
    await fetcher('/x');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({});
  });
});
