import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicUser } from "./AuthProvider";
import AccountMenu from "./AccountMenu";

/**
 * Nút avatar ở header phải phản hồi khi rê chuột — nhưng nó là **nút mở
 * dropdown**, nên ba ràng buộc dưới đây là lỗi thật chứ không phải thẩm mỹ:
 *
 * 1. Gỡ `focus-visible:` đi là mù bàn phím. Test 2 so **từng** phần hover với
 *    bản `focus-visible:` của nó, nên gỡ bất kỳ phần nào cũng đỏ.
 * 2. Gỡ `motion-safe:` đi là chuyển động chạy cả với người bật giảm chuyển
 *    động của hệ điều hành. Test 3 quét mọi `scale`/`translate`/`rotate` trên
 *    nút và đòi nó phải nằm sau `motion-safe:`.
 * 3. Thêm `z-*` vào nút là nút chen vào giữa dropdown. Test 4 render trạng
 *    thái **menu đã mở** rồi so vị trí: panel `z-50` phải đứng sau nút trong
 *    DOM, và nút không được mang `z-` nào.
 *
 * `vitest.config.ts` chạy `environment: 'node'` (không jsdom) và chỉ nạp
 * `*.test.ts`, nên test render bằng `react-dom/server` — cùng cách
 * `kicker.test.ts` làm, không thêm dependency nào.
 *
 * Chỉ session và trạng thái mở/đóng được giả: `useSession` đọc context nên mà
 * không provider là `null`, còn menu luôn đóng ở state đầu. Hai thứ đó đủ để
 * render avatar VIP lẫn avatar chữ cái, và đủ để render cả dropdown.
 */

let currentUser: PublicUser | null = null;
let menuOpen = false;

vi.mock("./AuthProvider", () => ({
  useSession: () => ({ user: currentUser, loading: false, refresh: () => Promise.resolve() }),
}));

/* `INITIAL_AVATAR_MENU` là hằng, mà test cần cả hai trạng thái nên để nó đọc
 * biến ở mỗi lần render. Getter giữ nguyên phần còn lại của module thật. */
vi.mock("@/lib/account", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/account")>();
  return {
    ...real,
    get INITIAL_AVATAR_MENU() {
      return { open: menuOpen, returnFocus: false };
    },
  };
});

const VIP: PublicUser = {
  id: 1,
  email: "inhlongnguyen@gmail.com",
  name: "Inh",
  role: "vip",
  avatarUrl: "https://lh3.googleusercontent.com/a/avatar",
};

const KHACH: PublicUser = { ...VIP, role: "user", avatarUrl: null };

/** Render `AccountMenu` thật, không dựng DOM giả. */
function render(user: PublicUser, open = false): string {
  currentUser = user;
  menuOpen = open;
  return renderToStaticMarkup(createElement(AccountMenu));
}

/** Thẻ mở đầu `<button>` đầu tiên — nút avatar. */
function buttonTag(html: string): string {
  const at = html.indexOf("<button");
  expect(at, "không render ra nút avatar").toBeGreaterThanOrEqual(0);
  return html.slice(at, html.indexOf(">", at) + 1);
}

/** Toàn bộ phần bên trong nút avatar, kể cả badge VIP. */
function buttonHtml(html: string): string {
  const start = html.indexOf("<button");
  const end = html.indexOf("</button>");
  expect(start, "không render ra nút avatar").toBeGreaterThanOrEqual(0);
  expect(end, "nút avatar chưa đóng").toBeGreaterThan(start);
  return html.slice(start, end);
}

function classesOf(tag: string): string[] {
  const m = /class="([^"]*)"/.exec(tag);
  return m ? m[1].split(/\s+/) : [];
}

/** Lớp của nút avatar, dạng mảng để so và quét. */
function avatarClasses(html: string): string[] {
  return classesOf(buttonTag(html));
}

/** Bỏ vỏ `motion-safe:` — nó chỉ là điều kiện media, không phải phần hiệu ứng. */
function withoutMotionSafe(cls: string): string {
  return cls.startsWith("motion-safe:") ? cls.slice("motion-safe:".length) : cls;
}

/** Phần hiệu ứng đứng sau `variant:`, hoặc `null` nếu lớp không mang variant đó. */
function under(cls: string, variant: string): string | null {
  const bare = withoutMotionSafe(cls);
  return bare.startsWith(`${variant}:`) ? bare.slice(variant.length + 1) : null;
}

describe("nút avatar ở header", () => {
  it("có đủ ba kênh phản hồi: rê chuột, bàn phím, và chạm", () => {
    /* Tên lớp ở đây là hợp đồng: chúng đến từ class thật của component, nên
     * đổi tên lớp trong component mà không sửa test này là test đỏ. */
    expect(avatarClasses(render(VIP))).toEqual(
      expect.arrayContaining([
        "transition-transform",
        "hover:ring-2",
        "hover:ring-zinc-900/30",
        "hover:ring-offset-2",
        "focus-visible:ring-2",
        "focus-visible:ring-zinc-900/30",
        "focus-visible:ring-offset-2",
        "motion-safe:hover:scale-105",
        "motion-safe:focus-visible:scale-105",
        "motion-safe:active:scale-95",
      ]),
    );
  });

  it("mọi phần hover đều có bản focus-visible y hệt", () => {
    const cls = avatarClasses(render(VIP));
    const cua = (variant: string, bo: string[] = []) =>
      new Set(
        cls
          .map((c) => under(c, variant))
          .filter((c): c is string => c !== null && !bo.includes(c)),
      );

    /* `outline-none` không phải hiệu ứng, nó là việc tắt viền mặc định của
     * trình duyệt — ring focus đã thay thế chỗ đó. */
    const hover = cua("hover");
    const focusVisible = cua("focus-visible", ["outline-none"]);

    /* Chặn test rỗng: xoá sạch hover thì `hover` rỗng và phép so bằng nhau
     * vẫn xanh — phải đòi nó có ít nhất một phần. */
    expect(hover.size, "nút không còn phản hồi khi rê chuột").toBeGreaterThan(0);
    expect([...hover].sort(), "hover và focus-visible lệch nhau").toEqual(
      [...focusVisible].sort(),
    );
  });

  it("cú nâng chỉ chạy khi người dùng không bật giảm chuyển động", () => {
    const cls = avatarClasses(render(VIP));
    const bienDoiHinhThe = /^(scale|translate|rotate|skew)-/;
    const coMotionSafe = cls.filter((c) => c.startsWith("motion-safe:"));
    const khongMotionSafe = cls.filter(
      (c) => !c.startsWith("motion-safe:") && bienDoiHinhThe.test(withoutMotionSafe(c)),
    );

    expect(coMotionSafe, "nút không còn cú nâng nào").not.toEqual([]);
    expect(khongMotionSafe, "biến đổi hình dạng chạy cả khi giảm chuyển động").toEqual([]);
  });

  it("menu mở lên trên nút, nút không cạnh tranh z-index với dropdown", () => {
    const html = render(VIP, true);
    const panel = /<div[^>]*role="menu"[^>]*>/.exec(html);
    expect(panel, "menu không mở được để test stacking").not.toBeNull();

    const panelClasses = classesOf(panel ? panel[0] : "");
    expect(panelClasses).toEqual(expect.arrayContaining(["absolute", "z-50"]));
    expect(html.indexOf("role=\"menu\"")).toBeGreaterThan(html.indexOf("<button"));

    /* `scale` tạo stacking context cho nút; nó vẫn nằm dưới panel vì panel
     * `z-50`. Nếu ai đó thêm `z-*` vào nút thì mới thật sự giành chỗ. */
    expect(
      avatarClasses(html).filter((c) => /^z-/.test(c)),
      "nút avatar có z-index cạnh tranh dropdown",
    ).toEqual([]);

    /* Bọc cả nút lẫn panel: scale ở đây sẽ kéo cả dropdown đi theo. */
    const wrapperTag = /<div[^>]*>/.exec(html);
    expect(wrapperTag, "không tìm thấy thẻ bọc nút và panel").not.toBeNull();
    const wrapper = classesOf(wrapperTag ? wrapperTag[0] : "");
    /* `relative` chứng minh là đúng thẻ bọc cần tìm, chứ không phải thẻ nào
     * khác — nếu không thì phép so bên dưới xanh vì so với danh sách rỗng. */
    expect(wrapper).toContain("relative");
    expect(wrapper.filter((c) => /^(z-|scale|translate|rotate)-/.test(c))).toEqual([]);
  });

  it("hiệu ứng không đổi kích thước, và badge VIP đi cùng avatar", () => {
    const cls = avatarClasses(render(VIP));
    expect(cls.filter((c) => /^(size|w|h|min-|max-)-/.test(c))).toEqual(["size-9"]);

    /* Badge nằm *trong* nút nên cú nâng kéo cả badge: avatar và badge giữ nguyên
     * quan hệ với nhau, và vẫn còn đúng một kích thước để so với badge VIP ở
     * header. */
    expect(buttonHtml(render(VIP)), "badge VIP không còn nằm trong nút").toMatch(/-bottom-1/);
  });

  it("ảnh vẫn alt rỗng và nút vẫn tự mô tả — screen reader không đọc trùng", () => {
    const html = render(VIP);
    expect(html).toMatch(/<img[^>]*alt=""/);
    const tag = buttonTag(html);
    expect(tag).toContain('aria-label="Tài khoản: inhlongnguyen@gmail.com"');
    expect(tag).toContain('aria-haspopup="menu"');
    expect(tag).toContain('aria-expanded="false"');
    expect(buttonTag(render(VIP, true))).toContain('aria-expanded="true"');
  });

  it("avatar chữ cái cũng có phản hồi, không chỉ avatar có ảnh", () => {
    const html = render(KHACH);
    expect(avatarClasses(html)).toEqual(avatarClasses(render(VIP)));
  });
});
