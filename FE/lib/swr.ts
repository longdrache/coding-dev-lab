export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Lỗi mang kèm HTTP status.
 *
 * Trước đây status chỉ nằm trong message (`Request failed: 404`), nên không chỗ
 * nào phân biệt được "bài thật sự không tồn tại" với "mạng chết". Trang bài dùng
 * chỗ đó để `notFound()`, và một lỗi mạng tạm đã ra trang 404 cho một bài có thật.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Request failed: ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status);
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
 */
export function authedFetcher<T = unknown>(url: string): Promise<T> {
  return fetch(url, { credentials: "include" }).then(async (res) => {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json() as Promise<T>;
  });
}
