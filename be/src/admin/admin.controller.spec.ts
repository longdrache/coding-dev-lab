import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AdminController } from './admin.controller.ts';

/**
 * Controller admin là tầng mỏng: nó **không** chứa quyết định nghiệp vụ, chỉ đọc
 * request, chuyển tham số xuống service và đặt cookie. Vì vậy test ở đây canh đúng
 * ba thứ mà chỉ controller mới có thể sai:
 *
 *   1. tham số có bị bóp méo (cắt bớt, ép kiểu, đọc sai tên query) trước khi
 *      xuống service hay không;
 *   2. cookie admin có đúng thuộc tính theo môi trường hay không — admin và BE ở
 *      khác site nên `SameSite=None; Secure` là bắt buộc ở production, đặt sai thì
 *      admin không đăng nhập được mà không có lỗi nào hiện ra;
 *   3. route nào **không** có `AdminGuard` — xoá guard ở đây sẽ làm test này đỏ.
 *
 * Gọi thẳng handler (`ctrl.login(...)`) thay vì dựng `TestingModule`: `admin.vip-route.spec.ts`
 * đã dựng app thật cho đúng một route, nên ở đây stub service là đủ và giữ test
 * chạy được không cần Postgres.
 */

function makeController() {
  const svc = {
    login: vi.fn().mockResolvedValue({ token: 'token-abc', refreshToken: 'refresh-xyz' }),
    refresh: vi.fn().mockReturnValue({ token: 'token-moi', refreshToken: 'refresh-moi' }),
    getStats: vi.fn().mockResolvedValue({ users: 3 }),
    getLoginAnalytics: vi.fn().mockResolvedValue({ days: [] }),
    listQna: vi.fn().mockResolvedValue([]),
    deleteQna: vi.fn().mockResolvedValue({ ok: true }),
    replyQna: vi.fn().mockResolvedValue({ ok: true }),
    listUsers: vi.fn().mockResolvedValue({ rows: [] }),
    listSubmissions: vi.fn().mockResolvedValue({ rows: [] }),
    listProblems: vi.fn().mockResolvedValue([]),
    getProblem: vi.fn().mockResolvedValue({ slug: 'bai-01' }),
    createProblem: vi.fn().mockResolvedValue({ slug: 'bai-moi' }),
    updateProblem: vi.fn().mockResolvedValue({ slug: 'bai-01' }),
    deleteProblem: vi.fn().mockResolvedValue({ ok: true }),
    approveProblem: vi.fn().mockResolvedValue({ ok: true }),
    unpublishProblem: vi.fn().mockResolvedValue({ ok: true }),
    setProblemVip: vi.fn().mockResolvedValue({ slug: 'bai-01', isVip: true }),
  };
  const views = {
    getAnalytics: vi.fn().mockResolvedValue({ total: 10 }),
    getRecent: vi.fn().mockResolvedValue([{ path: '/' }]),
  };
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  return { ctrl: new AdminController(svc as never, views as never), svc, views, res };
}

/** `req` tối thiểu cho các route chỉ đọc `url` + `headers.host`. */
function req(url?: string, host?: string) {
  return { url, headers: host ? { host } : {} } as never;
}

describe('POST /api/admin/login — cookie phải đúng theo môi trường', () => {
  const NODE_ENV_CU = process.env.NODE_ENV;
  const VERCEL_CU = process.env.VERCEL;

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
  });
  afterEach(() => {
    if (NODE_ENV_CU === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = NODE_ENV_CU;
    if (VERCEL_CU === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = VERCEL_CU;
  });

  it('local: Lax + không Secure, và trả token trong body cho admin proxy', async () => {
    const { ctrl, svc, res } = makeController();
    const out = await ctrl.login({ email: 'a@b.c', password: 'p' }, res as never);

    expect(svc.login).toHaveBeenCalledWith('a@b.c', 'p');
    expect(out).toEqual({
      ok: true,
      token: 'token-abc',
      refreshToken: 'refresh-xyz',
      expiresIn: 1800,
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'admin_token',
      'token-abc',
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' }),
    );
    // Cookie làm mới phải được đặt cùng lúc: không có nó thì sau 30 phút admin bị
    // đá và không có cách nào quay lại ngoài mật khẩu.
    expect(res.cookie).toHaveBeenCalledWith(
      'admin_refresh',
      'refresh-xyz',
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' }),
    );
  });

  /**
   * `maxAge` của cookie phải bám hạn thật của JWT. Trước đây cookie `admin_token`
   * sống 7 ngày trong khi bên trong là JWT 30 phút: sau 30 phút trình duyệt vẫn
   * giữ cookie, mọi request trả 401, và admin tưởng ứng dụng hỏng chứ không phải
   * phiên hết hạn.
   */
  it('maxAge của cookie admin_token bám hạn 30 phút, không phải 7 ngày', async () => {
    const { ctrl, res } = makeController();
    await ctrl.login({ email: 'a@b.c', password: 'p' }, res as never);

    const opts = res.cookie.mock.calls.find((c) => c[0] === 'admin_token')![2] as {
      maxAge: number;
    };
    expect(opts.maxAge).toBe(30 * 60 * 1000);
    const optsRefresh = res.cookie.mock.calls.find((c) => c[0] === 'admin_refresh')![2] as {
      maxAge: number;
    };
    expect(optsRefresh.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('NODE_ENV=production: SameSite=None + Secure, nếu không admin không đăng nhập được', async () => {
    process.env.NODE_ENV = 'production';
    const { ctrl, res } = makeController();
    await ctrl.login({ email: 'a@b.c', password: 'p' }, res as never);

    expect(res.cookie).toHaveBeenCalledWith(
      'admin_token',
      'token-abc',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'none' }),
    );
  });

  // `VERCEL=1` là cách Vercel báo "đang chạy trên production" — không đặt
  // NODE_ENV=production. Bỏ nhánh này thì deploy lên Vercel lại ra Lax.
  it('VERCEL=1 cũng coi là production', async () => {
    process.env.VERCEL = '1';
    const { ctrl, res } = makeController();
    await ctrl.login({ email: 'a@b.c', password: 'p' }, res as never);

    expect(res.cookie).toHaveBeenCalledWith(
      'admin_token',
      'token-abc',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });
});

describe('POST /api/admin/logout', () => {
  it('xoá cookie cùng path/secure/sameSite lúc đặt, nếu lệch thì cookie cũ sống dai', () => {
    process.env.NODE_ENV = 'production';
    try {
      const { ctrl, res } = makeController();
      const out = ctrl.logout(res as never);

      expect(out).toEqual({ ok: true });
      expect(res.clearCookie).toHaveBeenCalledWith('admin_token', {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });
    } finally {
      if (process.env.NODE_ENV === 'production') delete process.env.NODE_ENV;
    }
  });

  it('xoá cả cookie làm mới — bỏ nó thì "đăng xuất" chỉ có tác dụng 30 phút', () => {
    // Cookie `admin_refresh` sống 7 ngày. Nếu logout không xoá nó thì sau khi
    // admin bấm "Đăng xuất", mọi request vẫn tự làm mới được bằng nó: đăng xuất
    // là nút chết.
    const { ctrl, res } = makeController();
    ctrl.logout(res as never);

    expect(res.clearCookie).toHaveBeenCalledWith('admin_refresh', expect.objectContaining({ path: '/' }));
  });
});

/**
 * Route làm mới là thứ **duy nhất** giữ cho admin không bị đá khỏi app mỗi 30 phút.
 * Nó phải chạy được khi access token đã chết — nên không `AdminGuard` — và phải
 * phân biệt "hết phiên thật" với "lỗi tạm" đúng như app chính.
 */
describe('POST /api/admin/refresh', () => {
  it('đọc cookie admin_refresh rồi cấp lại cả hai token', async () => {
    const { ctrl, svc, res } = makeController();
    const out = await ctrl.refresh({ cookies: { admin_refresh: 'refresh-xyz' } } as never, res as never);

    expect(svc.refresh).toHaveBeenCalledWith('refresh-xyz');
    expect(out).toMatchObject({ ok: true, token: 'token-moi', expiresIn: 1800 });
    expect(res.cookie).toHaveBeenCalledWith('admin_token', 'token-moi', expect.objectContaining({ path: '/' }));
    expect(res.cookie).toHaveBeenCalledWith('admin_refresh', 'refresh-moi', expect.objectContaining({ path: '/' }));
  });

  // Không chắc `cookie-parser` được mount ở mọi đường vào; route này phải chạy
  // được khi access token đã hết hạn thì cookie-parser cũng chưa chắc đã chạy.
  it('đọc được cookie admin_refresh trong header thô khi req.cookies rỗng', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.refresh(
      { headers: { cookie: 'admin_token=cu; admin_refresh=refresh-xyz' } } as never,
      { cookie: vi.fn(), clearCookie: vi.fn() } as never,
    );
    expect(svc.refresh).toHaveBeenCalledWith('refresh-xyz');
  });

  it('không có cookie thì ném 401 và dọn cả hai cookie', async () => {
    const { ctrl, svc, res } = makeController();
    await expect(ctrl.refresh({} as never, res as never)).rejects.toThrow();
    expect(svc.refresh).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith('admin_token', { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith('admin_refresh', { path: '/' });
  });

  // 200 + { message } sẽ khiến client coi là xong rồi hỏi lại mãi một phiên đã
  // chết — đúng cái bẫy mà `auth.controller.ts:263-266` đã ghi lại cho app chính.
  it('refresh token hết hạn thì 401, KHÔNG phải 200 kèm message', async () => {
    const { ctrl, svc, res } = makeController();
    svc.refresh.mockReturnValue(null);
    await expect(
      ctrl.refresh({ cookies: { admin_refresh: 'het-han' } } as never, res as never),
    ).rejects.toThrow();
    expect(res.clearCookie).toHaveBeenCalledWith('admin_refresh', { path: '/' });
  });
});

describe('GET /api/admin/me', () => {
  it('trả đúng `req.admin` mà guard đã dựng, không tự tra lại', () => {
    const { ctrl } = makeController();
    const admin = { email: 'a@b.c', role: 'admin' };
    expect(ctrl.me({ admin } as never)).toBe(admin);
  });
});

describe('GET /api/admin/users — ép số và đọc query', () => {
  it('không truyền tham số thì lấy mặc định 20/0, tức danh sách không bị lỗi 500', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.listUsers(req('/api/admin/users'));
    expect(svc.listUsers).toHaveBeenCalledWith({ limit: 20, offset: 0, query: undefined });
  });

  it('limit/offset ép sang số, `q` được đọc', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.listUsers(req('/api/admin/users?limit=5&offset=10&q=an'));
    expect(svc.listUsers).toHaveBeenCalledWith({ limit: 5, offset: 10, query: 'an' });
  });

  // FE admin gửi `query` ở một màn hình và `q` ở màn khác; chỉ đọc một tên thì
  // màn còn lại im lặng không lọc — thêm alias ở đây cho cả hai.
  it('`query` là alias của `q`', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.listUsers(req('/api/admin/users?query=bien'));
    expect(svc.listUsers).toHaveBeenCalledWith({ limit: 20, offset: 0, query: 'bien' });
  });

  // Không có `headers.host` thì `new URL` ném — mọi request thiếu Host đều 500.
  it('thiếu `headers.host` vẫn dựng được URL nhờ gốc localhost', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.listUsers({ url: '/api/admin/users?limit=7' } as never);
    expect(svc.listUsers).toHaveBeenCalledWith({ limit: 7, offset: 0, query: undefined });
  });
});

describe('GET /api/admin/submissions — lọc theo bài', () => {
  it('mặc định 20/0 và không lọc bài', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.listSubmissions(req('/api/admin/submissions'));
    expect(svc.listSubmissions).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      problemSlug: undefined,
      query: undefined,
    });
  });

  it('problemSlug + q lọc đúng xuống service', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.listSubmissions(req('/api/admin/submissions?problemSlug=two-sum&q=abc&limit=2'));
    expect(svc.listSubmissions).toHaveBeenCalledWith({
      limit: 2,
      offset: 0,
      problemSlug: 'two-sum',
      query: 'abc',
    });
  });
});

describe('route admin chuyển nguyên vẹn xuống service', () => {
  it('đọc các route không tham số', async () => {
    const { ctrl, svc, views } = makeController();
    expect(await ctrl.getStats()).toEqual({ users: 3 });
    expect(await ctrl.getViewsAnalytics()).toEqual({ total: 10 });
    expect(await ctrl.getViewsRecent()).toEqual([{ path: '/' }]);
    expect(await ctrl.getLoginsAnalytics()).toEqual({ days: [] });
    expect(await ctrl.listQna()).toEqual([]);
    expect(await ctrl.listProblems()).toEqual([]);
    expect(svc.getStats).toHaveBeenCalled();
    expect(views.getAnalytics).toHaveBeenCalled();
    expect(views.getRecent).toHaveBeenCalled();
    expect(svc.getLoginAnalytics).toHaveBeenCalled();
    expect(svc.listQna).toHaveBeenCalled();
    expect(svc.listProblems).toHaveBeenCalled();
  });

  it('route có `:id` / `:slug` truyền đúng tham số', async () => {
    const { ctrl, svc } = makeController();
    await ctrl.deleteQna('7');
    await ctrl.getProblem('bai-01');
    await ctrl.deleteProblem('bai-01');
    await ctrl.approveProblem('bai-01');
    await ctrl.unpublishProblem('bai-01');
    expect(svc.deleteQna).toHaveBeenCalledWith('7');
    expect(svc.getProblem).toHaveBeenCalledWith('bai-01');
    expect(svc.deleteProblem).toHaveBeenCalledWith('bai-01');
    expect(svc.approveProblem).toHaveBeenCalledWith('bai-01');
    expect(svc.unpublishProblem).toHaveBeenCalledWith('bai-01');
  });

  // Body thiếu `message` thì `replyQna` vẫn phải nhận **chuỗi rỗng** chứ không
  // phải `undefined`: service gọi `String(message)` và so với `''`.
  it('replyQna ép message thiếu thành chuỗi rỗng', () => {
    const { ctrl, svc } = makeController();
    ctrl.replyQna('7', {} as never);
    expect(svc.replyQna).toHaveBeenCalledWith('7', '');
  });

  it('replyQna truyền nguyên message khi có', () => {
    const { ctrl, svc } = makeController();
    ctrl.replyQna('7', { message: 'chao ban' });
    expect(svc.replyQna).toHaveBeenCalledWith('7', 'chao ban');
  });

  it('create/update bài chuyển nguyên dto xuống service', () => {
    const { ctrl, svc } = makeController();
    const dto = { slug: 'bai-moi', title: 'Bài mới' };
    ctrl.createProblem(dto as never);
    ctrl.updateProblem('bai-01', dto as never);
    expect(svc.createProblem).toHaveBeenCalledWith(dto);
    expect(svc.updateProblem).toHaveBeenCalledWith('bai-01', dto);
  });

  it('PATCH vip chuyển `isVip` xuống service, thiếu thì gửi undefined', () => {
    const { ctrl, svc } = makeController();
    ctrl.setProblemVip('bai-01', { isVip: false });
    ctrl.setProblemVip('bai-01', {} as never);
    expect(svc.setProblemVip).toHaveBeenNthCalledWith(1, 'bai-01', false);
    expect(svc.setProblemVip).toHaveBeenNthCalledWith(2, 'bai-01', undefined);
  });
});
