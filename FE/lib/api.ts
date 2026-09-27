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
 * Đọc phiên hiện tại từ cookie httpOnly.
 *
 * **401 là trạng thái bình thường của khách**, không phải lỗi: người dùng chưa
 * đăng nhập thì `/me` trả 401 và đó là câu trả lời đúng. Vì vậy chỉ `2xx` mới
 * được coi là "có phiên", còn lại trả `null` chứ không ném — nếu ném thì mọi
 * khách đều thấy một lỗi đỏ giả tưởng là hỏng.
 */
export async function currentSession(): Promise<SessionPayload | null> {
  const res = await fetch(ME_URL, { credentials: "include" });
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
