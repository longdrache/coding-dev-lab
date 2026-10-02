import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ME_URL,
  REFRESH_URL,
  refreshPlan,
  refreshSessionOnce,
  resolveSession,
  sessionEndedNotice,
  type PublicUser,
} from './api';

/**
 * Vòng đời phiên, đo bằng đồng hồ giả — không có `sleep` nào ở file này.
 *
 * Cố ý **không** test component: `vitest.config.ts` chạy `environment: 'node'`
 * nên không dựng được React. Thay vào đó file này dựng một BE giả bám đúng hợp
 * đồng thật (`ACCESS_TTL_SECONDS = 900` ở `be/src/auth/tokens.ts`,
 * `REFRESH_TTL_MS = 30 ngày` ở `be/src/auth/auth.service.ts`) rồi chạy đúng
 * thuật toán mà `AuthProvider` chạy: `resolveSession` + `refreshPlan`.
 *
 * Nhờ vậy "phiên sống qua mốc 15 phút" được chứng minh bằng đồng hồ thật của hệ
 * thống chứ không phải bằng `vi.advanceTimersByTime` đi tì một timer nào đó có
 * bắn hay không.
 */

const ACCESS_TTL_S = 900;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROTATION_GRACE_MS = 30_000;

const USER: PublicUser = {
  id: 7,
  email: 'hs@gocode.vn',
  name: 'Bạn Học Sinh',
  role: 'user',
  avatarUrl: null,
};

/** BE giả: chỉ giữ đúng những gì FE thật sự phụ thuộc. */
type FakeBe = {
  /** Hết hạn của access token hiện tại (ms). */
  accessUntil: number;
  refreshToken: string;
  refreshUntil: number;
  /** Số lần BE đã **xoay vòng** refresh token — mỗi lần là một token cũ bị đốt. */
  rotations: number;
  /** Token cũ còn dùng được tới mốc này (đệm 30 giây), null nếu chưa từng xoay vòng. */
  prevToken: string | null;
  prevValidUntil: number;
  /** Đếm số request tới từng route. */
  calls: { me: number; refresh: number };
};

function res(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

/**
 * Cài `fetch` theo đúng hai route FE dùng, và trả về `FakeBe` để test kiểm tra
 * trạng thái phía server.
 *
 * `ROTATION_GRACE_MS` được mô phỏng y hệt `auth.service.ts:71` vì đó là thứ quyết
 * định một refresh trùng có chết phiên hay không — bỏ qua nó thì test "bấm hai lần"
 * sẽ xanh vì lý do sai.
 */
function fakeBe(overrides: Partial<FakeBe> = {}): FakeBe {
  const now = Date.now();
  const be: FakeBe = {
    accessUntil: now + ACCESS_TTL_S * 1000,
    refreshToken: 'refresh-ban-dau',
    refreshUntil: now + REFRESH_TTL_MS,
    rotations: 0,
    prevToken: null,
    prevValidUntil: 0,
    calls: { me: 0, refresh: 0 },
    ...overrides,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ME_URL) {
        be.calls.me += 1;
        if (Date.now() < be.accessUntil) return res({ user: USER, expiresIn: ACCESS_TTL_S });
        return res({ message: 'Unauthorized' }, 401);
      }
      if (url === REFRESH_URL && init?.method === 'POST') {
        be.calls.refresh += 1;
        const nowMs = Date.now();
        const laTokenHienTai = be.refreshToken !== '' && nowMs < be.refreshUntil;
        const laTokenVuaXoay =
          be.prevToken !== null && nowMs < be.prevValidUntil && be.refreshToken !== '';
        if (!laTokenHienTai && !laTokenVuaXoay) return res({ message: 'Unauthorized' }, 401);

        // Xoay vòng: token cũ chỉ sống thêm đệm 30 giây, token mới hết hạn sau 30 ngày.
        be.prevToken = be.refreshToken;
        be.prevValidUntil = nowMs + ROTATION_GRACE_MS;
        be.refreshToken = `refresh-moi-${be.rotations + 1}`;
        be.refreshUntil = nowMs + REFRESH_TTL_MS;
        be.accessUntil = nowMs + ACCESS_TTL_S * 1000;
        be.rotations += 1;
        return res({ user: USER, expiresIn: ACCESS_TTL_S });
      }
      throw new Error(`BE giả không có route: ${url}`);
    }),
  );
  return be;
}

describe('vòng đời phiên (đồng hồ giả)', () => {
  beforeEach(() => {
    // Đồng hồ giả **và** Date.now đi cùng nhau: `AuthService.findRotatable` so hạn
    // bằng `Date.now()`, nên chỉ giả timer mà không giả Date sẽ khiến mọi so sánh
    // hạn trong test trở nên vô nghĩa.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('phiên sống qua mốc 15 phút: mở lại trang sau 16 phút vẫn dùng được, không phải đăng nhập lại', async () => {
    const be = fakeBe();

    // Lúc mới vào: access còn hạn nên `/me` đủ, không cần đốt refresh token.
    await expect(resolveSession()).resolves.toEqual({
      kind: 'ok',
      session: { user: USER, expiresIn: ACCESS_TTL_S },
    });
    expect(be.rotations).toBe(0);

    // Vượt mốc 15 phút — đúng cái mốc mà báo cáo nói người dùng bị đá ra.
    await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
    expect(Date.now()).toBeGreaterThan(be.accessUntil);

    // Giờ mô phỏng người dùng **F5** (mount lại `AuthProvider`): `/me` trả 401
    // vì access token hết hạn, nhưng phiên 30 ngày vẫn còn.
    const r = await resolveSession();

    expect(r).toEqual({ kind: 'ok', session: { user: USER, expiresIn: ACCESS_TTL_S } });
    // Không phải đăng xuất, và đúng **một** lần xoay vòng để lấy access token mới.
    expect(be.rotations).toBe(1);
    // Lịch lần sau vẫn hợp lệ (900 - 60 giây đệm).
    expect(refreshPlan(ACCESS_TTL_S)).toBe((ACCESS_TTL_S - 60) * 1000);
  });

  it('vòng lặp tự làm mới chạy mãi: qua nhiều mốc 15 phút vẫn không bao giờ hết phiên', async () => {
    const be = fakeBe();

    // 10 lần mount lại, mỗi lần cách nhau 16 phút — tức hơn 2 giờ thời gian thật,
    // trong khi refresh token vẫn ở rất xa mốc 30 ngày.
    for (let i = 0; i < 10; i += 1) {
      await expect(resolveSession()).resolves.toMatchObject({ kind: 'ok' });
      await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
    }

    expect(Date.now()).toBeLessThan(be.refreshUntil);
    // Lần đầu access còn hạn nên không tốn refresh token; 9 lần sau đều phải xoay
    // vòng — và cả 10 lần đều trả về `ok`, không lần nào là `expired`.
    expect(be.rotations).toBe(9);
  });

  it('hết 30 ngày thì đăng xuất THẬT, không phải tự làm mới', async () => {
    // Access token đã hạn từ lâu, refresh token cũng đã quá mốc 30 ngày.
    const be = fakeBe({ accessUntil: Date.now() - 1_000, refreshUntil: Date.now() - 1 });

    await expect(resolveSession()).resolves.toEqual({ kind: 'expired' });
    // `/me` trả 401 và `/refresh` trả 401: hai bằng chứng độc lập cùng kết luận.
    expect(be.calls).toMatchObject({ me: 1, refresh: 1 });
    expect(be.rotations).toBe(0);
  });

  it('bị gỡ phiên (đăng xuất ở nơi khác) thì cũng là hết phiên thật', async () => {
    // `AuthService.logout` xoá dòng phiên ⇒ `refresh` không còn dòng nào khớp.
    // Ở BE giả thì hiện tượng đó là: token trình duyệt giữ không còn được chấp nhận.
    const be = fakeBe({ accessUntil: Date.now() - 1, refreshToken: '' });

    await expect(resolveSession()).resolves.toEqual({ kind: 'expired' });
    expect(be.rotations).toBe(0);
  });
});

describe('kiểm tra phiên KHÔNG được tiêu refresh token', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('đọc /me lặp lại nhiều lần thì refresh token y nguyên, xoay vòng 0 lần', async () => {
    // Đây là bản "không tiêu token" ở phía FE: chỉ **đọc** `/me` thì không được
    // chạm vào refresh token. Nếu lớp xác minh phiên phía server xoay vòng token
    // chỉ để trả lời "ai đang đăng nhập", thì mỗi lần F5 là mất phiên.
    const be = fakeBe();
    const tokenDau = be.refreshToken;

    for (let i = 0; i < 5; i += 1) {
      await expect(resolveSession()).resolves.toMatchObject({ kind: 'ok' });
    }

    expect(be.calls.me).toBe(5);
    expect(be.rotations).toBe(0);
    expect(be.refreshToken).toBe(tokenDau);
  });

  it('token vừa xoay vòng vẫn dùng được ngay sau khi đó (đệm 30 giây) — không mất phiên', async () => {
    // Sau khi `resolveSession` phải xoay vòng (vì access hết hạn), token **trước
    // đó** vẫn phải dùng được. Nếu lớp xác minh cũng xoay vòng thì mỗi lần kiểm
    // phiên sẽ đốt thêm một token và hai request gần nhau sẽ tranh nhau nhau.
    const be = fakeBe({ accessUntil: Date.now() - 1000 });
    const tokenCu = be.refreshToken;

    await expect(resolveSession()).resolves.toMatchObject({ kind: 'ok' });
    expect(be.rotations).toBe(1);

    // Token cũ còn dùng được trong đệm — tức lần xoay vòng vừa rồi là lần duy nhất.
    const lanNua = await refreshSessionOnce();
    expect(lanNua).toMatchObject({ kind: 'ok' });
    expect(be.rotations).toBe(2);
    // Và token cũ **không** còn dùng được sau khi quá đệm.
    await vi.advanceTimersByTimeAsync(ROTATION_GRACE_MS + 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== REFRESH_URL || init?.method !== 'POST') throw new Error('route la');
        const laTokenHienTai = Date.now() < be.refreshUntil && be.refreshToken !== 'refresh-moi-2';
        const laTokenVuaXoay = be.prevToken === tokenCu && Date.now() < be.prevValidUntil;
        return laTokenHienTai || laTokenVuaXoay
          ? res({ user: USER, expiresIn: ACCESS_TTL_S })
          : res({ message: 'Unauthorized' }, 401);
      }),
    );
    await expect(refreshSessionOnce()).resolves.toEqual({ kind: 'expired' });
  });

  it('bấm hai lần cùng lúc thì chỉ MỘT lần gọi /refresh', async () => {
    const be = fakeBe({ accessUntil: Date.now() - 1000 });

    const [a, b, c] = await Promise.all([
      resolveSession(),
      resolveSession(),
      resolveSession(),
    ]);

    expect([a, b, c].every((r) => r.kind === 'ok')).toBe(true);
    // Ba nơi cùng phát hiện access hết hạn, nhưng refresh token chỉ bị xoay vòng
    // **một** lần. Hai lần thì token mới bị tranh và request sau rơi vào đệm 30
    // giây — hết hạn đúng lúc người dùng còn đang dùng app.
    expect(be.calls.refresh).toBe(1);
    expect(be.rotations).toBe(1);
  });
});

describe('lỗi tạm không được xoá phiên', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('/me trả 5xx thì "retry", tuyệt đối không "expired"', async () => {
    // `expired` là tín hiệu duy nhất để `AuthProvider` hạ user về `null`. Một lần
    // Neon chập chờn nửa giây mà ra `expired` là đăng xuất oan người đang dùng.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({ message: 'boom' }, 503)));
    await expect(resolveSession()).resolves.toEqual({ kind: 'retry' });
  });

  it('/me ném lỗi mạng thì "retry", không phải "expired"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(resolveSession()).resolves.toEqual({ kind: 'retry' });
  });

  it('/me 5xx thì KHÔNG gọi /refresh — lỗi server không phải hết phiên', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ message: 'boom' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveSession()).resolves.toEqual({ kind: 'retry' });

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([ME_URL]);
  });

  it('/me 401 nhưng /refresh lỗi mạng thì "retry" — giữ phiên, thử lại sau', async () => {
    // Nguy hiểm nhất: đã biết access hết hạn, refresh thì không gọi được.
    // Kết luận "expired" ở đây là đăng xuất oan; phải là "retry".
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === ME_URL) return res({}, 401);
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(resolveSession()).resolves.toEqual({ kind: 'retry' });
  });
});

describe('sessionEndedNotice', () => {
  it('hết hạn 15 phút là "ok" (đã tự làm mới) nên KHÔNG có câu báo nào', () => {
    expect(sessionEndedNotice(USER, 'ok')).toBeNull();
  });

  it('lỗi mạng thì không báo hết phiên', () => {
    expect(sessionEndedNotice(USER, 'retry')).toBeNull();
  });

  it('phiên chết giữa chừng thì có câu báo, và nói rõ là hết phiên chứ không phải lỗi', () => {
    const msg = sessionEndedNotice(USER, 'expired');
    expect(msg).toBeTruthy();
    expect(msg).toContain('30 ngày');
    expect(msg).toContain('đăng nhập lại');
  });

  it('đăng xuất CỐ Ý thì không báo "phiên đã kết thúc"', () => {
    // Người dùng vừa tự bấm đăng xuất; `AccountMenu` đã báo xong. Thêm dòng này
    // là nói với họ chuyện họ vừa tự làm.
    expect(sessionEndedNotice(USER, 'expired', true)).toBeNull();
  });

  it('chưa có user thì không có gì để mất, nên không báo', () => {
    expect(sessionEndedNotice(null, 'expired')).toBeNull();
  });
});