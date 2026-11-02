import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_LENGTH,
  withTurn,
  displayNameOf,
  initialOf,
  errorMessageFor,
  trimMessage,
  type ChatTurn,
  type ChatUser,
} from "./assistant";

describe("withTurn", () => {
  it("nối lượt mới vào cuối", () => {
    const history: ChatTurn[] = [{ role: "user", content: "a" }];
    expect(withTurn(history, { role: "assistant", content: "b" })).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("giữ tối đa 10 lượt gần nhất", () => {
    const history: ChatTurn[] = Array.from({ length: MAX_HISTORY_TURNS }, (_, i) => ({
      role: "user",
      content: `cũ ${i}`,
    }));
    const out = withTurn(history, { role: "assistant", content: "mới" });
    expect(out).toHaveLength(MAX_HISTORY_TURNS);
    expect(out[0].content).toBe("cũ 1");
    expect(out.at(-1)?.content).toBe("mới");
  });

  it("không sửa mảng gốc", () => {
    const history: ChatTurn[] = [{ role: "user", content: "a" }];
    withTurn(history, { role: "user", content: "b" });
    expect(history).toHaveLength(1);
  });
});

describe("displayNameOf", () => {
  it("trả 'Bạn' khi user null", () => {
    expect(displayNameOf(null)).toBe("Bạn");
    expect(displayNameOf(undefined)).toBe("Bạn");
  });

  it("ưu tiên name nếu có", () => {
    const user: ChatUser = { name: "  An  ", email: "a@b.com" };
    expect(displayNameOf(user)).toBe("An");
  });

  it("fallback sang email nếu name rỗng", () => {
    const user: ChatUser = { name: "   ", email: "a@b.com" };
    expect(displayNameOf(user)).toBe("a@b.com");
  });

  it("trả 'Bạn' nếu cả name và email rỗng", () => {
    const user: ChatUser = { name: null, email: "   " };
    expect(displayNameOf(user)).toBe("Bạn");
  });
});

describe("initialOf", () => {
  it("lấy chữ cái đầu viết hoa", () => {
    expect(initialOf("An")).toBe("A");
    expect(initialOf("  bob")).toBe("B");
  });

  it("trả '?' khi rỗng", () => {
    expect(initialOf("   ")).toBe("?");
    expect(initialOf("")).toBe("?");
  });
});

describe("errorMessageFor", () => {
  it("401 → hết hạn phiên", () => {
    expect(errorMessageFor({ status: 401 })).toBe("Phiên đã hết hạn, hãy đăng nhập lại.");
  });

  it("429 → hỏi nhanh", () => {
    expect(errorMessageFor({ status: 429 })).toBe("Bạn hỏi hơi nhanh, thử lại sau một phút.");
  });

  it("5xx → đang bận", () => {
    expect(errorMessageFor({ status: 500 })).toBe("Trợ lý đang bận, thử lại sau.");
    expect(errorMessageFor({ status: 502 })).toBe("Trợ lý đang bận, thử lại sau.");
    expect(errorMessageFor({ status: 503 })).toBe("Trợ lý đang bận, thử lại sau.");
  });

  it("4xx khác → dùng message nếu có", () => {
    expect(errorMessageFor({ status: 400, message: "  bad  " })).toBe("bad");
  });

  it("4xx khác không có message → fallback", () => {
    expect(errorMessageFor({ status: 400 })).toBe("Trợ lý đang bận, thử lại sau.");
    expect(errorMessageFor({ status: 400, message: "   " })).toBe("Trợ lý đang bận, thử lại sau.");
  });
});

describe("trimMessage", () => {
  it("trim và cắt theo MAX_MESSAGE_LENGTH", () => {
    expect(trimMessage("  hi  ")).toBe("hi");
    expect(trimMessage("a".repeat(MAX_MESSAGE_LENGTH + 5))).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});
