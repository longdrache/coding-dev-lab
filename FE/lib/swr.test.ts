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

  // Hợp đồng bảo mật của authedFetcher (credentials include, không Authorization)
  // nằm ở lib/api.test.ts. Ở đây chỉ ghim phần ngữ nghĩa fetcher còn lại.
  it('trả JSON khi ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ slug: 'a' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(authedFetcher('/x')).resolves.toEqual([{ slug: 'a' }]);
    expect(fetchMock).toHaveBeenCalledWith('/x', { credentials: 'include' });
  });

  it('ném lỗi khi HTTP lỗi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(authedFetcher('/x')).rejects.toThrow('401');
  });
});
