export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Lỗi mang kèm HTTP status và **mã lỗi ổn định** do BE trả kèm.
 *
 * Trước đây status chỉ nằm trong message (`Request failed: 404`), nên không chỗ
 * nào phân biệt được "bài thật sự không tồn tại" với "mạng chết". Trang bài dùng
 * chỗ đó để `notFound()`, và một lỗi mạng tạm đã ra trang 404 cho một bài có thật.
 *
 * `code` sinh ra vì lý do tương tự nhưng tệ hơn: HTTP 403 nói "không có quyền"
 * chứ không nói **quyền gì**. Đã có nhiều nguyên nhân 403 khác nhau, nên chỉ
 * status thì FE không dám dựng màn nào. BE gửi kèm `code: "problem_vip_only"`
 * cho đúng một trường hợp — xem `app/problem/vip-gate.ts`.
 */
export class ApiError extends Error {
  readonly status: number;
  /** Mã ổn định trong body lỗi, `null` khi BE không gửi hoặc gửi sai kiểu. */
  readonly code: string | null;

  constructor(status: number, code: string | null = null) {
    super(`Request failed: ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Bóc `code` khỏi body lỗi mà **không** được phép nổ lên thành lỗi khác.
 *
 * Cần cả ba lớp phòng thủ vì cả ba xảy ra thật:
 *  - response không có hàm `json` (proxy chặn giữa chừng, test stub cũ),
 *  - body là HTML chứ không phải JSON (một lần `SyntaxError` ở đây là biến lỗi
 *    mạng thành lỗi parse, và `catch` của component không che được),
 *  - `code` là object/số do BE hoặc proxy thêm vào — đẩy thẳng vào UI là dựng
 *    text từ dữ liệu không kiểm soát được.
 */
async function readErrorCode(res: Response): Promise<string | null> {
  try {
    if (typeof (res as { json?: unknown }).json !== "function") return null;
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== "object") return null;
    const code = (body as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, await readErrorCode(res));
  return res.json() as Promise<T>;
}

/**
 * Fetcher cho endpoint cần đăng nhập.
 *
 * Phiên nằm trong cookie **httpOnly** (BE đặt `sameSite: none` + `secure` ở
 * production vì FE khác domain) nên JS không đọc được token để gắn vào header —
 * và không được gắn: đọc cookie bằng JS là đúng lỗ hổng XSS mà httpOnly sinh ra
 * để chặn. Thay vào đó phải `credentials: "include"`; BE bật CORS `credentials`
 * nên cookie mới đi kèm. Bỏ dòng này thì mọi request trả 401.
 *
 * Ném `ApiError` chứ không phải `Error` trần: `ApiError` **là** `Error` nên mọi
 * chỗ bắt theo message vẫn chạy, nhưng chỗ nào cần status/mã thì có sẵn. Trước
 * đây hàm này ném `Error` trần nên `useProblem` không phân biệt được 404 của bài
 * với lỗi mạng.
 */
export function authedFetcher<T = unknown>(url: string): Promise<T> {
  return fetch(url, { credentials: "include" }).then(async (res) => {
    if (!res.ok) throw new ApiError(res.status, await readErrorCode(res));
    return res.json() as Promise<T>;
  });
}
