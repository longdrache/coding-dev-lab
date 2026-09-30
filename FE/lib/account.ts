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
  /** Nút avatar nhận focus bằng bàn phím. */
  | { type: "FOCUS" }
  /** Khoảng trễ hover đã hết, mở menu. */
  | { type: "OPEN_FROM_HOVER" }
  /**
   * Con trỏ đã rời hẳn vùng avatar và dropdown quá lâu.
   *
   * Khác lý do với `ROUTE_CHANGED`/`OUTSIDE_POINTER_DOWN` nhưng **cùng kết quả**,
   * nên gom chung một nhánh: hover-đóng không được trả focus về nút, và người
   * dùng không hề bấm gì nên chuyện đó đúng là của họ.
   */
  | { type: "CLOSE_FROM_HOVER" }
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
 *
 * `FOCUS` là đường bàn phím: nó mở **ngay**, không chờ khoảng trễ nào của hover.
 * Chờ 250ms ở đường bàn phím không phải phong cách mà là treo máy, và người dùng
 * screen reader thì không có hover để mà chờ.
 */
export function avatarMenu(state: AvatarMenuState, event: AvatarMenuEvent): AvatarMenuState {
  switch (event.type) {
    case "TOGGLE":
      return { open: !state.open, returnFocus: false };
    case "FOCUS":
    case "OPEN_FROM_HOVER":
      return state.open ? state : { open: true, returnFocus: false };
    case "ROUTE_CHANGED":
    case "OUTSIDE_POINTER_DOWN":
    case "CLOSE_FROM_HOVER":
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

/* --------------------------------------------------------------- hover -- */

export type AvatarHoverTimings = {
  /** Chờ bao lâu sau khi rê vào thì mở. */
  openMs: number;
  /** Chờ bao lâu sau khi rê ra khỏi cả vùng thì đóng. */
  closeMs: number;
  /** Sau khi hover đóng, chặn mở lại bằng hover trong bao lâu. */
  cooldownMs: number;
};

/**
 * Ba con số này là **hợp đồng**, không phải tuỳ chọn: `account-hover.test.ts`
 * khẳng định đúng từng mili giây, nên đổi là phải sửa test kèm lý do.
 *
 * - **`openMs: 250`.** Rê qua 36px ở tốc độ người dùng đi ngang header mất
 *   chưa tới 100ms; 250ms lọc hết các lượt lướt đó. Nhỏ hơn ~200ms thì người
 *   dùng *có ý định* cũng phải chờ, lớn hơn ~300ms thì nó thành độ trễ.
 * - **`closeMs: 500`.** Lớn hơn `openMs` là bắt buộc, vì đây là hai ý định
 *   khác nhau: mở thì phải chịu ngựa lướt chuột đi ngang, đóng thì phải chờ
 *   con trỏ đi tới dropdown. Đo đường đi thật — từ mép trái avatar tới mép trái
 *   dropdown là ~204px ngang và 8px dọc (avatar cao 36px, panel mọc ở `top-11`) —
 *   thì người dùng có ý thức mất ~300ms. 500ms là khoảng lấy đó, cộng chừng để
 *   không sát mép. Bỏ nó thì rê qua khe 8px giữa avatar và dropdown làm menu
 *   đóng rồi mở lại, tức giật.
 * - **`cooldownMs: 600`.** Chặn hover mở lại ngay sau một lần hover-đóng, để
 *   người dùng chỉ dùng chuột không bị mở dropdown theo nhịp quét lên quét
 *   xuống header. Bấm và bàn phím **không** đi qua chỗ này.
 */
export const AVATAR_HOVER_TIMINGS: AvatarHoverTimings = {
  openMs: 250,
  closeMs: 500,
  cooldownMs: 600,
};

export type AvatarHover = {
  /** Con trỏ vào vùng gồm cả avatar lẫn dropdown. */
  enterRegion(): void;
  /** Con trỏ rời hẳn vùng đó. */
  leaveRegion(): void;
  /** Trạng thái mở/đóng thật, để controller không tự đoán nguyên nhân. */
  sync(open: boolean): void;
  /** Menu đang mở là do hover mở, hay do click/bàn phím? */
  openedByHover(): boolean;
  /** Huỷ mọi hẹn giờ còn treo. */
  dispose(): void;
};

/**
 * Máy điều phối hover: hai cái hẹn giờ và một khoảng nghỉ, không gì hơn.
 *
 * Nó cố tình **không** biết mình đang nối với DOM nào — cũng giống `isOutside`.
 * `AccountMenu.tsx` gắn `onPointerEnter`/`onPointerLeave` vào **thẻ bọc chung**,
 * nên "rê từ avatar sang dropdown" không sinh ra lần rời vùng nào cả; lần rời
 * đúng đắn chỉ xảy ra khi con trỏ đi qua khe 8px giữa mép dưới avatar và mép
 * trên panel, và khoảng trễ đóng là thứ đợi qua khe đó.
 */
export function createAvatarHover(
  effects: { open(): void; close(): void },
  timings: AvatarHoverTimings = AVATAR_HOVER_TIMINGS,
): AvatarHover {
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let isOpen = false;
  let viaHover = false;
  let closedByHoverAt: number | null = null;

  function clearOpenTimer(): void {
    if (openTimer === undefined) return;
    clearTimeout(openTimer);
    openTimer = undefined;
  }

  function clearCloseTimer(): void {
    if (closeTimer === undefined) return;
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function enterRegion(): void {
    /* Con trỏ quay lại vùng: hẹn đóng đang treo thì vô nghĩa. */
    clearCloseTimer();
    if (isOpen) return;
    if (closedByHoverAt !== null && Date.now() - closedByHoverAt < timings.cooldownMs) return;
    openTimer = setTimeout(() => {
      openTimer = undefined;
      isOpen = true;
      viaHover = true;
      effects.open();
    }, timings.openMs);
  }

  function leaveRegion(): void {
    clearOpenTimer();
    /* Chỉ hover mới đóng được thứ nó mở. Menu mở bằng click hay bàn phím giữ
     * luật cũ — bấm ra ngoài, `Escape`, `Tab`, đổi trang — nếu rê ra cũng đóng
     * thì người dùng bấm xem xong đưa chuột xuống đọc sẽ mất menu. */
    if (!isOpen || !viaHover) return;
    closeTimer = setTimeout(() => {
      closeTimer = undefined;
      isOpen = false;
      viaHover = false;
      closedByHoverAt = Date.now();
      effects.close();
    }, timings.closeMs);
  }

  function sync(next: boolean): void {
    if (next) {
      isOpen = true;
      /* Menu đã mở bằng đường khác thì hẹn hover hết việc. Để nó nổ lên sẽ
       * mở trùng — đúng cái lỗi "bấm một lần mà menu nhấp nháy hai lần". */
      clearOpenTimer();
      return;
    }
    isOpen = false;
    viaHover = false;
    clearOpenTimer();
    clearCloseTimer();
  }

  return {
    enterRegion,
    leaveRegion,
    sync,
    openedByHover: () => viaHover,
    dispose() {
      clearOpenTimer();
      clearCloseTimer();
    },
  };
}

/**
 * Sự kiện `pointerenter` này có phải từ chuột không.
 *
 * Chạm **có** phát `pointerenter` (`pointerType: "touch"`) trước `click`. Không
 * chặn thì bấm giữ lâu sẽ mở menu bằng hover, rồi `click` nổ sau đó lại
 * `TOGGLE` thành đóng — người dùng chạm vào avatar rồi menu biến mất. Chỉ nhận
 * `mouse`: đó là con trỏ duy nhất có khả năng hover ổn định, và cũng là con trỏ
 * mà `@media (hover: hover)` của Tailwind nhắm tới. Bút vẫn bấm được như cũ.
 */
export function isHoverPointer(pointerType: string | undefined): boolean {
  return pointerType === "mouse";
}

/**
 * Focus này đến từ bàn phím chứ không từ chuột, theo `:focus-visible`.
 *
 * `onFocus` không tự phân biệt được hai thứ đó, và đây là chỗ hay hỏng nhất khi
 * thêm hover: bấm chuột cũng sinh `focus`, nên nếu cứ mở theo `focus` thì click
 * sẽ vừa mở vừa đóng. Trình duyệt cũ không hiểu `:focus-visible` thì trả
 * `false` — hỏng một chiều (bàn phím không mở được) còn hơn hỏng hai chiều.
 */
export function isKeyboardFocus(
  target: { matches(selectors: string): boolean } | null | undefined,
): boolean {
  if (!target || typeof target.matches !== "function") return false;
  try {
    return target.matches(":focus-visible");
  } catch {
    return false;
  }
}
