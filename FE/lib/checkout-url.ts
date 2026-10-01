/**
 * Đích đến sau khi bấm "Mua" — phải **được kiểm** trước khi trình duyệt đi tới.
 *
 * `app/ui/Pricing.tsx` gọi `window.location.assign(result.url)` với `url` lấy
 * thẳng từ body của `POST /api/premium/checkout`. Không có hàm này thì FE tin
 * thô: đúng khoảnh khắc người dùng đang bấm "Mua", và cửa sổ đó là chỗ đáng
 * tin nhất để đưa họ tới trang giả mạo. `location.assign('javascript:...')`
 * còn chạy ngay trong origin của trang.
 *
 * BE hiện chỉ trả URL của Stripe (`be/src/premium/premium.service.ts:242` gọi
 * `checkout.sessions.create`, và Stripe luôn sinh `https://checkout.stripe.com/...`),
 * nên đây là lớp **giữ**, chưa phải lỗi đang nổ. Một thay đổi ở BE, một cổng
 * thanh toán mới, hay một response bị đánh cắp trên đường truyền — bất kỳ thứ
 * gì — đều không còn tự biến thành redirect tới domain kẻ tấn công.
 *
 * Tách ra khỏi component vì lý do đã quen: `vitest.config.ts` chạy
 * `environment: 'node'` không có jsdom, nên component không test được. Ở trong
 * JSX thì xoá hết phần kiểm này thì toàn bộ test vẫn xanh; ở đây thì xoá là đỏ.
 */

/**
 * Host cổng thanh toán mặc định.
 *
 * So khớp **chính xác** theo `hostname`, không phải `endsWith`/`includes`:
 * `https://checkout.stripe.com.evil.com` có `hostname` là
 * `checkout.stripe.com.evil.com`, và `includes` sẽ thấy chuỗi
 * `checkout.stripe.com` nằm trong đó rồi cho qua.
 *
 * Vì sao `hostname` chứ không phải `host`: `host` kèm cả cổng
 * (`checkout.stripe.com:8443`) nên phải viết cổng vào danh sách. `hostname` bỏ
 * phần cổng, nên danh sách chỉ cần tên miền. Đổi lại là mọi cổng trên tên miền
 * đã tin cậy đều qua — chấp nhận được, vì khác cổng trên **cùng** tên miền thì
 * vẫn là cùng chủ sở hữu, không mở lối nào ra ngoài danh sách.
 */
const DEFAULT_CHECKOUT_HOSTS = ["checkout.stripe.com"];

export const CHECKOUT_REJECTED =
  "Cổng thanh toán trả về địa chỉ không tin cậy. Đã dừng lại để bạn không bị chuyển sang trang lạ — hãy thử lại sau hoặc liên hệ hỗ trợ.";

export type CheckoutUrlResult = { kind: "ok"; url: string } | { kind: "error"; message: string };

/** Đọc host phụ từ env, phân tách bằng dấu phẩy, bỏ khoảng trắng và phần rỗng. */
function extraCheckoutHosts(): string[] {
  return (process.env.NEXT_PUBLIC_CHECKOUT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

/**
 * `result.url` có đáng đưa trình duyệt đi không.
 *
 * Ba điều kiện, thiếu một là loại:
 *  - phải là URL tuyệt đối parse được (`new URL` ném với `/path` và `//host`);
 *  - scheme phải là `https:` — `http:` tụt xuống kênh không mã hoá để bị chặn
 *    giữa đường, `javascript:`/`data:` thì nguy hiểm hơn nhiều;
 *  - `hostname` phải nằm trong danh sách tin cậy.
 *
 * **Không bao giờ ném**: mọi thất bại thành `{ kind: "error" }` để chỗ gọi chỉ
 * có một đường để hiển thị — cùng nguyên tắc với `submitCredentials` trong
 * `@/lib/auth-form`. Câu lỗi cố ý không nhắc lại URL mà BE trả về, để không biến
 * màn báo lỗi thành chỗ hiển thị lại địa chỉ của kẻ tấn công.
 */
export function safeCheckoutUrl(raw: unknown): CheckoutUrlResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { kind: "error", message: CHECKOUT_REJECTED };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { kind: "error", message: CHECKOUT_REJECTED };
  }
  if (parsed.protocol !== "https:") {
    return { kind: "error", message: CHECKOUT_REJECTED };
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = [...DEFAULT_CHECKOUT_HOSTS, ...extraCheckoutHosts()];
  if (!allowed.includes(host)) {
    return { kind: "error", message: CHECKOUT_REJECTED };
  }
  return { kind: "ok", url: raw.trim() };
}
