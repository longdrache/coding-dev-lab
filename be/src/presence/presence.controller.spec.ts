import { describe, expect, it, vi } from 'vitest';
import { PresenceController } from './presence.controller.ts';

/**
 * Đếm người đang online là bộ nhớ tạm: `sessionId` do **client** tự sinh và gửi
 * lên, nên nó là dữ liệu không đáng tin. Controller phải bỏ qua giá trị rác thay vì
 * đưa vào bảng đếm — nếu không, một client gửi `sessionId` mới mỗi giây làm số
 * online phình vô hạn và trang "đang có N người học" thành vô nghĩa.
 *
 * `slice(0, 128)` cũng là chốt chặn: `sessionId` là khoá của bảng đếm, cho phép
 * chuỗi vô hạn thì một request có thể làm phình bảng.
 */

function makeController() {
  const presence = {
    heartbeat: vi.fn((sessionId: string) => new Set([sessionId])),
    leave: vi.fn(),
    count: vi.fn(() => 1),
  };
  return { ctrl: new PresenceController(presence as never), presence };
}

describe('POST /api/presence/heartbeat', () => {
  it('sessionId hợp lệ thì dùng luôn, giữ nguyên số đếm', () => {
    const { ctrl, presence } = makeController();
    expect(ctrl.heartbeat({ sessionId: 'sess-1' })).toEqual({ online: expect.any(Set), sessionId: 'sess-1' });
    expect(presence.heartbeat).toHaveBeenCalledWith('sess-1');
  });

  it('cắt sessionId dài hơn 128 ký tự', () => {
    const { ctrl, presence } = makeController();
    ctrl.heartbeat({ sessionId: 'a'.repeat(500) });
    expect(presence.heartbeat).toHaveBeenCalledWith('a'.repeat(128));
  });

  it('thiếu sessionId thì tự sinh UUID — không đếm trùng phiên không có khoá', () => {
    const { ctrl, presence } = makeController();
    const out = ctrl.heartbeat({});
    expect(presence.heartbeat).toHaveBeenCalledWith(out.sessionId);
    expect(out.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('sessionId rỗng hoặc sai kiểu thì coi như không có, tự sinh UUID', () => {
    const { ctrl, presence } = makeController();
    for (const body of [{ sessionId: '' }, { sessionId: 123 } as never, {} as never]) {
      ctrl.heartbeat(body as never);
    }
    for (const call of presence.heartbeat.mock.calls) {
      expect(call[0]).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  // POST không có body là chuyện thật (client gọi `fetch` không gửi body). Không
  // dùng `body.` mà không có `?.` thì đây là chỗ nổ 500.
  it('thiếu hẳn body thì vẫn tự sinh UUID', () => {
    const { ctrl, presence } = makeController();
    const out = ctrl.heartbeat(undefined as never);
    expect(presence.heartbeat).toHaveBeenCalledWith(out.sessionId);
  });
});

describe('POST /api/presence/leave và DELETE beacon', () => {
  it('rời phiên rồi đếm lại số đang online', () => {
    const { ctrl, presence } = makeController();
    expect(ctrl.leave({ sessionId: 'sess-1' })).toEqual({ online: 1 });
    expect(presence.leave).toHaveBeenCalledWith('sess-1');
    expect(presence.count).toHaveBeenCalled();
  });

  // Beacon của trình duyệt gửi khi đóng tab, nên body rỗng là chuyện thường — phải
  // bỏ qua chứ không xoá một phiên nào cả.
  it('sessionId rỗng thì không xoá phiên nào, chỉ đếm lại', () => {
    const { ctrl, presence } = makeController();
    expect(ctrl.leave({ sessionId: '' })).toEqual({ online: 1 });
    expect(presence.leave).not.toHaveBeenCalled();
  });

  it('thiếu hẳn body thì không xoá phiên nào', () => {
    const { ctrl, presence } = makeController();
    expect(ctrl.leave(undefined as never)).toEqual({ online: 1 });
    expect(presence.leave).not.toHaveBeenCalled();
  });

  it('DELETE beacon dùng chung đường với POST, trả cùng hình dạng', () => {
    const { ctrl, presence } = makeController();
    expect(ctrl.leaveBeacon({ sessionId: 'sess-1' })).toEqual({ online: 1 });
    expect(presence.leave).toHaveBeenCalledWith('sess-1');
  });
});

describe('GET /api/presence/online', () => {
  it('chỉ đếm, không sinh phiên mới', () => {
    const { ctrl, presence } = makeController();
    expect(ctrl.online()).toEqual({ online: 1 });
    expect(presence.heartbeat).not.toHaveBeenCalled();
  });
});
