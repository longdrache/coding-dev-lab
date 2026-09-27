import { API_URL } from "./swr";
import { beMessage, normalizeEmail, readErrorBody } from "./auth-form";

/**
 * Quên mật khẩu / đặt lại mật khẩu — phần **quyết định**, tách khỏi component.
 *
 * `vitest.config.ts` chỉ có `environment: 'node'`, không jsdom, và không được
 * thêm dependency. Nghĩa là một component không test được: không có jsdom thì
 * không render được, và test bằng cách đọc source là test không canh được gì. Mọi
 * thứ đáng test — endpoint nào, gửi gì, dịch lỗi BE ra tiếng Việt thế nào — nằm
 * ở đây; component chỉ nối vào state.
 */
export const FORGOT_URL = `${API_URL}/api/auth/forgot-password`;
export const RESET_URL = `${API_URL}/api/auth/reset-password`;

/**
 * Hạn của link đặt lại mật khẩu, khớp `RESET_TTL_MS` ở
 * `be/src/auth/auth.service.ts:42`. Ngắn hơn 24 giờ của mã xác minh vì nó mở
 * thẳng quyền truy cập tài khoản. Số này phải nói ra **trước** khi bấm, không phải
 * in ra sau khi bấm: sau khi bấm thì người dùng phải đi tìm mail.
 */
export const RESET_LINK_HOURS = 1;

/**
 * Mật khẩu mới tối thiểu, khớp `PASSWORD_TOO_SHORT` ở BE. Dùng cho `minLength` và
 * cho câu nhắc cạnh ô nhập — hai chỗ một luật thì ghim một lần, không gõ lại.
 */
export const MIN_NEW_PASSWORD = 8;

/**
 * Câu dự phòng khi BE không trả `message` (502 từ proxy/CDN chẳng hạn). Nguyên
 * văn câu `RESET_REQUESTED` ở `be/src/auth/auth.service.ts`.
 *
 * Câu này phải nói **"đã gửi"** chứ không phải "nếu email có tài khoản": đó là
 * câu duy nhất mọi trường hợp — không tồn tại, chưa xác minh, sai định dạng — đều
 * nhận được. Sửa nó thành câu nói khác đi là biến trang này thành công cụ dò xem
 * email nào đã đăng ký trên GoCode.
 */
const RESET_REQUESTED = "Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.";

/** Mất mạng / CORS hỏng: `fetch` ném trước khi kịp có response. */
const NETWORK_ERROR = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";

/**
 * Khoá là **câu nguyên văn của BE** (`auth.controller.ts:91,254`), không phải mã
 * lỗi. Mỗi câu phải nêu cả vấn đề lẫn cách khắc phục — riêng câu "mã không hợp
 * lệ" là câu khiến người dùng bỏ cuộc ở đúng chỗ dễ nhất.
 */
const BE_MESSAGE_COPY: Record<string, string> = {
  "Mã đặt lại không hợp lệ hoặc đã hết hạn":
    "Link này không còn dùng được. Mã đặt lại chỉ sống 1 giờ và chỉ dùng một lần — xin quên mật khẩu để lấy mã mới.",
  "Mật khẩu phải có ít nhất 8 ký tự":
    "Mật khẩu mới cần ít nhất 8 ký tự. Thêm vài ký tự nữa rồi thử.",
  "Quá nhiều yêu cầu, vui lòng thử lại sau":
    "Bạn thử hơi nhiều lần trong thời gian ngắn. Chờ một lúc rồi thử lại.",
};

export type ForgotResult = { kind: "ok"; message: string } | { kind: "error"; message: string };

export type ResetResult = { kind: "ok" } | { kind: "error"; message: string };

/**
 * Câu hiện ra khi không dịch được lỗi BE nào.
 *
 * Thứ tự: message BE đã dịch → status biết nói gì → dự phòng. Câu dự phòng phải
 * luôn nói *được*, vì nó là câu duy nhất người dùng thấy khi BE hỏng hoặc đổi câu
 * — để trống thì form im lặng, tệ hơn là nói sai.
 */
function resetErrorMessage(status: number, body: unknown, action: string): string {
  const fromBe = beMessage(body);
  if (fromBe !== null && BE_MESSAGE_COPY[fromBe] !== undefined) return BE_MESSAGE_COPY[fromBe];
  if (status === 429) return "Bạn thử hơi nhiều lần trong thời gian ngắn. Chờ một lúc rồi thử lại.";
  // 5xx là lỗi của máy chủ: đổ lỗi cho người dùng khiến họ bấm lại vô ích.
  if (status >= 500) return "Máy chủ đang bận. Thử lại sau ít phút.";
  return `Không ${action} được. Kiểm tra lại rồi thử, hoặc quay lại sau.`;
}

/**
 * Xin gửi link đặt lại mật khẩu.
 *
 * **Không bao giờ ném** và **không bao giờ suy ra trạng thái tài khoản** từ kết
 * quả: BE trả 200 với cùng một câu cho mọi email, kể cả email không tồn tại. Nên
 * `{ kind: "ok" }` nghĩa là "BE đã nhận yêu cầu", tuyệt đối không phải "email của
 * bạn có tài khoản" — nói vậy là dựng lại đúng công cụ dò email mà BE vừa bỏ.
 */
export async function requestPasswordReset(email: string): Promise<ForgotResult> {
  let res: Response;
  try {
    res = await fetch(FORGOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: normalizeEmail(email) }),
    });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  const body = await readErrorBody(res);
  if (!res.ok) return { kind: "error", message: resetErrorMessage(res.status, body, "gửi link") };
  return { kind: "ok", message: beMessage(body) ?? RESET_REQUESTED };
}

/**
 * Đổi mật khẩu bằng mã một lần.
 *
 * Trả `{ kind: "ok" }` **chỉ** khi BE trả 200. Link chết trả 400 và phải hiện lỗi
 * tại chỗ: coi mọi response là thành công thì người dùng bị đưa sang trang đăng
 * nhập với niềm tin mình đã đổi mật khẩu xong, rồi không vào được — và không có
 * một dòng nào giải thích vì sao.
 */
export async function submitNewPassword(token: string, password: string): Promise<ResetResult> {
  let res: Response;
  try {
    res = await fetch(RESET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, password }),
    });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  if (res.ok) return { kind: "ok" };
  return { kind: "error", message: resetErrorMessage(res.status, await readErrorBody(res), "đổi mật khẩu") };
}
