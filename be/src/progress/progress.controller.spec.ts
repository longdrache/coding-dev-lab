import { describe, expect, it, vi } from 'vitest';
import { ProgressController } from './progress.controller.ts';
import type { UserRole } from '../auth/auth.types.ts';

/**
 * Controller tiến độ là tầng mỏng nhất trong repo: bảy route, mỗi route chỉ ép
 * `userId` từ claim rồi gọi service. Vậy nên test ở đây tập trung vào hai chỗ
 * controller **tự** quyết định, vì đó là chỗ service không nhìn thấy:
 *
 *   1. `slug` rỗng thì trả `{ error }` **200** thay vì gọi service — đổi thành
 *      ném lỗi là FE đang đọc `body.error` sẽ hỏng im lặng;
 *   2. `role` phải đi kèm xuống `recordSolved`, vì đó là cột quyết định quyền xem
 *      đề VIP (`vip-problem.policy.ts`) — bỏ nó thì mọi người coi như không có VIP.
 */

function makeController() {
  const progress = {
    getDashboard: vi.fn().mockResolvedValue({ streak: 3 }),
    getSolvedMap: vi.fn().mockResolvedValue({ 'two-sum': true }),
    getBadges: vi.fn().mockResolvedValue([{ id: 'b1' }]),
    getFavorites: vi.fn().mockResolvedValue(['two-sum']),
    recordSolved: vi.fn().mockResolvedValue({ ok: true }),
    addFavorite: vi.fn().mockResolvedValue({ ok: true }),
    removeFavorite: vi.fn().mockResolvedValue({ ok: true }),
  };
  return { ctrl: new ProgressController(progress as never), progress };
}

/** `req.user` là điều `AuthGuard` chép vào; `userId` là **chuỗi** ở claim token. */
function req(userId: unknown = '7', role: UserRole = 'user') {
  return { user: { userId, role } } as never;
}

describe('GET /api/progress/* — ép userId từ claim', () => {
  it('mọi route đọc đều chuyển `userId` thành số', async () => {
    const { ctrl, progress } = makeController();
    expect(await ctrl.dashboard(req())).toEqual({ streak: 3 });
    expect(await ctrl.solved(req())).toEqual({ 'two-sum': true });
    expect(await ctrl.badges(req())).toEqual([{ id: 'b1' }]);
    expect(await ctrl.favorites(req())).toEqual(['two-sum']);
    expect(progress.getDashboard).toHaveBeenCalledWith(7);
    expect(progress.getSolvedMap).toHaveBeenCalledWith(7);
    expect(progress.getBadges).toHaveBeenCalledWith(7);
    expect(progress.getFavorites).toHaveBeenCalledWith(7);
  });
});

describe('POST /api/progress/solve', () => {
  it('slug hợp lệ thì truyền kèm role của claim', async () => {
    const { ctrl, progress } = makeController();
    expect(await ctrl.solve(req('7', 'vip'), { slug: ' two-sum ', difficulty: 'easy' })).toEqual({
      ok: true,
    });
    expect(progress.recordSolved).toHaveBeenCalledWith(7, 'two-sum', 'easy', 'vip');
  });

  it('thiếu `difficulty` thì gửi null chứ không `undefined`, vì service so với null', async () => {
    const { ctrl, progress } = makeController();
    await ctrl.solve(req(), { slug: 'two-sum' });
    expect(progress.recordSolved).toHaveBeenCalledWith(7, 'two-sum', null, 'user');
  });

  it('slug trống thì `{ error }` và **không** gọi service', async () => {
    const { ctrl, progress } = makeController();
    for (const body of [{ slug: '' }, { slug: '   ' }, {} as never]) {
      expect(await ctrl.solve(req(), body)).toEqual({ error: 'slug required' });
    }
    expect(progress.recordSolved).not.toHaveBeenCalled();
  });
});

describe('POST/DELETE /api/progress/favorites', () => {
  it('thêm thích truyền slug đã cắt khoảng trắng', async () => {
    const { ctrl, progress } = makeController();
    expect(await ctrl.addFavorite(req(), { slug: '  two-sum ' })).toEqual({ ok: true });
    expect(progress.addFavorite).toHaveBeenCalledWith(7, 'two-sum');
  });

  it('slug trống thì `{ error }`, không gọi service', async () => {
    const { ctrl, progress } = makeController();
    expect(await ctrl.addFavorite(req(), { slug: '  ' })).toEqual({ error: 'slug required' });
    expect(progress.addFavorite).not.toHaveBeenCalled();
  });

  // Thiếu hẳn body phải ra cùng kết quả với slug rỗng, không phải 500.
  it('thiếu hẳn body thì cũng `{ error }`', async () => {
    const { ctrl, progress } = makeController();
    expect(await ctrl.addFavorite(req(), undefined as never)).toEqual({ error: 'slug required' });
    expect(progress.addFavorite).not.toHaveBeenCalled();
  });

  it('bỏ thích lấy slug từ path, không qua body', async () => {
    const { ctrl, progress } = makeController();
    await ctrl.removeFavorite(req(), 'two-sum');
    expect(progress.removeFavorite).toHaveBeenCalledWith(7, 'two-sum');
  });
});
