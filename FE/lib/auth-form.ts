import { API_URL } from "./swr";

/** Chế độ của form: đăng nhập hay đăng ký. */
export type AuthMode = "signin" | "signup";

/**
 * Khớp `PASSWORD_TOO_SHORT` ở `be/src/auth/auth.service.ts:46`. Số này xuất
 * hiện ở ba chỗ — `minLength` của ô mật khẩu, câu nhắc cạnh nó, và câu báo
 * lỗi — nên ghim một lần thay vì gõ lại, hai nơi một luật là hai nơi sẽ lệch.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Hạn của link xác nhận, khớp `VERIFY_TTL_MS` ở
 * `be/src/auth/auth.service.ts:36`.
 *
 * Đây là thứ phải nói **trước khi** người dùng bấm đăng ký, không phải thứ chỉ
 * in ra sau khi đăng ký xong: sau khi bấm thì tài khoản đã tồn tại và cách
 * duy nhất để vào là mở link.
 */
export const VERIFY_LINK_HOURS = 24;

/**
 * Động từ theo mode, dùng cho câu dự phòng khi không đọc được message của BE.
 * Nói sai động từ thì người đang đăng ký bị báo nhầm là đăng nhập hỏng.
 */
const ACTION: Record<AuthMode, string> = { signin: "đăng nhập", signup: "đăng ký" };

/**
 * Khoá là **câu nguyên văn của BE**, không phải mã lỗi — vì BE trả message
 * tiếng Việt sẵn (`auth.service.ts:45-55`, `throttle.guard.ts:64`) chứ không
 * trả mã. Mỗi câu dịch phải nêu cả vấn đề lẫn cách khắc phục, không chỉ báo
 * lỗi.
 */
const BE_MESSAGE_COPY: Record<string, string> = {
  "Mật khẩu phải có ít nhất 8 ký tự": "Mật khẩu cần ít nhất 8 ký tự. Thêm vài ký tự nữa rồi thử.",
  "Email không hợp lệ": "Email chưa đúng dạng. Kiểm tra lại địa chỉ rồi thử.",
  "Email này đã được dùng để đăng ký": "Email này đã có tài khoản. Thử đăng nhập nhé.",
  "Email hoặc mật khẩu không đúng": "Email hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.",
  "Quá nhiều yêu cầu, vui lòng thử lại sau": "Bạn thử hơi nhiều lần trong thời gian ngắn. Chờ một lúc rồi thử lại.",
};

/** Mất mạng / CORS hỏng: `fetch` ném trước khi kịp có response. */
const NETWORK_ERROR = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";

/**
 * Đọc `message` của Nest. Nó là **chuỗi** khi service ném exception với một
 * chuỗi, nhưng là **mảng** khi validation pipe báo nhiều lỗi cùng lúc — đọc
 * thẳng như chuỗi thì mọi trường hợp mảng đều rơi xuống câu dự phòng.
 *
 * Export vì `password-reset.ts` dịch lỗi theo đúng cách này: trả lời BE là
 * thứ **duy nhất** quyết định câu hiện ra, nên hai bản dịch lỗi lệch nhau là
 * hai nơi một luật.
 */
export function beMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { message?: unknown }).message;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const first = raw.find((m) => typeof m === "string");
    return typeof first === "string" ? first : null;
  }
  return null;
}

/** Đọc body lỗi mà không để lỗi parse làm sập cả nhánh báo lỗi. */
export async function readErrorBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    // Proxy/CDN hay trả HTML 502 thay vì JSON. Không có nhánh này thì lỗi
    // parse ném ra ngoài và form hiện màn trắng.
    return null;
  }
}

/**
 * Câu cuối cùng hiện ra dưới form.
 *
 * Thứ tự: message BE đã dịch → dịch được từ status → dự phòng theo mode. Câu
 * dự phòng phải luôn nói *được*, vì nó là câu duy nhất người dùng thấy khi
 * BE hỏng hoặc đổi câu — để trống thì form im lặng, tệ hơn là nói sai.
 */
export function authErrorMessage(status: number, body: unknown, mode: AuthMode): string {
  const fromBe = beMessage(body);
  if (fromBe !== null && BE_MESSAGE_COPY[fromBe] !== undefined) return BE_MESSAGE_COPY[fromBe];
  if (status === 429) return "Bạn thử hơi nhiều lần trong thời gian ngắn. Chờ một lúc rồi thử lại.";
  if (status === 401) return "Email hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.";
  // 5xx là lỗi của máy chủ: đổ lỗi cho người dùng khiến họ bấm lại vô ích.
  if (status >= 500) return "Máy chủ đang bận. Thử lại sau ít phút.";
  return `Không ${ACTION[mode]} được. Kiểm tra lại thông tin rồi thử, hoặc quay lại sau.`;
}

/**
 * Chuẩn hoá email trước khi gửi, y hệt BE (`auth.service.ts:99` giữa `register`
 * và `login`).
 *
 * Không chỉ cho khớp: màn "đã gửi link" in ra chính chuỗi này. Gửi bản gõ thô
 * rồi in bản đã chuẩn hoá (hoặc ngược lại) là nói dối người dùng về nơi mail
 * của họ đang nằm.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Login cấp cookie phiên, register chỉ gửi mail — đổi nhầm hai chữ này là hỏng âm thầm. */
export function authEndpoint(mode: AuthMode): string {
  return `${API_URL}/api/auth/${mode === "signup" ? "register" : "login"}`;
}

export type SubmitResult =
  /** BE đã nhận. Với `signup` nghĩa là **link đã đi**, KHÔNG phải đã có phiên. */
  | { kind: "ok" }
  | { kind: "error"; message: string };

/**
 * Gửi email + mật khẩu tới BE và trả về kết quả đã dịch sẵn.
 *
 * Không bao giờ ném: mọi thất bại — kể cả mất mạng — đều thành
 * `{ kind: "error" }` để chỗ gọi chỉ có một đường để hiển thị.
 */
export async function submitCredentials(
  mode: AuthMode,
  email: string,
  password: string,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch(authEndpoint(mode), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Phiên nằm trong cookie **httpOnly** mà BE đặt sau khi đăng nhập
      // (`auth.controller.ts:68`), nên JS không đọc được token để gắn vào
      // header — và không được gắn: đọc cookie bằng JS đúng lỗ hổng XSS mà
      // httpOnly sinh ra để chặn. Thiếu `include` thì mọi request sau đó 401.
      credentials: "include",
      body: JSON.stringify({ email: normalizeEmail(email), password }),
    });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  if (res.ok) return { kind: "ok" };
  return { kind: "error", message: authErrorMessage(res.status, await readErrorBody(res), mode) };
}

/** Endpoint gửi lại link xác nhận — tách khỏi `authEndpoint` vì không theo mode. */
export const RESEND_URL = `${API_URL}/api/auth/resend-verification`;

/**
 * Câu dự phòng cho trường hợp BE không trả `message`. Phải **nguyên văn** câu của
 * `RESEND_SENT` ở `be/src/auth/auth.service.ts`: đây là hợp đồng "luôn trả cùng
 * một câu cho mọi trạng thái tài khoản", và câu dự phòng lệch một chữ thì người
 * dùng tưởng hệ thống vừa nói sai điều gì đó — hoặc tệ hơn, tưởng có tài khoản.
 */
const RESEND_SENT = "Nếu email đó có tài khoản chưa xác minh, chúng tôi đã gửi lại link xác nhận.";

export type ResendResult = { kind: "ok"; message: string } | { kind: "error"; message: string };

/** Kết quả dùng link xác nhận: `ok` nghĩa là đã xác minh **và** đã có phiên. */
export type VerifyResult = { kind: "ok" } | { kind: "error"; message: string };

/**
 * Đích đến sau khi đăng nhập, lấy từ `?redirect_url=`.
 *
 * Đây là **open redirect** nếu không kiểm: link kiểu
 * `/sign-in?redirect_url=https://site-gia-mao.com` sẽ đưa người dùng vừa đăng
 * nhập xong sang trang giả mạo để lấy mật khẩu. Vì vậy chỉ nhận đường dẫn
 * **nội bộ**: bắt đầu bằng `/` và không phải `//` (protocol-relative), cộng thêm
 * loại trừ `\` vì trình duyệt coi `\` như `/` trong nhiều ngữ cảnh.
 *
 * Trả `fallback` khi thiếu hoặc không hợp lệ — an toàn hơn là ném lỗi lộ ra
 * chi tiết cho kẻ xấu đoán.
 */
export function safeRedirect(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  if (v === "") return fallback;
  // Chặn mọi thứ có scheme (https:, javascript:, data:…) và protocol-relative.
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}


/**
 * Gửi lại link xác nhận cho tài khoản **chưa** xác minh.
 *
 * Không gọi lại `submitCredentials("signup", …)`: tài khoản vừa đăng ký thì chắc
 * chắn đã tồn tại, nên `register` trả 409 và không gửi mail — nút "Gửi lại link"
 * chết đúng lúc cần nhất. Route riêng (`resend-verification`) trả **200** với
 * cùng một câu cho mọi trường hợp, nên kết quả trả về luôn là `{ kind: "ok" }`:
 * người dùng không cần biết tài khoản của mình đang ở trạng thái nào, và FE cũng
 * không được suy ra trạng thái đó từ status.
 */
/**
 * Dùng link xác nhận trong mail để hoàn tất đăng ký.
 *
 * Mail gửi link dạng `${FRONTEND_URL}/sign-up?token=…`
 * (`be/src/auth/auth.service.ts:189`). Hàm này là nửa còn thiếu của luồng đó:
 * BE `GET /api/auth/verify` xác minh token, **set cookie phiên** rồi trả
 * `{ user, expiresIn }` — nên gọi xong là đã đăng nhập, không cần bấm nút nữa.
 *
 * `credentials: "include"` là bắt buộc: cookie do BE set phải quay lại đúng
 * origin đó, thiếu nó thì BE vẫn xác minh thành công nhưng trình duyệt giữ
 * phiên cũ và người dùng thấy như không có gì xảy ra.
 *
 * Không ném, giống `submitCredentials`: mọi thất bại thành `kind: "error"` để
 * chỗ gọi chỉ có một đường hiển thị.
 */
export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  if (!token) return { kind: "error", message: "Link xác nhận không có mã. Bấm lại link trong mail." };
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/verify?token=${encodeURIComponent(token)}`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  const body = await readErrorBody(res);
  if (!res.ok) return { kind: "error", message: beMessage(body) ?? "Mã xác nhận không hợp lệ hoặc đã hết hạn." };
  return { kind: "ok" };
}

export async function resendVerification(email: string): Promise<ResendResult> {
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: normalizeEmail(email) }),
    });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  const body = await readErrorBody(res);
  if (!res.ok) return { kind: "error", message: authErrorMessage(res.status, body, "signup") };
  return { kind: "ok", message: beMessage(body) ?? RESEND_SENT };
}
