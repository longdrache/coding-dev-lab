import type { PublicUser } from "./api";

/**
 * Toàn bộ quyết định về avatar, lời chào và trạng thái menu tài khoản nằm ở đây,
 * không nằm trong component.
 *
 * Lý do đúng y như `commitSession` trong `api.ts`: `vitest.config.ts` chạy
 * `environment: 'node'` và chỉ nhặt tệp `*.test.ts`, nên không test được component.
 * Ở trong JSX thì một dòng sai là toàn bộ test vẫn xanh; ở đây thì bỏ là đỏ.
 */

/** Ký tự dựng khi không có cả ảnh lẫn tên. */
export const AVATAR_FALLBACK = "?";

/** Lời chào chung khi không có cả tên lẫn email. */
export const GENERIC_GREETING = "Coder";

/**
 * Chỉ chấp nhận chữ cái. Mọi thứ khác — emoji, số, dấu câu, dấu kết hợp, khoảng
 * trắng — đều bị bỏ.
 *
 * Bỏ emoji là **bắt buộc**, không phải thẩm mỹ: một avatar 36px hiển thị emoji
 * sẽ tràn khung, còn nếu lấy `charAt(0)` thì ra nửa cặp thay thế và trình duyệt
 * vẽ ô vuông tofu.
 */
const LETTER = /\p{L}/u;

/**
 * Chữ cái đầu tiên **là chữ cái** trong `text`, hoặc `null`.
 *
 * `normalize("NFC")` trước khi duyệt: tên tiếng Việt gửi từ Google có thể ở dạng
 * NFD, nơi "ễ" là ba code point (`e` + U+0303 + U+0301). Không chuẩn hoá thì lấy
 * ra "E" — mất dấu. `for…of` duyệt theo **code point** chứ không phải code unit
 * như `charAt(0)`, nên không bao giờ cắt đôi một ký tự.
 *
 * `toUpperCase()` của "ß" ra "SS" (hai ký tự) làm vỡ hình tròn, nên lấy lại ký tự
 * đầu tiên của kết quả để luôn trả về đúng **một** ký tự.
 */
export function firstLetterOf(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const normalized = text.normalize("NFC").trim();
  if (!normalized) return null;
  for (const ch of normalized) {
    if (!LETTER.test(ch)) continue;
    return Array.from(ch.toUpperCase())[0] ?? null;
  }
  return null;
}

/**
 * URL ảnh đại diện an toàn, hoặc `null` để rơi về chữ cái.
 *
 * `avatarUrl` đến từ dữ liệu ngoài và BE (`normalizeAvatarUrl`,
 * `be/src/auth/auth.service.ts:103`) **không** lọc scheme — nó chỉ kiểm tra "là
 * chuỗi không rỗng". Nên chỗ kiểm tra scheme phải nằm ở FE.
 *
 * Trả về **nguyên chuỗi gốc** chứ không phải `url.toString()`: URL ảnh Google có
 * chữ ký (`=w96-h96`) và việc bộ phân tích URL sửa lại chuỗi có thể làm hỏng nó.
 */
export function safeAvatarUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

/** Nguồn để vẽ avatar. */
export type AvatarSource =
  | {
      kind: "image";
      src: string;
      /**
       * Cố ý **rỗng**: nút avatar đã có `aria-label` ("Tài khoản: …") nên ảnh
       * bên trong là trang trí. `alt` đầy đủ ở đây sẽ khiến screen reader đọc
       * tên nút hai lần. Xem `AccountMenu.tsx` cho chỗ dùng.
       */
      alt: string;
    }
  | { kind: "initial"; letter: string };

/**
 * Ảnh thật → chữ cái đầu của `name` → `?`.
 *
 * **Không** rơi tiếp xuống email như bản cũ. Đó chính là lỗi gốc: tài khoản
 * Google không đặt tên hiển thị thì `name` là `NULL` (BE lưu `raw.name ?? null`),
 * và chuỗi cũ lấy chữ đầu của email — với `inhlongnguyen@gmail.com` ra `"I"`, mà
 * Inter Bold vẽ "I" thành một nét dọc trần 4×11px nên nhìn như ký tự hỏng.
 */
export function avatarSource(user: PublicUser | null | undefined): AvatarSource {
  const src = safeAvatarUrl(user?.avatarUrl);
  if (src) return { kind: "image", src, alt: "" };
  const letter = firstLetterOf(user?.name);
  return { kind: "initial", letter: letter ?? AVATAR_FALLBACK };
}

/**
 * Tên để chào: tên → phần trước `@` của email → lời chào chung.
 *
 * Không dùng `??` thẳng như bản cũ vì `??` **không** bắt `""`: một `name` rỗng
 * sẽ lọt qua và lời chào thành `Xin chào, !`.
 */
export function greetingName(user: PublicUser | null | undefined): string {
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  if (name) return name;
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  const localPart = email.split("@")[0]?.trim() ?? "";
  return localPart || GENERIC_GREETING;
}

/* ---------------------------------------------------------------- menu -- */

export type AvatarMenuEvent =
  /** Bấm nút avatar: mở nếu đang đóng, đóng nếu đang mở. */
  | { type: "TOGGLE" }
  /** Điều hướng sang trang khác. */
  | { type: "ROUTE_CHANGED" }
  /** `pointerdown` rơi ra ngoài vùng menu. */
  | { type: "OUTSIDE_POINTER_DOWN" }
  /** Người dùng bấm `Escape`. */
  | { type: "ESCAPE" };

export type AvatarMenuState = {
  open: boolean;
  /** Đóng xong thì đưa focus về nút avatar. */
  returnFocus: boolean;
};

export const INITIAL_AVATAR_MENU: AvatarMenuState = { open: false, returnFocus: false };

/**
 * Máy trạng thái của menu tài khoản.
 *
 * Ba điều kiện đóng đều trả `open: false`, nhưng chỉ `ESCAPE` trả focus về nút
 * avatar: bấm ra ngoài thì focus phải ở lại chỗ người dùng vừa bấm, và đóng do
 * đổi trang thì nút avatar có khi còn không còn trên màn hình nữa.
 *
 * Sự kiện đến khi menu đang đóng trả nguyên state — nếu không, `ESCAPE` bấm
 * lung tung sẽ cướp focus về nút avatar.
 */
export function avatarMenu(state: AvatarMenuState, event: AvatarMenuEvent): AvatarMenuState {
  switch (event.type) {
    case "TOGGLE":
      return { open: !state.open, returnFocus: false };
    case "ROUTE_CHANGED":
    case "OUTSIDE_POINTER_DOWN":
      return state.open ? { open: false, returnFocus: false } : state;
    case "ESCAPE":
      return state.open ? { open: false, returnFocus: true } : state;
  }
}

/**
 * `target` có nằm ngoài `container` không.
 *
 * Dùng cho `pointerdown`, **không** dùng cho `click`: `click` chỉ nổ sau khi
 * chuỗi pointerdown → pointerup → click đã đi trọn, nên handler "đóng khi bấm ra
 * ngoài" chạy **sau** handler của nút bên trong. Bấm "Đăng xuất" sẽ bị đóng menu
 * rồi mới hành động — hoặc tệ hơn, hành động chạy trên menu đã biến mất.
 *
 * `contains` được duck-type thay vì kiểm tra `instanceof Node` vì vitest chạy ở
 * `environment: 'node'` — ở đó không có global `Node`.
 */
export function isOutside(
  container: { contains(other: unknown): boolean } | null | undefined,
  target: unknown,
): boolean {
  if (!container || typeof container.contains !== "function") return false;
  if (target === null || typeof target !== "object") return false;
  return !container.contains(target);
}
