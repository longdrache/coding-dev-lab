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
/**
 * Lỗi 401 **một lần** thì làm mới rồi thử lại đúng một lần.
 *
 * Nhiều key SWR cùng 401 (màn dashboard bắn lúc mở) thì chỉ được **một** lần gọi
 * `/refresh`: `refreshSessionOnce` dùng chung một promise cho mọi chỗ đang chờ.
 * Không dedupe thì mỗi key một lần xoay vòng token, và các lượt sau phải giành
 * qua đệm 30 giây của token vừa bị thay — thắng thì phiên rời rạc giữa các key,
 * thua thì bị coi nhầm là hết phiên và đá người dùng ra khỏi tài khoản.
 *
 * `retry` (lỗi mạng, 5xx) thì ném 401 để `AuthProvider` xử lý — ném `ApiError`
 * `503` ở đây sẽ khiến SWR hiện cả lỗi lên màn hình vì một sự cố tạm.
 */
export function authedFetcher<T = unknown>(url: string): Promise<T> {
  return fetch(url, { credentials: "include" }).then(async (res) => {
    if (res.status === 401) {
      const { refreshSessionOnce } = await import("./api");
      const r = await refreshSessionOnce();
      if (r.kind === "ok") {
        const retry = await fetch(url, { credentials: "include" });
        if (retry.ok) return retry.json() as Promise<T>;
        throw new ApiError(retry.status, await readErrorCode(retry));
      }
      throw new ApiError(401);
    }
    if (!res.ok) throw new ApiError(res.status, await readErrorCode(res));
    return res.json() as Promise<T>;
  });
}
