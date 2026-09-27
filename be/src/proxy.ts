// Dùng chung cho src/main.ts (local) và api/index.ts (Vercel) để
// không bao giờ lệch config proxy giữa 2 entry.
/**
 * Số hop proxy đáng tin trước socket. `1` là cấu hình chuẩn của Vercel: request
 * đi qua đúng một reverse proxy (Vercel edge) rồi tới server.
 */
export const TRUST_PROXY_HOPS = 1;

type ProxyTarget = { set(key: string, value: number): unknown };

/**
 * Bật `trust proxy` để `req.ip` là **IP của client thật** thay vì IP của proxy.
 *
 * Không bật thì `req.ip` là địa chỉ socket, tức IP của Vercel edge: mọi người dùng
 * rơi vào cùng một bucket rate-limit, nên `register` giới hạn 20 lần/giờ biến thành
 * giới hạn **toàn hệ thống** và người dùng thật không đăng ký được. Đây là lỗi
 * runtime — `tsc` không bắt được — nên `proxy.spec.ts` khẳng định cả `req.ip` sau
 * khi bật.
 *
 * `1` nghĩa là "tin đúng một hop": `req.ip` là phần tử **cuối cùng** của
 * `X-Forwarded-For` (`proxy-addr` bỏ đúng 1 địa chỉ tính từ socket rồi lấy phần tử
 * kế). Vercel nối IP thật của người gọi vào **cuối** chuỗi đó, nên đây chính là IP
 * client — và an toàn trước giả mạo: client chỉ thêm được vào **đầu** chuỗi, mà phần
 * đầu bị bỏ qua. Nếu đặt `trust proxy` là `true` thì mọi giá trị trong chuỗi đều được
 * tin và kẻ spam chỉ cần thêm một hop giả là lách được giới hạn theo IP.
 */
export function trustProxy(app: ProxyTarget): void {
  app.set('trust proxy', TRUST_PROXY_HOPS);
}
