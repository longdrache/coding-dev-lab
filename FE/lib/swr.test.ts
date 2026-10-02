import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_URL } from './api';
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

  it('401 → refresh thành công → retry 200', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const refreshSessionOnce = vi.fn(() =>
      Promise.resolve({ kind: 'ok', session: { user: {}, expiresIn: 900 } }),
    );
    vi.doMock('./api', () => ({ refreshSessionOnce }));
    const { authedFetcher: fetcher } = await import('./swr');
    await expect(fetcher('/x')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSessionOnce).toHaveBeenCalledTimes(1);
    vi.doUnmock('./api');
  });

  it('401 → refresh thất bại → ném 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    vi.doMock('./api', () => ({
      refreshSessionOnce: () => Promise.resolve({ kind: 'expired' }),
    }));
    const { authedFetcher: fetcher } = await import('./swr');
    await expect(fetcher('/x')).rejects.toThrow('401');
    vi.doUnmock('./api');
  });

  /**
   * Ca này là **lý do** `authedFetcher` gọi `refreshSessionOnce` chứ không gọi
   * `refreshSession`: nhiều key SWR cùng 401 thì chỉ được xoay vòng token **một
   * lần**. Refresh token xoay vòng, nên hai lần gọi là hai lần tranh nhau token
   * mới và các lượt sau phải giành qua đệm 30 giây (`ROTATION_GRACE_MS`).
   */
  it('nhiều key cùng 401 thì chỉ một lần gọi refresh', async () => {
    // Access token chưa được làm mới thì mọi key trả 401; sau một lần refresh
    // thì cùng các key đó trả 200 — y hệt điều xảy ra ở BE.
    let daLamMoi = false;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) {
        daLamMoi = true;
        return { ok: true, status: 200, json: () => Promise.resolve({ user: {}, expiresIn: 900 }) };
      }
      if (!daLamMoi) return { ok: false, status: 401, json: () => Promise.resolve({}) };
      return { ok: true, status: 200, json: () => Promise.resolve({ url }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    // Các test trên dùng `doMock` cho `./api`; phải xoá cache module để test này
    // import đúng bản thật, không phải bản đã bị mock.
    vi.doUnmock('./api');
    vi.resetModules();
    const { authedFetcher: fetcher } = await import('./swr');

    await expect(
      Promise.all([fetcher('http://x/a'), fetcher('http://x/b'), fetcher('http://x/c')]),
    ).resolves.toEqual([{ url: 'http://x/a' }, { url: 'http://x/b' }, { url: 'http://x/c' }]);

    const refreshCalls = fetchMock.mock.calls.filter((c) => c[0] === REFRESH_URL);
    // 3 key × 2 lần gọi (thử, rồi thử lại) = 6, nhưng chỉ **một** lần xoay vòng token.
    expect(refreshCalls).toHaveLength(1);
  });
});
