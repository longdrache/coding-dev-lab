import type { NextConfig } from "next";

/**
 * Header an toàn cho **mọi** response.
 *
 * Trước khi có khối này, config là object rỗng. Đo trực tiếp trên `next start`
 * (bản build production) cho thấy response chỉ mang `Vary`, `Link`,
 * `Cache-Control`, `Content-Type`, `Date`, `ETag`, `X-Powered-By` — không một
 * header phòng vệ nào. Hậu quả cụ thể nhất là **clickjacking**: không có
 * `X-Frame-Options` và không có `frame-ancestors` thì mọi trang đều nhúng được
 * trong `<iframe>` của `evil.com`, kéo dài toàn màn hình và phủ overlay trong
 * suốt. Nạn nhân đã đăng nhập bấm nhầm là chạy những hành động không cân nhắc —
 * "Mua gói Năm", "Nộp bài", "Đăng xuất". Không header nào chặn được.
 *
 * Vì sao CSP **cố ý** hẹp, không có `script-src`:
 *  - App Router nhét `<script>` inline để hydrate (`self.__next_f.push(...)`).
 *  - Monaco và three.js cần `unsafe-eval` cùng `worker-src blob:`.
 * Một `script-src` thiếu nonce sẽ làm app chết ngay lúc chạy, mà thêm nonce
 * đúng cách cần `proxy.ts` sinh nonce cho từng request — việc đó để riêng.
 * Ba directive ở đây (`frame-ancestors`, `object-src`, `base-uri`) không đụng
 * tới script nên không có rủi ro gãy gì. `next.config.test.ts` canh luôn cả
 * việc không có `script-src` lọt vào, để đổi ý phải là quyết định có chủ đích.
 *
 * `Strict-Transport-Security` cố ý **không** đặt ở đây: HSTS là chính sách
 * không hoàn tác được, đặt sai domain là hỏng cả site mà không có cách gỡ. Nó
 * thuộc về tầng CDN/proxy của hạ tầng, nơi đã biết chắc domain thật — không phải
 * chỗ mình đoán.
 */
const securityHeaders = [
  // Chống clickjacking: `DENY` cho trình duyệt đời cũ, `frame-ancestors` cho CSP.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  // Không để trình duyệt đoán kiểu nội dung: ví dụ JSON bị dò ra bằng
  // `<script src>` khi thiếu `nosniff`.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // URL đầy đủ của `/reset-password?token=` và `/sign-up?token=` không được tự
  // ý rò ra ngoài qua header `Referer`.
  { key: "Referrer-Policy", value: "strict-origin-when-crossorigin" },
  // Trang không dùng camera/mic/vị trí, nên tắt hẳn thay vì để mặc định.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Mặc định Next gắn `X-Powered-By: Next.js` — công bố stack không tốn gì mà
  // giúp kẻ dò chọn payload. Đo thật trên `next start` trước khi tắt.
  poweredByHeader: false,

  // Một rule catch-all duy nhất. Viết rule riêng cho từng route là cách chắc
  // chắn nhất để quên header ở route thêm sau này.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  // `productionBrowserSourceMaps` cố ý để mặc định (tắt): bản build production
  // không sinh `.map` nào vào `.next/static`. Bật lên là rò toàn bộ mã nguồn
  // client cho ai tải file.
};

export default nextConfig;
