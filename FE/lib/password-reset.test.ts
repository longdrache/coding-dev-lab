import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORGOT_URL, RESET_URL, requestPasswordReset, submitNewPassword } from "./password-reset";

/**
 * Hai trường hợp duy nhất của `fetch` ở đây: có response (kể cả 502 HTML từ
 * proxy/CDN, tức `res.json()` ném) và mất mạng (chính `fetch` ném).
 */
function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function htmlRes(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error("<html>502 Bad Gateway</html>");
    },
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Đọc request mà code gửi đi — assert trên *tham số* chứ không assert trên mock. */
function sent() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: JSON.parse(String(init.body)) as Record<string, string>,
    credentials: init.credentials,
  };
}

describe("xin quên mật khẩu", () => {
  it("POST đúng endpoint, chuẩn hoá email, và đi kèm cookie", async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { message: "da gui" }));
    const r = await requestPasswordReset("  A@B.co  ");

    expect(r).toEqual({ kind: "ok", message: "da gui" });
    const s = sent();
    expect(s.url).toBe(FORGOT_URL);
    expect(s.method).toBe("POST");
    // Gửi bản đã chuẩn hoá, không gửi bản gõ thô — y hệt `register`.
    expect(s.body).toEqual({ email: "a@b.co" });
    expect(s.credentials).toBe("include");
  });

  it("200 với câu của BE thì trả nguyên câu đó", async () => {
    const cau = "Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.";
    fetchMock.mockResolvedValue(jsonRes(200, { message: cau }));
    expect(await requestPasswordReset("a@b.co")).toEqual({ kind: "ok", message: cau });
  });

  /**
   * Hàng rào cho cái lỗi dễ mắc nhất: khi BE **không** trả `message` (502 từ
   * proxy/CDN) mà câu dự phòng lệch khỏi câu hợp đồng, trang này biến thành công
   * cụ dò email — đúng thứ `forgotPassword` ở BE dựng bằng cả một trang để tránh.
   */
  it("BE không trả message thì dùng câu hợp đồng, không phải câu suông", async () => {
    fetchMock.mockResolvedValue(htmlRes(502));
    const r = await requestPasswordReset("a@b.co");
    // 502 là lỗi máy chủ nên vẫn là `error` — nhưng câu phải nói lỗi của máy chủ,
    // không được rơi về câu dự phòng.
    expect(r).toEqual({ kind: "error", message: "Máy chủ đang bận. Thử lại sau ít phút." });

    fetchMock.mockResolvedValue(jsonRes(200, {}));
    expect(await requestPasswordReset("a@b.co")).toEqual({
      kind: "ok",
      message: "Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.",
    });
  });

  it("429 nói rõ phải chờ, không đổ lỗi cho người dùng", async () => {
    fetchMock.mockResolvedValue(
      jsonRes(429, { message: "Quá nhiều yêu cầu, vui lòng thử lại sau" }),
    );
    const r = await requestPasswordReset("a@b.co");
    expect(r.kind).toBe("error");
    expect((r as { message: string }).message).toContain("Chờ một lúc");
  });

  it("mất mạng thì không ném ra, trả lời bằng câu có cách khắc phục", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await requestPasswordReset("a@b.co");
    expect(r).toEqual({
      kind: "error",
      message: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    });
  });
});

describe("đặt lại mật khẩu", () => {
  it("POST đúng endpoint, gửi token và mật khẩu, đi kèm cookie", async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { message: "ok" }));
    const r = await submitNewPassword("ma-123", "matkhaumoi123");

    expect(r).toEqual({ kind: "ok" });
    const s = sent();
    expect(s.url).toBe(RESET_URL);
    expect(s.method).toBe("POST");
    expect(s.body).toEqual({ token: "ma-123", password: "matkhaumoi123" });
    expect(s.credentials).toBe("include");
  });

  /**
   * Test quan trọng nhất của trang này. Bản brief viết `setDone(true)` **trước**
   * khi kiểm `res.ok`, nên link chết cũng hiện màn "Đã đổi mật khẩu" rồi đưa
   * người dùng sang trang đăng nhập — họ tin là đã đổi xong, vào lại thì bị từ
   * chối, không ai hiểu vì sao. 400 phải ra lỗi tại chỗ.
   */
  it("mã chết (400) thì báo lỗi tại chỗ, không báo thành công", async () => {
    fetchMock.mockResolvedValue(
      jsonRes(400, { message: "Mã đặt lại không hợp lệ hoặc đã hết hạn" }),
    );
    const r = await submitNewPassword("ma-chet", "matkhaumoi123");
    expect(r.kind).toBe("error");
    const msg = (r as { message: string }).message;
    // Câu phải nêu cả vấn đề lẫn đường thoát, không chỉ "mã không hợp lệ".
    expect(msg).toContain("1 giờ");
    expect(msg).toContain("quên mật khẩu");
  });

  it("mật khẩu quá ngắn thì dịch đúng câu của BE", async () => {
    fetchMock.mockResolvedValue(jsonRes(400, { message: "Mật khẩu phải có ít nhất 8 ký tự" }));
    const r = await submitNewPassword("ma-123", "ngan");
    expect((r as { message: string }).message).toBe(
      "Mật khẩu mới cần ít nhất 8 ký tự. Thêm vài ký tự nữa rồi thử.",
    );
  });

  it("BE trả câu lạ thì không lộ câu thô ra cho người dùng", async () => {
    // Câu lạ (mã lỗi nội bộ, message do hạ tầng sinh) không có trong bản dịch:
    // hiện nguyên văn là lộ chi tiết BE. Phải rơi về câu dự phòng nói *được*.
    fetchMock.mockResolvedValue(jsonRes(400, { message: "P2002 constraint failed" }));
    const r = await submitNewPassword("ma-123", "matkhaumoi123");
    expect(r.kind).toBe("error");
    expect((r as { message: string }).message).not.toContain("P2002");
  });

  it("mất mạng thì không ném ra", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await submitNewPassword("ma-123", "matkhaumoi123")).toEqual({
      kind: "error",
      message: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    });
  });

  it("gửi mật khẩu nguyên văn, không bỏ khoảng trắng ở hai đầu", async () => {
    // Mật khẩu có thể cố ý bắt đầu hoặc kết thúc bằng khoảng trắng. `.trim()` ở
    // đây là một lỗi âm thầm: đổi mật khẩu xong không đăng nhập được.
    fetchMock.mockResolvedValue(jsonRes(200, {}));
    await submitNewPassword("ma-123", " mat khau co cham ");
    expect(sent().body).toEqual({ token: "ma-123", password: " mat khau co cham " });
  });
});
