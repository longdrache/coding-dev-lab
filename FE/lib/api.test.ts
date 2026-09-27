import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicUser } from './api';
import { API_URL, authedFetcher } from './swr';

/** Đọc header đã gửi ở bất kỳ dạng `HeadersInit` nào — không đoán bằng `init.headers?.X`. */
function sentHeaders(init: RequestInit | undefined): Record<string, string> {
  const h = init?.headers;
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

describe('authedFetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gửi credentials include và không tự gắn Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ a: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await authedFetcher<{ a: number }>('http://x/api/me');

    expect(r).toEqual({ a: 1 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    // Cookie phiên là httpOnly nên JS không đọc được token. Bỏ `include` là BE
    // không nhận cookie ⇒ mọi request trả 401. Gắn Authorization là lộ token
    // vào JS (đúng thứ httpOnly sinh ra để tránh).
    expect(init.credentials).toBe('include');
    expect(sentHeaders(init).Authorization).toBeUndefined();
  });
});

describe('publicUser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const USER = {
    id: 7,
    email: 'hs@gocode.vn',
    name: 'Bạn Học Sinh',
    role: 'vip' as const,
  };

  it('401 — chưa đăng nhập là trạng thái bình thường, trả null chứ không ném lỗi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(publicUser()).resolves.toBeNull();
  });

  it('trả user khi /me ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: USER, expiresIn: 900 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(publicUser()).resolves.toEqual(USER);
  });

  it('gọi đúng /api/auth/me với credentials include và không gắn Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: USER }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await publicUser();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/auth/me`);
    expect(init.credentials).toBe('include');
    expect(sentHeaders(init).Authorization).toBeUndefined();
  });

  it('200 nhưng không có user thì vẫn null, không ném lỗi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(publicUser()).resolves.toBeNull();
  });
});
