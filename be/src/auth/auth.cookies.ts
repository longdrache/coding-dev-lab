/**
 * Đọc một cookie từ header `Cookie` thô. Dự án không cài `cookie-parser` (cùng lý do
 * `AdminGuard` tự tách header thủ công) nên phải tự tách, và phải tách **giống hệt**
 * cookie-parser: cắt theo `;`, cắt ở dấu `=` đầu tiên, trim hai đầu, rồi mới
 * `decodeURIComponent` — nếu không, cùng một request mà có `req.cookies` thì lọt,
 * không có thì không.
 *
 * Tên cookie so sánh nguyên văn sau khi tách, không dựng `RegExp` động từ tên
 * cookie và không dùng `includes`, nên `mysession` hay `session_id` không bao giờ
 * bị nhận nhầm là `session`. `decodeURIComponent` ném `URIError` với chuỗi `%` hỏng,
 * nên bắt lại và trả giá trị thô: để `verifyAccessToken` từ chối, thay vì làm sập cả
 * request thành 500.
 *
 * Sống ở file riêng vì **hai** chỗ dùng: `AuthGuard` đọc cookie `session`, còn
 * `AuthController` đọc cookie `refresh` ở `refresh` và `logout` (hai route đó không
 * đi qua `AuthGuard` vì access token có thể đã hết hạn). Hai bản parse lệch nhau nghĩa
 * là cookie `AuthGuard` đọc được thì `refresh` lại không, tức người dùng bị kẹt
 * không làm mới được phiên.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (typeof header !== 'string') return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}
