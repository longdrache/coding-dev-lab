import { API_URL } from "./swr";

/**
 * User ở dạng công khai — đúng những gì BE trả ở `/api/auth/login`, `/me` và
 * `/refresh`. Không có trường nào của DB lọt ra ngoài, nên FE đưa thẳng vào UI
 * được mà không cần che gì thêm.
 */
export type PublicUser = {
  id: number;
  email: string;
  name: string | null;
  role: "user" | "vip" | "admin";
  /**
   * Ảnh đại diện từ Google, `null` khi tài khoản không đặt ảnh. Thêm ở commit
   * `869daba` (BE: `User.avatarUrl`, `toPublic()` ở `auth.service.ts:210`).
   *
   * `null` = "không biết", không phải "chắc chắn không có ảnh": `syncAvatarUrl`
   * (`auth.service.ts:758`) cố ý không ghi đè `null` xuống DB.
   */
  avatarUrl: string | null;
};

/**
 * Cặp giá trị BE trả kèm: ai đang đăng nhập, và access token còn sống bao lâu
 * nữa. `expiresIn` là thứ **bắt buộc phải giữ** — không có nó thì FE không
 * biết lúc nào cần làm mới, và chỉ phát hiện ra sau khi đã hết hạn.
 */
export type SessionPayload = {
  user: PublicUser;
  expiresIn: number;
};

export const ME_URL = `${API_URL}/api/auth/me`;
export const REFRESH_URL = `${API_URL}/api/auth/refresh`;
export const LOGOUT_URL = `${API_URL}/api/auth/logout`;

/** Lệch pha giữa hai lần kiểm tra trạng thái lúc mới mở tab. */
export const REFRESH_LEAD_S = 60;

/** Chờ bao lâu sau một lần refresh thất bại vì lỗi tạm (mạng, 5xx). */
export const RETRY_DELAY_MS = 30_000;

/**
 * Số mili giây cần chờ trước khi làm mới access token, hoặc `null` nếu
 * `expiresIn` không đủ tin cậy để lên lịch.
 *
 * Access token sống 15 phút (`ACCESS_TTL_SECONDS` ở `be/src/auth/tokens.ts`), còn
 * refresh token sống 30 ngày. Nếu không đoán trước thì hết 15 phút là `/me` trả
 * 401 và người dùng bị coi là khách dù phiên vẫn còn trong DB.
 *
 * Trả về **khoảng chờ** chứ không phải mốc thời gian tuyệt đối, nên không cần
 * đưa đồng hồ vào: chỗ gọi tự bù theo thời điểm gọi.
 *
 * - `expiresIn` không phải số hữu hạn, âm, hay không phải số → `null`. `setTimeout`
 *   xử lý ba ca này mỗi ca một kiểu (`NaN` → 0 tức thì, quá `2^31-1` → bắn ngay),
 *   nên trả `null` để chủ động không lên lịch thay vì để timer tự quyết.
 * - `expiresIn <= 60` → chờ 0 (làm mới ngay): token còn lại ít hơn khoảng đệm thì
 *   chờ cũng không kịp, cứ refresh luôn. `0` là "vừa hết hạn" nên cũng là chờ 0.
 *
 * Lưu ý: nếu BE trả `expiresIn` nhỏ lặp đi lặp lại thì vòng lặp này quay rất
 * nhanh. Chấp nhận được hiện tại vì BE trả hằng `ACCESS_TTL_SECONDS = 900`; nếu
 * sau này TTL thành biến thì phải thêm trần sàn cho độ trễ.
 */
export function refreshPlan(expiresIn: unknown): number | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn < 0) {
    return null;
  }
  return Math.max(0, expiresIn - REFRESH_LEAD_S) * 1000;
}

/** Đọc body JSON mà không để lỗi parse làm sập cả nhánh "không có phiên". */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return ((await res.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Có phải xoá cache SWR khi user đổi từ `prev` sang `next` không?
 *
 * Cache SWR của app nằm trong bộ nhớ, giữ cả dữ liệu theo tài khoản (dashboard,
 * lịch sử giải, huy hiệu). Đăng xuất mà không xoá thì tài khoản sau đăng nhập lại
 * sẽ nhìn thấy dữ liệu của tài khoản trước — lỗ hổng rò dữ liệu chéo tài khoản.
 *
 * **So sánh bằng `id`, tuyệt đối không so bằng tham chiếu.** Mỗi lần làm mới
 * access token (15 phút một lần) BE trả về một object `user` mới cho cùng một
 * người; nếu so tham chiếu thì sẽ xoá cache mỗi 15 phút và người dùng mất dữ
 * liệu đang tải. Cùng `id` thì để nguyên, kể cả khi `role` đổi (nâng VIP) —
 * vai trò không làm dữ liệu cũ sai.
 */
export function shouldClearCache(prev: PublicUser | null, next: PublicUser | null): boolean {
  if (prev === null && next === null) return false;
  if (prev === null || next === null) return true;
  return prev.id !== next.id;
}

/**
 * Cổng duy nhất để đổi user: quyết định có xoá cache không, xoá **trước**, rồi mới
 * commit user mới.
 *
 * Tách ra khỏi component vì component không test được (xem `vitest.config.ts`:
 * không jsdom). Ở trong component thì lệnh `purgeCache()` là dòng code không test
 * bảo vệ được — thử bỏ nó đi thì toàn bộ test vẫn xanh. Ở đây thì bỏ là đỏ.
 */
export function commitSession(
  prev: PublicUser | null,
  next: PublicUser | null,
  purgeCache: () => void,
  commit: (next: PublicUser | null) => void,
): void {
  if (shouldClearCache(prev, next)) purgeCache();
  commit(next);
}

/**
 * Đọc phiên hiện tại từ cookie httpOnly.
 *
 * **401 là trạng thái bình thường của khách**, không phải lỗi: người dùng chưa
 * đăng nhập thì `/me` trả 401 và đó là câu trả lời đúng. Vì vậy chỉ `2xx` mới
 * được coi là "có phiên", còn lại trả `null` chứ không ném — nếu ném thì mọi
 * khách đều thấy một lỗi đỏ giả tưởng là hỏng.
 *
 * Riêng `5xx` thì **phải ném**, khác với 401/403. Đây là lỗi tạm của server, không
 * phải "phiên đã hết" — trả `null` sẽ khiến `AuthProvider` xoá user và đá người
 * đã đăng nhập ra khỏi trang, chỉ vì Neon chập chờn một giây. Chỗ này trước đây
 * gộp chung mọi status không 2xx nên `try/catch` ở `AuthProvider` không che được.
 */
export async function currentSession(): Promise<SessionPayload | null> {
  const res = await fetch(ME_URL, { credentials: "include" });
  if (res.status >= 500) {
    throw new Error(`Phiên kiểm tra lỗi ${res.status} — lỗi tạm, đừng coi là hết phiên`);
  }
  if (!res.ok) return null;
  const data = await readJson(res);
  if (!data.user) return null;
  return { user: data.user as PublicUser, expiresIn: Number(data.expiresIn) };
}

export type RefreshResult =
  | { kind: "ok"; session: SessionPayload }
  /** Phiên chết thật — dừng hẳn lịch, không thử lại nữa. */
  | { kind: "expired" }
  /** Lỗi tạm — thử lại sau, tuyệt đối không đăng xuất nhầm. */
  | { kind: "retry" };

/**
 * Làm mới access token bằng cookie `refresh`.
 *
 * Route không nhận body và cố ý không dùng `AuthGuard` (`auth.controller.ts:171`)
 * — nên nó vẫn chạy được khi access token đã hết hạn, đúng mục đích của refresh.
 *
 * **Cạm bẫy ở route này:** token không dùng được nữa (thu hồi, hết hạn, xoay vòng
 * quá đệm 30 giây) thì BE trả **200 kèm `{ message }` chứ không phải 401**
 * (`auth.controller.ts:191-194`), đồng thời xoá cookie. Nên phải kiểm tra *có
 * `user` hay không*, không được chỉ nhìn `status` — nếu không thì sẽ tưởng là
 * thành công rồi quay vòng lặp vô hạn với một phiên đã chết.
 */
export async function refreshSession(): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(REFRESH_URL, { method: "POST", credentials: "include" });
  } catch {
    return { kind: "retry" };
  }
  if (res.status === 401) return { kind: "expired" };
  if (!res.ok) return { kind: "retry" };
  const data = await readJson(res);
  if (!data.user) return { kind: "expired" };
  return {
    kind: "ok",
    session: { user: data.user as PublicUser, expiresIn: Number(data.expiresIn) },
  };
}

/**
 * Kết quả đăng xuất: `"out"` = phiên đã chết ở BE, `"retry"` = chưa chết được.
 *
 * Hai giá trị chứ không phải boolean vì chỗ gọi **phải** phân biệt chúng: báo
 * thành công khi BE còn giữ phiên thì người dùng bấm lại là thấy mình vẫn đang
 * đăng nhập, và sẽ báo ứng dụng hỏng.
 */
export type SignOutResult = "out" | "retry";

/**
 * Một lần làm mới, **dùng chung cho mọi nơi đang chờ**.
 *
 * Refresh token xoay vòng: mỗi lần `/refresh` trả về là một token mới và token
 * cũ chỉ sống thêm `ROTATION_GRACE_MS` (30 giây, `auth.service.ts:71`). Nên khi
 * hai chỗ cùng gặp 401 và cùng gọi `/refresh`, chỉ một lần được token mới và lần
 * còn lại phải giành qua đệm — thắng thì phiên rời rạc giữa các tab, thua thì bị
 * coi nhầm là hết phiên. `authedFetcher` chạy cho **mọi** key SWR nên một màn
 * bảng điện thoại có thể ra mười request 401 cùng lúc.
 *
 * Vì vậy mọi lời gọi trong lúc đang bay đều nhận **cùng một** promise, và khi nó
 * xong thì `inflight` trở lại `null` để lần sau (một access token mới vừa được
 * cấp) không dùng lại kết quả cũ.
 */
let inflight: Promise<RefreshResult> | null = null;

export function refreshSessionOnce(): Promise<RefreshResult> {
  if (!inflight) {
    // `finally` chạy **sau** khi promise đã được gán nên `inflight = null` ở đây
    // không xoá nhầm một lần refresh mới hơn vừa được tạo ra.
    inflight = refreshSession().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Đọc phiên, tự làm mới **một lần** nếu access token vừa hết hạn. */
export type SessionLookup =
  | { kind: "ok"; session: SessionPayload }
  /** Refresh token không dùng được nữa: hết 30 ngày, hoặc bị gỡ phiên. */
  | { kind: "expired" }
  /** Lỗi tạm (mạng, 5xx): tuyệt đối không kết luận là hết phiên. */
  | { kind: "retry" };

/**
 * Đây là hợp đồng mà `AuthProvider` thật sự cần, và là chỗ **sửa đúng** cái lỗi
 * "hết 15 phút là bị đăng xuất".
 *
 * `/me` chỉ đọc cookie `session` (access token, 15 phút) — nó không biết phiên 30
 * ngày còn hay không. Nên `401` từ `/me` có **hai** nguyên nhân hoàn toàn khác
 * nhau mà status không phân biệt được:
 *
 *  1. khách thật (chưa đăng nhập bao giờ);
 *  2. access token vừa hết hạn, còn refresh token thì vẫn sống tới 30 ngày.
 *
 * Trước đây `AuthProvider` coi cả hai như `null` và hạ user về khách — tức mở
 * lại trang sau 20 phút là mất phiên dù cookie `refresh` còn nguyên và còn hạn.
 * Đó chính là "refresh token không kích hoạt được": **không có đường nào** gọi
 * `/refresh` khi `/me` trả 401.
 *
 * Vì vậy `401` phải được phân giải bằng cách hỏi BE một lần: `/refresh` chỉ trả
 * `200` khi phiên còn thật. Hết hạn 15 phút ⇒ `200` ⇒ người dùng không bao giờ
 * phải đăng nhập lại; hết 30 ngày thì `401` ⇒ mới là đăng xuất thật.
 *
 * **Cái giá:** khách lạ mở app phải thêm một POST `/refresh` (trả 401 ngay). Chấp
 * nhận được — nó chỉ xảy ra một lần mỗi lần tải trang, và cách khác (chỉ làm
 * mới khi biết chắc có phiên) đòi phải thêm một cookie báo hiệu, tức thêm bề mặt
 * hơn là đáng.
 *
 * `5xx`/lỗi mạng của `/me` không được đi vào nhánh refresh: đó là lỗi tạm của
 * server, và `currentSession` đã ném đúng như vậy.
 */
export async function resolveSession(): Promise<SessionLookup> {
  let session: SessionPayload | null;
  try {
    session = await currentSession();
  } catch {
    return { kind: "retry" };
  }
  if (session) return { kind: "ok", session };
  const r = await refreshSessionOnce();
  if (r.kind === "ok") return { kind: "ok", session: r.session };
  return r;
}

/**
 * Câu nói khi phiên **thật sự** kết thúc giữa chừng, để người dùng hiểu đây là
 * đăng xuất chứ không phải lỗi.
 *
 * Ba điều kiện phải đủ cả ba, mỗi điều kiện lọc ra một ca sai:
 *  - `kind` phải là `"expired"`: hết 15 phút là `ok` (đã tự làm mới), lỗi mạng là
 *    `retry` — hai ca đó không được nói là hết phiên.
 *  - `prev` phải có user: không có gì để mất thì không có gì để báo.
 *  - không phải đăng xuất **cố ý**: `AccountMenu` đã báo lỗi riêng của nó rồi,
 *    thêm dòng này là nói với người dùng chuyện họ vừa tự làm.
 */
export function sessionEndedNotice(
  prev: PublicUser | null,
  kind: SessionLookup["kind"],
  deliberate = false,
): string | null {
  if (kind !== "expired" || deliberate || !prev) return null;
  return 'Phiên đăng nhập đã kết thúc (hết 30 ngày hoặc bị đăng xuất ở nơi khác). Vui lòng đăng nhập lại.';
}

/**
 * Đăng xuất: xoá dòng phiên ở BE (route `/logout` đọc cookie `refresh` chứ không
 * dùng `AuthGuard`, vì access token hết hạn sau 15 phút mà người dùng vẫn phải
 * đăng xuất được).
 *
 * **Không** tự xoá cookie ở trình duyệt: cookie là `httpOnly` nên JS không đọc
 * được, và BE đã trả `Clear-Cookie` để dọn cả hai.
 *
 * Sau khi gọi, chỗ gọi phải `refresh()` để `AuthProvider` đọc lại `/me` ra
 * `null` — nếu không thì UI vẫn hiện tài khoản cũ cho tới lần làm mới kế tiếp
 * (tối đa 15 phút), và dữ liệu của tài khoản đó vẫn nằm trong cache SWR.
 */
export async function signOut(): Promise<SignOutResult> {
  let res: Response;
  try {
    res = await fetch(LOGOUT_URL, { method: "POST", credentials: "include" });
  } catch {
    return "retry";
  }
  return res.ok ? "out" : "retry";
}

