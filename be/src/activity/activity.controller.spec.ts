import { describe, expect, it, vi } from 'vitest';
import { ActivityController } from './activity.controller.ts';

/**
 * Bản đồ hoạt động là thứ **đếm theo ngày theo quốc gia**, nên IP lấy sai thì mỗi
 * người dùng một vị trí. Controller là nơi duy nhất biết đâu là IP thật, và logic
 * đó có ba tầng fallback — thứ tự đó chính là hợp đồng:
 *
 *   `x-forwarded-for` → `req.ip` → `'unknown'`.
 *
 * `x-forwarded-for` là danh sách nối bởi proxy: `client, proxy1, proxy2`, nên phải
 * lấy **phần tử đầu tiên**. Lấy phần tử cuối thì mọi người dùng sau Vercel đều
 * thành cùng một "người".
 */

function makeController() {
  const activity = {
    recordLogin: vi.fn().mockResolvedValue({ day: 1, count: 1 }),
    recordRun: vi.fn().mockResolvedValue({ day: 1, runs: 1 }),
    getMap: vi.fn().mockResolvedValue({ day: 1 }),
  };
  return { ctrl: new ActivityController(activity as never), activity };
}

/** `req` của `AuthGuard`: `userId` là **chuỗi** trong claim token. */
function req(
  userId: unknown = '7',
  headers?: Record<string, string | string[] | undefined>,
  ip?: string,
) {
  return { user: { userId }, headers, ip } as never;
}

describe('POST /api/activity/login — IP và quốc gia', () => {
  it('lấy phần tử đầu của `x-forwarded-for`, tức IP thật của trình duyệt', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, '10.0.0.1'));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, {
      ip: '203.0.113.7',
      country: undefined,
    });
  });

  it('`x-forwarded-for` có khoảng trắng thì cắt sạch', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7', { 'x-forwarded-for': '  203.0.113.7 , 10.0.0.1 ' }));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, expect.objectContaining({ ip: '203.0.113.7' }));
  });

  // Header lặp (proxy nối chồng) thì Node đưa vào mảng; phải lấy phần tử đầu.
  it('header dạng mảng thì lấy phần tử đầu', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7', { 'x-forwarded-for': ['203.0.113.9', '10.0.0.1'] }));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, expect.objectContaining({ ip: '203.0.113.9' }));
  });

  it('không có header thì lùi về `req.ip`', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7', {}, '198.51.100.4'));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, expect.objectContaining({ ip: '198.51.100.4' }));
  });

  // Không có cả hai thì phải ghi `'unknown'` chứ không `undefined` — cột `ip`
  // không nullable, ghi undefined sẽ nổ ở tầng DB.
  it('không có cả hai thì ghi `unknown`', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7'));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, expect.objectContaining({ ip: 'unknown' }));
  });

  it('`x-vercel-ip-country` chuyển thẳng thành quốc gia', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7', { 'x-vercel-ip-country': 'VN' }));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, { ip: 'unknown', country: 'VN' });
  });

  it('quốc gia dạng mảng thì lấy phần tử đầu', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7', { 'x-vercel-ip-country': ['VN', 'US'] }));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, expect.objectContaining({ country: 'VN' }));
  });

  // Local không có header Vercel: `undefined` là "chưa biết", và service tự lo —
  // đổi thành chuỗi rỗng thì mọi người ở local gộp vào một quốc gia rỗng.
  it('local không có header Vercel thì country là undefined', async () => {
    const { ctrl, activity } = makeController();
    await ctrl.login(req('7'));
    expect(activity.recordLogin).toHaveBeenCalledWith(7, expect.objectContaining({ country: undefined }));
  });

  it('trả `{ map }` từ service', async () => {
    const { ctrl } = makeController();
    expect(await ctrl.login(req('7'))).toEqual({ map: { day: 1, count: 1 } });
  });
});

describe('POST /api/activity/run và GET /api/activity/me', () => {
  it('run ép userId thành số', async () => {
    const { ctrl, activity } = makeController();
    expect(await ctrl.run(req('7'))).toEqual({ map: { day: 1, runs: 1 } });
    expect(activity.recordRun).toHaveBeenCalledWith(7);
  });

  it('me ép userId thành số', async () => {
    const { ctrl, activity } = makeController();
    expect(await ctrl.me(req('42'))).toEqual({ map: { day: 1 } });
    expect(activity.getMap).toHaveBeenCalledWith(42);
  });
});
