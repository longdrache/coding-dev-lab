import { describe, expect, it } from "vitest";
import { MAX_HISTORY_TURNS, withTurn, type ChatTurn } from "./assistant";

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
