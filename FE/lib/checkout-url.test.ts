import { afterEach, describe, expect, it } from "vitest";
import { safeCheckoutUrl } from "./checkout-url";

/**
 * Chặn open redirect ở luồng thanh toán.
 *
 * `app/ui/Pricing.tsx` gọi `window.location.assign(result.url)` với `url` lấy
 * thẳng từ body của `POST /api/premium/checkout`. Trước khi có hàm này, FE giao
 * đúng thứ BE trả về mà không kiểm gì: đúng một khoảnh khắc người dùng đang
 * bấm "Mua", và cửa sổ đó là chỗ đáng tin nhất để đưa họ tới trang giả mạo
 * nhất.
 *
 * BE hiện chỉ trả URL của Stripe (`be/src/premium/premium.service.ts:242` —
 * `checkout.sessions.create`, mà Stripe luôn sinh `https://checkout.stripe.com/...`),
 * nên lỗ hổng **chưa** khai thác được nếu BE giữ nguyên. Đây là lớp giữ cho
 * đúng lúc đó: một thay đổi ở BE, một URL đổi cổng thanh toán, hay một response
 * bị đánh cắp trên đường truyền — bất kỳ thứ gì — đều không còn biến thành
 * redirect tới domain kẻ tấn công chỉ vì FE tin thô.
 *
 * So khớp bằng `hostname` **chính xác**, không phải `endsWith`/`includes`: nếu
 * dùng `includes` thì `https://checkout.stripe.com.evil.com` và
 * `https://evil.com/?next=https://checkout.stripe.com` đều lọt.
 */

const REAL_STRIPE_URL = "https://checkout.stripe.com/c/pay/cs_test_a1_B2c3#fidkdWxOYHwn";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_CHECKOUT_HOSTS;
});

describe("safeCheckoutUrl — URL cổng thanh toán phải được tin cậy mới đi", () => {
  it("nhận URL Stripe thật", () => {
    expect(safeCheckoutUrl(REAL_STRIPE_URL)).toEqual({ kind: "ok", url: REAL_STRIPE_URL });
  });

  it("chặn javascript: — scheme nguy hiểm nhất", () => {
    // `location.assign('javascript:...')` chạy trong origin của trang.
    expect(safeCheckoutUrl("javascript:alert(document.cookie)").kind).toBe("error");
  });

  it("chặn data:", () => {
    expect(safeCheckoutUrl("data:text/html,<script>alert(1)</script>").kind).toBe("error");
  });

  it("chặn http:// — hạ cấp xuống kênh không mã hoá để bị chặn giữa đường", () => {
    expect(safeCheckoutUrl("http://checkout.stripe.com/c/pay/x").kind).toBe("error");
  });

  it("chặn domain giả dạng bằng hậu tố", () => {
    expect(safeCheckoutUrl("https://checkout.stripe.com.evil.com/pay").kind).toBe("error");
  });

  it("chặn hậu tố `.evil.com` dính vào", () => {
    expect(safeCheckoutUrl("https://evil.com/?x=https://checkout.stripe.com").kind).toBe("error");
  });

  it("chặn thủ đoạn userinfo `checkout.stripe.com@evil.com`", () => {
    // Bộ phân tích URL tách userinfo ra `.username`/`.password`, nên `hostname`
    // ở đây thật sự là `evil.com` chứ không phải `checkout.stripe.com`. Test
    // này canh đúng điều đó: tên miền thật của URL là `evil.com`, dù chuỗi
    // trông quen thuộc.
    expect(safeCheckoutUrl("https://checkout.stripe.com@evil.com/pay").kind).toBe("error");
  });

  it("bỏ qua cổng: danh sách tin cậy quyết định bằng TÊN MIỀN, không kèm cổng", () => {
    // `hostname` bỏ mất phần cổng, nên `https://checkout.stripe.com:8443/pay` ra
    // `checkout.stripe.com` và được nhận. Chấp nhận có chủ đích: cổng khác trên
    // cùng một tên miền vẫn là cùng chủ sở hữu, và cho qua cổng lạ không tạo ra
    // đường nào để thoát khỏi tên miền đã tin cậy. Nếu sau này cần siết cả cổng
    // thì so khớp `host` và ghi kèm cổng trong danh sách — nhưng đừng tưởng
    // `hostname` đã làm việc đó.
    expect(safeCheckoutUrl("https://checkout.stripe.com:8443/pay").kind).toBe("ok");
  });

  it("chặc mọi domain khác, kể cả domain của chính BE", () => {
    expect(safeCheckoutUrl("https://api.gocode.vn/phishing").kind).toBe("error");
    expect(safeCheckoutUrl("https://gocode.vn/").kind).toBe("error");
    expect(safeCheckoutUrl("https://localhost:3000/").kind).toBe("error");
  });

  it("chặn URL tương đối và protocol-relative", () => {
    expect(safeCheckoutUrl("/premium/thank-you").kind).toBe("error");
    expect(safeCheckoutUrl("//checkout.stripe.com/pay").kind).toBe("error");
  });

  it("chặn mọi thứ không phải chuỗi, kể cả chuỗi rỗng", () => {
    expect(safeCheckoutUrl(undefined).kind).toBe("error");
    expect(safeCheckoutUrl(null).kind).toBe("error");
    expect(safeCheckoutUrl("").kind).toBe("error");
    expect(safeCheckoutUrl("   ").kind).toBe("error");
    expect(safeCheckoutUrl(42).kind).toBe("error");
    expect(safeCheckoutUrl(["https://checkout.stripe.com/pay"]).kind).toBe("error");
    expect(safeCheckoutUrl({ url: REAL_STRIPE_URL }).kind).toBe("error");
  });

  it("không ném — luôn trả về { kind } để chỗ gọi chỉ có một đường hiển thị", () => {
    // Cùng nguyên tắc với `submitCredentials` và `submitNewPassword`: component
    // không được phải phân biệt "hỏng mạng" với "BE trả URL lạ".
    expect(() => safeCheckoutUrl("nonsense")).not.toThrow();
  });

  it("câu lỗi không lộ URL mà BE trả về ra UI", () => {
    const r = safeCheckoutUrl("https://evil.com/steal");
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).not.toContain("evil.com");
  });
});

describe("safeCheckoutUrl — host phụ qua env", () => {
  it("mặc định chỉ tin Stripe, không đọc env nào", () => {
    expect(safeCheckoutUrl("https://pay.momo.vn/gateway").kind).toBe("error");
  });

  it("cho phép thêm host qua NEXT_PUBLIC_CHECKOUT_HOSTS, phân tách bằng dấu phẩy", () => {
    // Cổng thanh toán có thể đổi. Env để chủ repo mở rộng mà không phải sửa code,
    // đúng như `NEXT_PUBLIC_API_URL` đang làm cho BE.
    process.env.NEXT_PUBLIC_CHECKOUT_HOSTS = "pay.momo.vn, pay.vnpay.vn";
    expect(safeCheckoutUrl("https://pay.momo.vn/gateway")).toEqual({
      kind: "ok",
      url: "https://pay.momo.vn/gateway",
    });
    expect(safeCheckoutUrl("https://pay.vnpay.vn/gateway").kind).toBe("ok");
  });

  it("env phụ KHÔNG nới lỏng được scheme và không cứu được domain khác", () => {
    process.env.NEXT_PUBLIC_CHECKOUT_HOSTS = "pay.momo.vn";
    expect(safeCheckoutUrl("http://pay.momo.vn/gateway").kind).toBe("error");
    expect(safeCheckoutUrl("https://evil.com/?x=pay.momo.vn").kind).toBe("error");
  });

  it("bỏ qua khoảng trắng và phần tử rỗng trong env", () => {
    process.env.NEXT_PUBLIC_CHECKOUT_HOSTS = "  , pay.momo.vn ,  ";
    expect(safeCheckoutUrl("https://pay.momo.vn/gateway").kind).toBe("ok");
    expect(safeCheckoutUrl("https:////.momo.vn/").kind).toBe("error");
  });

  it("so khớp host không phân biệt hoa thường", () => {
    process.env.NEXT_PUBLIC_CHECKOUT_HOSTS = "PAY.MOMO.VN";
    expect(safeCheckoutUrl("https://pay.momo.vn/gateway").kind).toBe("ok");
  });
});
