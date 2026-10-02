import { describe, expect, it, vi } from 'vitest';
import { SubmissionsController } from './submissions.controller.ts';
import type { UserRole } from '../auth/auth.types.ts';

/**
 * Lịch sử nộp bài: `GET /history` và `GET /history/me` là **hai route khác nhau nhưng
 * cùng một hàm** — chúng tồn tại vì FE gọi cả hai. Test ghim rằng cả hai đều lọc
 * theo `userId` từ claim chứ không theo tham số nào trong query: nếu route lọc
 * theo id trong query thì đổi một con số là xem được lịch sử của người khác.
 *
 * `role` cũng phải đi xuống: nó quyết định bài VIP có hiện không
 * (`vip-problem.policy.ts`).
 */

function makeController() {
  const subs = {
    create: vi.fn().mockResolvedValue({ id: 1 }),
    findByUser: vi.fn().mockResolvedValue([{ id: 1 }]),
  };
  return { ctrl: new SubmissionsController(subs as never), subs };
}

function req(userId: unknown = '7', role: UserRole = 'user') {
  return { user: { userId, role } } as never;
}

describe('POST /api/history', () => {
  it('ép userId thành số và truyền kèm role', async () => {
    const { ctrl, subs } = makeController();
    const body = { slug: 'two-sum', source_code: 'x', language_id: 63 };
    expect(await ctrl.create(req('7', 'vip'), body as never)).toEqual({ id: 1 });
    expect(subs.create).toHaveBeenCalledWith(7, body, 'vip');
  });
});

describe('GET /api/history và /api/history/me', () => {
  for (const tenHop of ['GET /api/history', 'GET /api/history/me'] as const) {
    it(`${tenHop}: lọc theo userId trong claim, không theo query`, async () => {
      const { ctrl, subs } = makeController();
      const go = tenHop.endsWith('/me') ? ctrl.me : ctrl.list;
      expect(await go.call(ctrl, req('7'), undefined)).toEqual([{ id: 1 }]);
      expect(subs.findByUser).toHaveBeenCalledWith(7, undefined, 'user');
    });

    it(`${tenHop}: có slug thì lọc theo bài`, async () => {
      const { ctrl, subs } = makeController();
      const go = tenHop.endsWith('/me') ? ctrl.me : ctrl.list;
      await go.call(ctrl, req('7', 'admin'), 'two-sum');
      expect(subs.findByUser).toHaveBeenCalledWith(7, 'two-sum', 'admin');
    });
  }

  it('`slug` rỗng thì vẫn gửi xuống (service tự xử), không âm thầm đổi thành undefined', async () => {
    const { ctrl, subs } = makeController();
    await ctrl.list(req(), '');
    expect(subs.findByUser).toHaveBeenCalledWith(7, '', 'user');
  });
});
