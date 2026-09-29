import { describe, expect, it } from "vitest";
import {
  AVATAR_FALLBACK,
  avatarMenu,
  avatarSource,
  firstLetterOf,
  GENERIC_GREETING,
  greetingName,
  INITIAL_AVATAR_MENU,
  isOutside,
  safeAvatarUrl,
  type AvatarMenuEvent,
  type AvatarMenuState,
} from "./account";

/**
 * Mọi test ở đây nhắm vào một dòng cụ thể của `account.ts`. Xem mục "Bằng chứng
 * mutation" trong `frontend-avatar-report.md`: hỏng dòng được nhắm thì test phải đỏ.
 */
const USER = {
  id: 2,
  email: "inhlongnguyen@gmail.com",
  name: "Long Nguyen",
  role: "vip",
  avatarUrl: null,
} as const;

describe("firstLetterOf", () => {
  it("lấy chữ cái đầu, viết hoa", () => {
    expect(firstLetterOf("Long Nguyen")).toBe("L");
  });

  it("trả null khi không có chữ cái nào để lấy", () => {
    expect(firstLetterOf("")).toBeNull();
    expect(firstLetterOf("   ")).toBeNull();
    expect(firstLetterOf(null)).toBeNull();
    expect(firstLetterOf(undefined)).toBeNull();
  });

  // ĐÂY LÀ LỖI GỐC. `charAt(0)` cắt đôi cặp thay thế nên với tên bắt đầu bằng
  // emoji sẽ ra MỘT nửa ký tự không hợp lệ => trình duyệt vẽ ô vuông tofu.
  // Bỏ nhánh `continue` cho ký tự không phải chữ cái là test này đỏ.
  it("bỏ qua emoji ở đầu thay vì cắt cặp thay thế", () => {
    expect(firstLetterOf("😀 Bob")).toBe("B");
  });

  it("bỏ qua dấu kết hợp ở đầu", () => {
    expect(firstLetterOf("́An")).toBe("A");
  });

  // `normalize("NFC")`: Google trả tên dạng NFD thì "ễ" là 3 code point
  // ("e" + U+0303 + U+0301). Không chuẩn hoá thì ra "E" mất dấu.
  //
  // Chuỗi đầu vào dựng bằng escape chứ **không** viết thẳng "ễ Lan": viết thẳng
  // thì file lưu sẵn dạng NFC và `normalize` thành no-op, test vẫn xanh dù đã
  // xoá hẳn dòng chuẩn hoá. Mutation M3 đã bắt đúng lỗi này. Dòng assert
  // `not.toBe` bên dưới là tiền đề: nếu ai đó lỡ sửa lại encoding thì test báo
  // ngay thay vì âm thầm mất tác dụng.
  it("chuẩn hoá NFD về NFC trước khi lấy chữ", () => {
    const nfd = "\u0065\u0302\u0303 Lan";
    expect(nfd).not.toBe(nfd.normalize("NFC"));
    expect(firstLetterOf(nfd)).toBe("\u1EC4");
  });

  // `toUpperCase()` của "ß" ra "SS" — 2 ký tự, làm vỡ hình tròn.
  it("giữ đúng một ký tự khi chữ hoá sinh ra nhiều hơn một", () => {
    expect(firstLetterOf("ßeta")).toBe("S");
  });
});

describe("safeAvatarUrl", () => {
  it("giữ nguyên URL https kèm chữ ký của Google", () => {
    const u = "https://lh3.googleusercontent.com/a/ACg8oc-x=w96-h96";
    expect(safeAvatarUrl(u)).toBe(u);
  });

  it("chặn scheme không phải http(s)", () => {
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeAvatarUrl("data:image/svg+xml,<svg/>")).toBeNull();
  });

  it("trả null khi rỗng hoặc sai kiểu", () => {
    expect(safeAvatarUrl("   ")).toBeNull();
    expect(safeAvatarUrl(null)).toBeNull();
    expect(safeAvatarUrl(42)).toBeNull();
    expect(safeAvatarUrl("không phải url")).toBeNull();
  });
});

describe("avatarSource", () => {
  it("ưu tiên ảnh thật khi có avatarUrl", () => {
    expect(avatarSource({ ...USER, avatarUrl: "https://lh3.googleusercontent.com/a/x=w96" })).toEqual(
      { kind: "image", src: "https://lh3.googleusercontent.com/a/x=w96", alt: "" },
    );
  });

  it("rơi về chữ cái đầu của name khi không có ảnh", () => {
    expect(avatarSource(USER)).toEqual({ kind: "initial", letter: "L" });
  });

  // `name` NULL là chuyện thường với tài khoản Google (BE lưu `raw.name ?? null`).
  // Chuỗi cũ rơi tiếp xuống email nên ra "I" — một nét dọc trông như ký tự vỡ.
  it("không lấy chữ cái đầu của email làm chữ cái đại diện", () => {
    expect(avatarSource({ ...USER, name: null })).toEqual({
      kind: "initial",
      letter: AVATAR_FALLBACK,
    });
  });

  it("rơi về dấu hỏi khi không có cả ảnh lẫn tên", () => {
    expect(avatarSource({ ...USER, name: null })).toEqual({
      kind: "initial",
      letter: AVATAR_FALLBACK,
    });
    expect(avatarSource(null)).toEqual({ kind: "initial", letter: AVATAR_FALLBACK });
  });

  it("bỏ qua avatarUrl sai kiểu thay vì vỡ ảnh", () => {
    expect(avatarSource({ ...USER, avatarUrl: "javascript:alert(1)" })).toEqual({
      kind: "initial",
      letter: "L",
    });
  });
});

describe("greetingName", () => {
  it("dùng tên khi có", () => {
    expect(greetingName(USER)).toBe("Long Nguyen");
  });

  it("lấy phần trước @ của email khi name rỗng", () => {
    expect(greetingName({ ...USER, name: null })).toBe("inhlongnguyen");
    expect(greetingName({ ...USER, name: "   " })).toBe("inhlongnguyen");
  });

  it("chào chung khi không có gì để gọi", () => {
    expect(greetingName({ ...USER, name: null, email: "" })).toBe(GENERIC_GREETING);
  });
});

describe("avatarMenu", () => {
  const open = (): AvatarMenuState => avatarMenu(INITIAL_AVATAR_MENU, { type: "TOGGLE" });

  it("mở rồi đóng khi bấm avatar lần hai", () => {
    expect(open()).toEqual({ open: true, returnFocus: false });
    expect(avatarMenu(open(), { type: "TOGGLE" })).toEqual({ open: false, returnFocus: false });
  });

  // Dễ sót nhất: dropdown lơ lửng theo header sẽ đè lên trang mới.
  it("đóng khi đổi trang", () => {
    expect(avatarMenu(open(), { type: "ROUTE_CHANGED" })).toEqual({
      open: false,
      returnFocus: false,
    });
  });

  it("đóng khi bấm ra ngoài", () => {
    expect(avatarMenu(open(), { type: "OUTSIDE_POINTER_DOWN" })).toEqual({
      open: false,
      returnFocus: false,
    });
  });

  // Escape là cách duy nhất người dùng bàn phím dùng để thoát, nên focus phải về
  // nút avatar — nếu không thì focus rơi xuống <body> và mất định vị.
  it("Escape đóng và yêu cầu trả focus về nút avatar", () => {
    expect(avatarMenu(open(), { type: "ESCAPE" })).toEqual({ open: false, returnFocus: true });
  });

  // Đã đóng mà bấm Escape thì không được cướp focus về nút avatar.
  it("Escape khi menu đã đóng không cướp focus", () => {
    expect(avatarMenu(INITIAL_AVATAR_MENU, { type: "ESCAPE" })).toEqual(INITIAL_AVATAR_MENU);
  });

  it("bấm ra ngoài không cướp focus về nút avatar", () => {
    expect(avatarMenu(open(), { type: "OUTSIDE_POINTER_DOWN" })).toEqual({
      open: false,
      returnFocus: false,
    });
  });

  it("bấm avatar lần hai không cướp focus", () => {
    expect(avatarMenu(open(), { type: "TOGGLE" }).returnFocus).toBe(false);
  });

  it("xử lý đủ mọi loại sự kiện mà không rơi nhánh", () => {
    const events: AvatarMenuEvent[] = [
      { type: "TOGGLE" },
      { type: "ROUTE_CHANGED" },
      { type: "OUTSIDE_POINTER_DOWN" },
      { type: "ESCAPE" },
    ];
    for (const e of events) expect(avatarMenu(open(), e)).toBeDefined();
  });
});

describe("isOutside", () => {
  // Dùng `pointerdown` chứ không dùng `click`: `click` nổ trước khi handler của
  // nút bên trong kịp chạy, nên bấm "Đăng xuất" sẽ bị đóng menu rồi mới hành động.
  const container = (kids: unknown[]) => ({
    contains: (n: unknown) => kids.includes(n),
  });

  it("true khi bấm ra ngoài vùng menu", () => {
    expect(isOutside(container([]), { id: "ngoài" })).toBe(true);
  });

  it("false khi bấm vào bên trong vùng menu", () => {
    const btn = { id: "dang-xuat" };
    expect(isOutside(container([btn]), btn)).toBe(false);
  });

  it("false khi không xác định được container hoặc target", () => {
    expect(isOutside(null, { id: "x" })).toBe(false);
    expect(isOutside(container([]), null)).toBe(false);
  });
});
