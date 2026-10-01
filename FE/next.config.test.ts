import { beforeAll, describe, expect, it } from "vitest";
import config from "./next.config";

/**
 * Rà soát bảo mật: header phản vọng của toàn bộ response.
 *
 * Trước khi có file này, `next.config.ts` là object rỗng. Đo trực tiếp từ
 * `next start` trên bản build production cho thấy response chỉ có:
 * `Vary`, `Link`, `Cache-Control`, `Content-Type`, `Date`, `ETag`,
 * `X-Powered-By` — **không** có `Content-Security-Policy`, `X-Frame-Options`,
 * `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`.
 *
 * Hệ quả cụ thể nhất là **clickjacking**: không có `X-Frame-Options` và không
 * có `frame-ancestors` thì mọi trang đều có thể bị `evil.com` nhúng trong
 * `<iframe>`, kéo dài toàn màn hình và phủ overlay trong suốt. Nạn nhân đã
 * đăng nhập bấm nhầm thì chạy những hành động không cân nhắc — nút "Mua gói Năm"
 * (`app/ui/Pricing.tsx`), "Nộp bài" (`app/problem/[slug]/page.tsx`),
 * "Đăng xuất" (`app/ui/AccountMenu.tsx`). Không header nào chặn được.
 *
 * Test ở đây canh **object config thật** chứ không đọc source: `kicker.test.ts`
 * quét text nên không bắt được việc một rule `headers()` bị viết sai kiểu hay
 * bị xoá; ở đây bỏ `headers()` đi thì đỏ.
 */

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

/**
 * `headers()` được Next cho phép viết đồng bộ hoặc bất đồng bộ
 * (`node_modules/next/dist/docs/.../headers.md`), nên gọi ở `beforeAll` và chờ
 * cả hai kiểu — test không được phụ thuộc vào việc config đang viết `async` hay
 * không, vì đổi kiểu không phải đổi hành vi mà vẫn phải giữ xanh.
 */
let rules: HeaderRule[] = [];
let globalRule: HeaderRule | undefined;

function headerValue(key: string): string | undefined {
  return globalRule?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

beforeAll(async () => {
  const raw = typeof config.headers === "function" ? config.headers() : [];
  rules = (Array.isArray(raw) ? raw : await raw) as HeaderRule[];
  globalRule = rules.find((r) => r.source === "/:path*");
});

describe("security headers — next.config", () => {
  it("bật headers() với một rule catch-all duy nhất phủ /:path*", () => {
    // Một rule riêng cho từng route là cách chắc chắn nhất để quên header ở
    // route mới thêm vào, nên toàn bộ header an toàn phải nằm ở rule catch-all.
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
  });

  it("chặn clickjacking: X-Frame-Options DENY và CSP frame-ancestors 'none'", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
    expect(headerValue("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("chặn MIME sniffing: X-Content-Type-Options nosniff", () => {
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
  });

  it("giới hạn Referer: strict-origin-when-crossorigin", () => {
    // Không có policy này thì trình duyệt dùng mặc định riêng của mình. Token đi
    // trong query của `/reset-password?token=` và `/sign-up?token=` nên URL đầy
    // đủ không được tự ý rò ra ngoài.
    expect(headerValue("Referrer-Policy")).toBe("strict-origin-when-crossorigin");
  });

  it("tắt Permissions-Policy cho camera/micro/geolocation", () => {
    const value = headerValue("Permissions-Policy");
    expect(value).toBeDefined();
    expect(value).toContain("camera=()");
    expect(value).toContain("microphone=()");
    expect(value).toContain("geolocation=()");
  });

  it("CSP chặn object-src và chốn base-tag injection", () => {
    const csp = headerValue("Content-Security-Policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("cố ý KHÔNG có script-src/default-src trong CSP lúc này", () => {
    // Đây là chốt chặn có chủ đích, không phải thiếu sót. App Router nhét
    // `<script>` inline để hydrate (`self.__next_f.push(...)`), và Monaco/three.js
    // cần `unsafe-eval` + `worker-src blob:`. Một `script-src` thiếu nonce sẽ
    // chết ngay lúc chạy. Thêm `script-src` đúng cách cần `proxy.ts` sinh nonce
    // cho từng request trước — việc đó để riêng, chứ không giấu vào đây.
    const csp = headerValue("Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/script-src|default-src/);
  });

  it("tắt X-Powered-By để không lộ stack", () => {
    // Đo thật trên `next start`: response có `X-Powered-By: Next.js`.
    expect(config.poweredByHeader).toBe(false);
  });

  it("giữ nguyên productionBrowserSourceMaps mặc định (không phát source map)", () => {
    // Đo thật: 0 file .map trong `.next/static`, không chunk nào có
    // `sourceMappingURL`. Không được bật lên mà không có quyết định riêng.
    expect(config.productionBrowserSourceMaps).toBeUndefined();
  });
});
