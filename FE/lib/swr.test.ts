import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, authedFetcher, swrFetcher } from './swr';

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

/** Body lỗi kiểu Nest: `{ statusCode, message, code }`. */
function resLoi(status: number, body: unknown) {
  return { ok: false, status, json: () => Promise.resolve(body) };
}

describe('ApiError mang mã lỗi ổn định từ BE', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('swrFetcher đọc được code problem_vip_only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(resLoi(403, { code: 'problem_vip_only', message: '...' })),
    );
    const err = (await swrFetcher('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('problem_vip_only');
  });

  it('authedFetcher đọc được code problem_vip_only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(resLoi(403, { code: 'problem_vip_only' })),
    );
    const err = (await authedFetcher('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('problem_vip_only');
  });

  it('lỗi không có code thì code null, không phải undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resLoi(500, { message: 'x' })));
    const err = (await authedFetcher('/x').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBeNull();
  });

  it('body không phải JSON, hoặc không có hàm json, thì vẫn ném ApiError chứ không 500', async () => {
    // Đường này xảy ra thật khi response bị proxy chặn giữa chừng trả HTML.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const err = (await authedFetcher('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBeNull();
  });

  it('body JSON hỏng thì code null, không ném lỗi parse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      }),
    );
    const err = (await authedFetcher('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBeNull();
  });

  it('code không phải chuỗi thì bỏ qua, không đẩy rác vào UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resLoi(403, { code: { a: 1 } })));
    const err = (await authedFetcher('/x').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBeNull();
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
