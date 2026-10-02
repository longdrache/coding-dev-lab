import { describe, expect, it, vi } from 'vitest';
import { ViewsController } from './views.controller.ts';
import { clientIp } from '../common/geo.ts';

/**
 * Route đếm lượt xem là **public, fire-and-forget**: FE bắn rồi không chờ, và
 * người lạ gọi thoải mái. Ba nhánh chuẩn hoá ở controller quyết định bảng
 * `PageView` có đúng hay không:
 *
 *   - `path` không phải chuỗi → `'/'`, vì cột lưu đường dẫn và FE sẽ vẽ trang
 *     bị trắng nếu nhận `undefined`;
 *   - `userId` chỉ nhận **số** — client gửi chuỗi thì ghi `null` chứ không ép kiểu,
 *     vì `userId` nối tới bảng `User` và số bịa sẽ làm hỏng truy vấn;
 *   - `visitorId` chỉ nhận chuỗi, dùng để gộp khách chưa đăng nhập.
 *
 * IP được băm (`hashIp`) trước khi ghi — test chốt lại việc **không** ghi IP thô.
 */

function makeController() {
  const views = {
    track: vi.fn().mockResolvedValue(undefined),
    hashIp: vi.fn((ip: string) => `hash(${ip})`),
  };
  return { ctrl: new ViewsController(views as never), views };
}

const req = (headers: Record<string, string | string[] | undefined> = {}, ip?: string) =>
  ({ headers, ip }) as never;

describe('POST /api/views/track — chuẩn hoá đầu vào', () => {
  it('đủ trường thì chuyển xuống service nguyên vẹn', async () => {
    const { ctrl, views } = makeController();
    expect(await ctrl.track(req({ host: 'go-code.vercel.app' }, '203.0.113.7'), {
      path: '/premium',
      userId: 7,
      visitorId: 'v-1',
    })).toEqual({ ok: true });
    expect(views.track).toHaveBeenCalledWith(
      'hash(203.0.113.7)',
      '/premium',
      7,
      'v-1',
      { host: 'go-code.vercel.app' },
      '203.0.113.7',
    );
  });

  // IP phải đi qua `hashIp` trước khi ghi: bảng `PageView` lưu lượt xem của
  // hàng triệu người, lưu IP thô là rò dữ liệu định vị.
  it('IP luôn được băm, không ghi bản thô', async () => {
    const { ctrl, views } = makeController();
    await ctrl.track(req({}, '203.0.113.7'), { path: '/' });
    expect(views.hashIp).toHaveBeenCalledWith('203.0.113.7');
    expect(views.track).toHaveBeenCalledWith('hash(203.0.113.7)', '/', null, undefined, {}, '203.0.113.7');
  });

  it('`path` không phải chuỗi thì ghi `/` chứ không `undefined`', async () => {
    const { ctrl, views } = makeController();
    for (const path of [undefined, null, 42, { a: 1 }]) {
      await ctrl.track(req(), { path: path as never });
    }
    for (const call of views.track.mock.calls) expect(call[1]).toBe('/');
  });

  it('`path` chuỗi rỗng thì vẫn ghi chuỗi rỗng — không âm thầm đổi thành `/`', async () => {
    const { ctrl, views } = makeController();
    await ctrl.track(req(), { path: '' });
    expect(views.track).toHaveBeenCalledWith('hash(unknown)', '', null, undefined, {}, 'unknown');
  });

  // `userId` là chuỗi "7" thì ghi `null`: nối chuỗi vào cột khóa ngoại kiểu số sẽ
  // hỏng truy vấn, còn ghi null thì coi như khách chưa đăng nhập.
  it('`userId` là chuỗi thì ghi null, không ép sang số', async () => {
    const { ctrl, views } = makeController();
    await ctrl.track(req(), { userId: '7' });
    expect(views.track.mock.calls[0]![2]).toBeNull();
  });

  it('`userId` số 0 vẫn là số — ép falsy thành null là mất người dùng thật', async () => {
    const { ctrl, views } = makeController();
    await ctrl.track(req(), { userId: 0 });
    expect(views.track.mock.calls[0]![2]).toBe(0);
  });

  it('`visitorId` không phải chuỗi thì bỏ trống', async () => {
    const { ctrl, views } = makeController();
    await ctrl.track(req(), { visitorId: 42 });
    expect(views.track.mock.calls[0]![3]).toBeUndefined();
  });

  it('IP lấy theo đúng thứ tự: `x-forwarded-for` → `req.ip`', async () => {
    const { ctrl, views } = makeController();
    await ctrl.track(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, '10.0.0.1'), {});
    expect(views.hashIp).toHaveBeenCalledWith('203.0.113.7');
    await ctrl.track(req({}, '198.51.100.4'), {});
    expect(views.hashIp).toHaveBeenLastCalledWith('198.51.100.4');
  });

  it('IP lấy đúng như `clientIp` dùng chung với controller khác', async () => {
    const { ctrl, views } = makeController();
    const headers = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };
    await ctrl.track(req(headers, '10.0.0.1'), {});
    expect(views.hashIp).toHaveBeenCalledWith(clientIp(headers, '10.0.0.1'));
  });

  // Client bắn fire-and-forget nên body rỗng rất dễ xảy ra; phải ghi được lượt xem
  // mặc định chứ không ném 500.
  it('thiếu hẳn body thì ghi `/`, `userId` null, `visitorId` undefined', async () => {
    const { ctrl, views } = makeController();
    await ctrl.track(req(), undefined as never);
    expect(views.track).toHaveBeenCalledWith(
      'hash(unknown)',
      '/',
      null,
      undefined,
      {},
      'unknown',
    );
  });
});
