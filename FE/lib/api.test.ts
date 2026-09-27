import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_LEAD_S, commitSession, currentSession, refreshPlan, refreshSession, shouldClearCache } from './api';
import { API_URL, authedFetcher } from './swr';

/** Đọc header đã gửi ở bất kỳ dạng `HeadersInit` nào — không đoán bằng `init.headers?.X`. */
function sentHeaders(init: RequestInit | undefined): Record<string, string> {
  const h = init?.headers;
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

const USER = {
  id: 7,
  email: 'hs@gocode.vn',
  name: 'Bạn Học Sinh',
  role: 'vip' as const,
};

/** Response giả của fetch, chỉ cần các trường code thật sự đọc. */
function stubFetch(res: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('authedFetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gửi credentials include và không tự gắn Authorization', async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: () => Promise.resolve({ a: 1 }),
    });

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

describe('refreshPlan', () => {
  // Access token sống 900 giây (ACCESS_TTL_SECONDS ở be/src/auth/tokens.ts).
  // Lên lịch sớm hơn hạn một khoảng đệm để có thời gian cho mạng chậm, nếu không
  // thì timer bắn đúng vòng hạn thì mọi request kế tiếp đều 401.
  it('chờ expiresIn trừ khoảng đệm', () => {
    expect(refreshPlan(900)).toBe((900 - REFRESH_LEAD_S) * 1000);
    expect(refreshPlan(300)).toBe((300 - REFRESH_LEAD_S) * 1000);
  });

  it('expiresIn không lớn hơn khoảng đệm thì chờ ngay, không chờ âm', () => {
    expect(refreshPlan(60)).toBe(0);
    expect(refreshPlan(30)).toBe(0);
    expect(refreshPlan(0)).toBe(0);
  });

  it('giá trị rác thì không lên lịch hỏng', () => {
    // setTimeout với NaN/Infinity/setTimeout âm đều hỏng theo cách khác nhau
    // (NaN → 0 tức thì, > 2^31-1 → bắn ngay) nên phải trả null chứ không phải số.
    expect(refreshPlan(Number.NaN)).toBeNull();
    expect(refreshPlan(Number.POSITIVE_INFINITY)).toBeNull();
    expect(refreshPlan(-900)).toBeNull();
    expect(refreshPlan(undefined)).toBeNull();
    expect(refreshPlan(null)).toBeNull();
    expect(refreshPlan('900')).toBeNull();
    expect(refreshPlan({})).toBeNull();
  });
});

describe('currentSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('401 — chưa đăng nhập là trạng thái bình thường, trả null chứ không ném lỗi', async () => {
    stubFetch({ ok: false, status: 401 });
    await expect(currentSession()).resolves.toBeNull();
  });

  it('trả cả user lẫn expiresIn vì expiresIn là thứ duy nhất biết khi nào hết hạn', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: USER, expiresIn: 900 }),
    });
    await expect(currentSession()).resolves.toEqual({ user: USER, expiresIn: 900 });
  });

  it('gọi đúng /api/auth/me với credentials include và không gắn Authorization', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: USER, expiresIn: 900 }),
    });

    await currentSession();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/auth/me`);
    expect(init.credentials).toBe('include');
    expect(sentHeaders(init).Authorization).toBeUndefined();
  });

  it('200 nhưng không có user thì vẫn null, không ném lỗi', async () => {
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await expect(currentSession()).resolves.toBeNull();
  });
});

describe('refreshSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST /api/auth/refresh với credentials include và không gắn Authorization', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: USER, expiresIn: 900 }),
    });

    await refreshSession();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/auth/refresh`);
    expect(init.method).toBe('POST');
    // Route không nhận body — nó đọc cookie `refresh`. Gửi credentials là điều
    // kiện sống còn, bỏ thì luôn 401 dù phiên còn hạn.
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
    expect(sentHeaders(init).Authorization).toBeUndefined();
  });

  it('thành công thì trả session mới để lên lịch lần sau', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: USER, expiresIn: 900 }),
    });
    await expect(refreshSession()).resolves.toEqual({
      kind: 'ok',
      session: { user: USER, expiresIn: 900 },
    });
  });

  it('401 — không còn cookie refresh thì phiên chết thật, dừng lịch', async () => {
    stubFetch({ ok: false, status: 401, json: () => Promise.resolve({}) });
    await expect(refreshSession()).resolves.toEqual({ kind: 'expired' });
  });

  it('200 mà không có user cũng là phiên chết — BE trả 200 cho token đã thu hồi', async () => {
    // be/src/auth/auth.controller.ts:191-194 trả 200 + { message } khi token bị
    // thu hồi/hết hạn/xoay vòng quá đệm, kèm clearSessionCookies. Nếu chỉ nhìn
    // status thì coi nhầm đây là thành công và quay vòng lặp vô hạn với phiên chết.
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ message: 'Phiên đã hết hạn, vui lòng đăng nhập lại.' }),
    });
    await expect(refreshSession()).resolves.toEqual({ kind: 'expired' });
  });

  it('lỗi mạng hoặc 5xx thì thử lại, không đăng xuất nhầm', async () => {
    stubFetch({ ok: false, status: 503, json: () => Promise.resolve({}) });
    await expect(refreshSession()).resolves.toEqual({ kind: 'retry' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(refreshSession()).resolves.toEqual({ kind: 'retry' });
  });
});

describe('shouldClearCache', () => {
  it('null → null thì không đụng cache', () => {
    // Khách lạ vào trang: xoá cache ở đây là mất o(những bài đã cache 1 ngày)
    // mà không đổi gì cả.
    expect(shouldClearCache(null, null)).toBe(false);
  });

  it('có user → null là đăng xuất hoặc phiên chết, phải xoá', () => {
    // Cache SWR giữ dashboard/lịch sử/huy hiệu của tài khoản vừa mất. Giữ lại
    // thì đăng nhập tài khoản khác trong cùng tab là nhìn thấy dữ liệu người trước.
    expect(shouldClearCache(USER, null)).toBe(true);
  });

  it('null → có user là đăng nhập, phải xoá', () => {
    expect(shouldClearCache(null, USER)).toBe(true);
  });

  it('cùng một id thì KHÔNG xoá, dù là object khác', () => {
    // Đây là ca dễ sai nhất. Mỗi lần refresh access token (15 phút một lần) BE
    // trả lại một object `user` mới; nếu so bằng tham chiếu thì sẽ xoá cache
    // mỗi 15 phút và người dùng mất dữ liệu đang tải.
    const rotated = { ...USER };
    expect(rotated).not.toBe(USER);
    expect(shouldClearCache(USER, rotated)).toBe(false);
  });

  it('cùng id nhưng role đổi (nâng VIP) thì cũng không xoá', () => {
    expect(shouldClearCache(USER, { ...USER, role: 'admin' })).toBe(false);
  });

  it('khác id là đổi tài khoản, phải xoá', () => {
    expect(shouldClearCache(USER, { ...USER, id: 8 })).toBe(true);
  });
});

describe('commitSession', () => {
  /** Ghi lại các lời gọi theo thứ tự để kiểm tra cả lúc gọi lẫn thứ tự. */
  function recorder() {
    const calls: string[] = [];
    return {
      calls,
      purge: () => void calls.push('purge'),
      commit: (u: { id: number } | null) => void calls.push(`commit:${u?.id ?? 'null'}`),
    };
  }

  it('đăng xuất thì xoá cache rồi mới commit null', () => {
    const r = recorder();
    commitSession(USER, null, r.purge, r.commit);
    expect(r.calls).toEqual(['purge', 'commit:null']);
  });

  it('đăng nhập thì xoá cache rồi mới commit user', () => {
    const r = recorder();
    commitSession(null, USER, r.purge, r.commit);
    expect(r.calls).toEqual(['purge', 'commit:7']);
  });

  it('xoá cache ĐỨNG TRƯỚC commit, không phải sau', () => {
    // Nếu commit chạy trước thì có một khoảnh khắc tài khoản mới đã render
    // cạnh cache của tài khoản cũ — đúng cái rò dữ liệu này.
    const r = recorder();
    commitSession(USER, { ...USER, id: 8 }, r.purge, r.commit);
    expect(r.calls.indexOf('purge')).toBeLessThan(r.calls.indexOf('commit:8'));
  });

  it('cùng id thì KHÔNG xoá cache, chỉ commit', () => {
    // Ca quan trọng nhất: mỗi lần refresh access token (15 phút) BE trả user
    // mới. Xoá ở đây là người dùng mất dữ liệu đang tải mỗi 15 phút.
    const r = recorder();
    commitSession(USER, { ...USER }, r.purge, r.commit);
    expect(r.calls).toEqual(['commit:7']);
  });

  it('khách (null → null) thì không xoá, không phá cache bài đã cache 1 ngày', () => {
    const r = recorder();
    commitSession(null, null, r.purge, r.commit);
    expect(r.calls).toEqual(['commit:null']);
  });

  it('đổi tài khoản thì xoá cache', () => {
    const r = recorder();
    commitSession(USER, { ...USER, id: 8 }, r.purge, r.commit);
    expect(r.calls).toEqual(['purge', 'commit:8']);
  });
});
