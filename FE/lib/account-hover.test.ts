import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_HOVER_TIMINGS,
  avatarMenu,
  createAvatarHover,
  INITIAL_AVATAR_MENU,
  isHoverPointer,
  isKeyboardFocus,
  type AvatarMenuState,
  type AvatarHoverTimings,
} from "./account";

/**
 * Rê chuột vào avatar thì dropdown tài khoản phải hiện ra. Nghe thì đơn giản,
 * nhưng nếu làm bằng CSS `:hover` thì menu **không có** đường vào bằng bàn phím
 * và không đóng được bằng `Escape`; còn nếu gắn thẳng `onMouseEnter` vào nút
 * thì menu giật lên ở mọi lần chuột đi ngang header. Vì vậy toàn bộ phần *quyết
 * định* nằm ở `createAvatarHover` — máy trạng thái với hai cái hẹn giờ — và
 * `AccountMenu.tsx` chỉ nối sự kiện DOM vào đó.
 *
 * Test chạy ở `environment: 'node'` (`vitest.config.ts`), **không có jsdom**, nên
 * không dựng được component thật. Đổi lại: mọi luật ở đây đều kiểm được trực
 * tiếp, kể cả hai khoảng trễ, và đều dùng đồng hồ giả — không có test nào ngủ
 * thật nên cả bộ chạy trong chưa đầy một giây.
 */

const MS = { open: AVATAR_HOVER_TIMINGS.openMs, close: AVATAR_HOVER_TIMINGS.closeMs };

/** Máy đếm lời gọi: mọi khẳng định bên dưới đều soi lời gọi, không soi hẹn giờ. */
function harness(timings?: Partial<AvatarHoverTimings>) {
  const calls: string[] = [];
  const hover = createAvatarHover(
    { open: () => calls.push("open"), close: () => calls.push("close") },
    { ...AVATAR_HOVER_TIMINGS, ...timings },
  );
  return { calls, hover };
}

/**
 * Controller nối với máy trạng thái thật — đúng cách `AccountMenu.tsx` nối:
 * hẹn giờ hết thì `send`, đổi trạng thái thì `sync` ngược lại.
 *
 * Riêng `wired()` mới kiểm được chỗ dễ vỡ nhất: hai nguồn mở (click và hover)
 * cùng đẩy vào một máy, và nếu nối sai thì một lần bấm sẽ ra hai lần mở.
 */
function wired() {
  const calls: string[] = [];
  let state: AvatarMenuState = INITIAL_AVATAR_MENU;
  const send = (event: Parameters<typeof avatarMenu>[1]) => {
    state = avatarMenu(state, event);
    hover.sync(state.open);
  };
  const hover = createAvatarHover({
    open: () => {
      calls.push("open");
      send({ type: "OPEN_FROM_HOVER" });
    },
    close: () => {
      calls.push("close");
      send({ type: "CLOSE_FROM_HOVER" });
    },
  });
  return { calls, hover, send, get state() { return state; } };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("khoảng trễ khi rê chuột", () => {
  it("rê vào thì CHƯA mở ngay, đủ khoảng chờ mới mở", () => {
    const { calls, hover } = harness();
    hover.enterRegion();

    /* Trễ một phần tăm giây: nếu triển khai mở tức thì (hoặc trễ 50ms) test này
     * vẫn xanh — nên phải soi đúng sát mốc của khoảng trễ đã chọn. */
    vi.advanceTimersByTime(MS.open - 1);
    expect(calls, "menu mở sớm hơn khoảng chờ đã chọn").toEqual([]);

    vi.advanceTimersByTime(1);
    expect(calls, "hết khoảng chờ mà menu chưa mở").toEqual(["open"]);
  });

  it("rê ra thì CHƯA đóng ngay, đủ khoảng chờ mới đóng", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    expect(calls).toEqual(["open"]);

    hover.leaveRegion();
    vi.advanceTimersByTime(MS.close - 1);
    expect(calls, "menu biến mất trước khi con trỏ kịp đi vào dropdown").toEqual(["open"]);

    vi.advanceTimersByTime(1);
    expect(calls, "hết khoảng chờ mà menu chưa đóng").toEqual(["open", "close"]);
  });

  it("hai khoảng trễ khác nhau, và khoảng trễ đóng dài hơn khoảng trễ mở", () => {
    /* Một con số dùng chung là dấu hiệu gộp hai ý định khác nhau: mở thì phải
     * chịu ngựa cho lướt chuột đi ngang, đóng thì phải chờ con trỏ đi tới
     * dropdown. Ghép chung thì hoặc giật khi rê ngang mép, hoặc không dám đóng. */
    expect(MS.open).not.toBe(MS.close);
    expect(MS.close).toBeGreaterThan(MS.open);

    /* Đường đi thật từ mép trái avatar tới mép trái dropdown là khoảng 204px
     * ngang và 8px dọc (avatar 36px, panel bắt đầu ở `top-11`). Ở tốc độ chuột
     * có ý thức (~700px/s) đó là ~300ms, nên khoảng trễ đóng phải dài hơn thế. */
    expect(MS.close).toBeGreaterThanOrEqual(300);
  });

  it("rê vào rồi đi ra ngay (quá ngắn) thì không bao giờ mở", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open - 1);
    hover.leaveRegion();
    vi.advanceTimersByTime(5_000);
    expect(calls, "lướt chuột qua header vẫn làm mở menu").toEqual([]);
  });
});

describe("vùng an toàn: avatar và dropdown là một khối", () => {
  it("rê ra rồi quay lại trước khi hết khoảng chờ đóng thì KHÔNG đóng", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    hover.leaveRegion();

    /* Quay lại giữa chừng: đây là người dùng chỉ lướt qua mép rồi định vào. */
    vi.advanceTimersByTime(MS.close - 100);
    hover.enterRegion();
    vi.advanceTimersByTime(MS.close);
    expect(calls, "menu đóng dù con trỏ đã quay lại vùng").toEqual(["open"]);
  });

  it("rê ra nhưng kéo chuột vào dropdown thì không đóng", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);

    /* Một lần `enterRegion` duy nhất phủ **cả** avatar lẫn panel: ở
     * `AccountMenu.tsx` thẻ bọc chứa cả hai, nên rê từ avatar xuống dropdown
     * không sinh ra `leaveRegion` nào cả. Ở đây ta mô phỏng đúng cái đó: có
     * một lần rời đi (qua khe 8px giữa mép dưới avatar và mép trên panel) rồi
     * vào lại ngay — khe đó là lý do khoảng trễ đóng phải dài. */
    hover.leaveRegion();
    vi.advanceTimersByTime(50);
    hover.enterRegion();
    vi.advanceTimersByTime(5_000);
    expect(calls, "bấm nút trong dropdown sẽ trượt mất vì menu tự đóng").toEqual(["open"]);
  });

  it("khoảng trễ đóng đủ dài để qua khe 8px mà không giật", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    hover.leaveRegion();

    /* Người dùng bàn phím không cần khe này, nhưng người dùng chuột thì có:
     * panel nằm ở `top-11` còn avatar cao 36px. 120ms là thời gian đi qua khe
     * một cách có ý thức, và rất dễ dưới 300ms — nên bỏ khoảng trễ đi là đỏ. */
    vi.advanceTimersByTime(120);
    hover.enterRegion();
    vi.advanceTimersByTime(5_000);
    expect(calls, "rê qua khe giữa avatar và dropdown làm menu giật").toEqual(["open"]);
  });
});

describe("click vẫn phải đúng khi hover đang mở", () => {
  it("bấm khi hover đang mở thì ĐÓNG, không phải mở tiếp", () => {
    const w = wired();
    w.hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    expect(w.state.open).toBe(true);

    w.send({ type: "TOGGLE" });
    expect(w.state.open, "bấm lần hai phải đóng").toBe(false);
  });

  it("con trỏ vẫn đứng trên avatar sau khi bấm đóng thì menu KHÔNG tự mở lại", () => {
    const w = wired();
    w.hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    w.send({ type: "TOGGLE" });

    /* Không có `enterRegion` mới — chuột không rời avatar. Nếu controller tự
     * mở lại ở đây thì nút bấm một lần mà menu cứ nhấp nháy. */
    vi.advanceTimersByTime(5_000);
    expect(w.state.open, "menu tự mở lại dù chuột chưa rời avatar").toBe(false);
    expect(w.calls).toEqual(["open"]);
  });

  it("menu mở bằng click thì rê ra KHÔNG tự đóng (không đổi hành vi cũ)", () => {
    const w = wired();
    w.send({ type: "TOGGLE" });
    expect(w.state.open).toBe(true);

    /* Trước đây menu mở bằng click chỉ đóng khi bấm ra ngoài, Escape, Tab hoặc
     * đổi trang. Nếu rê ra cũng đóng thì người dùng bấm xem rồi đưa chuột xuống
     * đọc trang sẽ bị mất menu. */
    w.hover.leaveRegion();
    vi.advanceTimersByTime(5_000);
    expect(w.state.open, "menu mở bằng click bị đóng khi rê ra").toBe(true);
    expect(w.calls).toEqual([]);
  });

  it("bấm nút avatar giữa lúc hẹn mở thì không mở trùng lên hai lần", () => {
    const w = wired();
    w.hover.enterRegion();
    vi.advanceTimersByTime(MS.open - 100);
    w.send({ type: "TOGGLE" });
    expect(w.state.open).toBe(true);

    /* Hẹn mở còn treo: tới mốc nó sẽ gọi `open` lần nữa dù menu đã mở. */
    vi.advanceTimersByTime(MS.open);
    expect(w.calls, "một lần bấm mà mở hai lần").toEqual([]);
  });

  it("Escape thì đóng và trả focus về nút avatar", () => {
    const w = wired();
    w.hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    expect(w.state.open).toBe(true);

    w.send({ type: "ESCAPE" });
    expect(w.state).toEqual({ open: false, returnFocus: true });
  });

  it("Escape xong thì không có hẹn nào tự mở lại menu", () => {
    const w = wired();
    w.hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    w.send({ type: "ESCAPE" });

    /* Escape được xử lý bởi tay bàn phím, không phải bởi hẹn hover, nên sau đó
     * không được còn cái hẹn nào treo. Không có assert này thì `Escape` và
     * `CLOSE_FROM_HOVER` tranh nhau: cái nào chạy trước thì thắng. */
    vi.advanceTimersByTime(5_000);
    expect(w.state.open, "menu tự mở lại sau khi đã Escape").toBe(false);
    expect(w.calls).toEqual(["open"]);
  });

  it("sau Escape, rê chuột vào lại thì hover vẫn mở như bình thường", () => {
    const w = wired();
    w.hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    w.send({ type: "ESCAPE" });

    /* Rê ra rồi rê lại là một lượt hover mới, nên phải mở. Cấm vĩnh viễn sau
     * Escape sẽ biến tính năng thành chỉ dùng được một lần. */
    w.hover.leaveRegion();
    w.hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    expect(w.state.open).toBe(true);
  });
});

describe("bàn phím và chạm: click là đường dùng được duy nhất", () => {
  it("chạm không mở menu bằng hover", () => {
    expect(isHoverPointer("mouse")).toBe(true);
    expect(isHoverPointer("touch")).toBe(false);
    expect(isHoverPointer("pen")).toBe(false);
    expect(isHoverPointer(undefined)).toBe(false);
  });

  it("bấm kiểu chạm lâu: mở bằng click rồi không bị đóng ngay", () => {
    const w = wired();

    /* Chạm sinh `pointerenter` (`pointerType` = "touch") trước `click`. Vì
     * `isHoverPointer` chặn nên không có hẹn mở nào; `click` nổ sau 400ms
     * (người dùng ấn giữ) vẫn chỉ mở đúng một lần. */
    if (isHoverPointer("touch")) w.hover.enterRegion();
    vi.advanceTimersByTime(400);
    w.send({ type: "TOGGLE" });
    expect(w.state.open).toBe(true);
    expect(w.calls, "chạm mở menu hai lần").toEqual([]);
  });

  it("focus bàn phím mở dropdown ngay, không chờ khoảng trễ của hover", () => {
    /* Chờ 250ms ở đường bàn phím không phải "phong cách", đó là treo máy. */
    expect(avatarMenu(INITIAL_AVATAR_MENU, { type: "FOCUS" })).toEqual({
      open: true,
      returnFocus: false,
    });
    const opened = avatarMenu(INITIAL_AVATAR_MENU, { type: "FOCUS" });
    expect(avatarMenu(opened, { type: "FOCUS" }), "focus hai lần phải là một").toBe(opened);
  });

  it("focus do chuột gây ra thì không mở", () => {
    const khop = (kq: boolean) => ({ matches: () => kq });
    expect(isKeyboardFocus(khop(true)), "Tab tới nút phải mở menu").toBe(true);
    expect(isKeyboardFocus(khop(false)), "bấm chuột vào nút mà focus cũng mở menu").toBe(false);
    expect(isKeyboardFocus(null)).toBe(false);
  });

  it("trình duyệt không biết :focus-visible thì bỏ qua, không ném lỗi", () => {
    const la = {
      matches: (s: string) => {
        throw new Error(`khong ho tro: ${s}`);
      },
    };
    expect(isKeyboardFocus(la)).toBe(false);
  });
});

describe("giới hạn tần suất khi người dùng chỉ dùng chuột", () => {
  it("mở bằng hover, đóng, quay lại ngay thì KHÔNG mở lần nữa", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    hover.leaveRegion();
    vi.advanceTimersByTime(MS.close);
    expect(calls).toEqual(["open", "close"]);

    /* Người dùng chỉ dùng chuột và đi ngang header sẽ quét lên quét xuống liên
     * tục. Không có khoảng nghỉ này thì mỗi lượt quét lại mở một dropdown. */
    hover.enterRegion();
    vi.advanceTimersByTime(5_000);
    expect(calls, "quét lại header mở dropdown ngay lập tức").toEqual(["open", "close"]);
  });

  it("hết khoảng nghỉ thì rê vào lại vẫn mở", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    hover.leaveRegion();
    vi.advanceTimersByTime(MS.close);

    vi.advanceTimersByTime(AVATAR_HOVER_TIMINGS.cooldownMs);
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    expect(calls).toEqual(["open", "close", "open"]);
  });

  it("đóng bằng click thì không bị tính vào khoảng nghỉ", () => {
    const { calls, hover } = harness();
    const state = avatarMenu(INITIAL_AVATAR_MENU, { type: "TOGGLE" });
    hover.sync(state.open);
    hover.sync(false);

    /* Người dùng chủ động bấm tắt rồi bấm lại là muốn xem menu — trừng phạt họ
     * bằng khoảng nghỉ của hover là sai. */
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    expect(calls).toEqual(["open"]);
  });
});

describe("hover mở thì không được cướp focus", () => {
  it("menu do hover mở thì không lấy focus vào mục đầu", () => {
    const { hover } = harness();
    expect(hover.openedByHover(), "trước khi mở gì cũng chưa phải do hover").toBe(false);

    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    expect(hover.openedByHover()).toBe(true);
  });

  it("menu do click hoặc bàn phím mở thì vẫn lấy focus như cũ", () => {
    const { hover } = harness();
    hover.sync(true);
    expect(hover.openedByHover(), "menu mở bằng click không được đánh dấu là hover").toBe(false);
  });

  it("đóng xong thì cờ hover rơi về false", () => {
    const { hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    hover.sync(false);
    expect(hover.openedByHover()).toBe(false);
  });
});

describe("huỷ hẹn giờ", () => {
  it("bỏ component đi thì hẹn mở cũng phải chết theo", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    hover.dispose();
    vi.advanceTimersByTime(5_000);
    expect(calls, "setState sau khi component đã unmount").toEqual([]);
  });

  it("bỏ component đi thì hẹn đóng cũng phải chết theo", () => {
    const { calls, hover } = harness();
    hover.enterRegion();
    vi.advanceTimersByTime(MS.open);
    hover.leaveRegion();
    hover.dispose();
    vi.advanceTimersByTime(5_000);
    expect(calls).toEqual(["open"]);
  });
});
