import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORGOT_COOLDOWN_MS,
  cooldownMessage,
  cooldownUntil,
  formatCountdown,
  isCooling,
  remainingMs,
  unlockedMessage,
} from "./forgot-limit";

/**
 * Cooldown 10 giây cho nút gửi ở màn quên mật khẩu.
 *
 * Không `sleep` thật ở đâu cả: mọi phép toán thời gian đều nhận `now` làm tham số
 * nên bộ test chạy tức thì, và thất bại thì đỏ **thật** — một test chờ thật 10
 * giây thì tác giả sẽ xoá luôn khi nó đỏ vì chậm.
 *
 * Ba lớp, từ nhỏ tới lớn:
 *
 * 1. `forgot-limit.ts` thuần: mốc hết hạn, phép trừ, định dạng đồng hồ. Đây là
 *    nơi có toàn bộ quyết định, và cũng là nơi dễ sai nhất.
 * 2. **Tính từ mốc tuyệt đối**: nhịp render có bao nhiêu lần không quan trọng, thời
 *    gian trôi bao nhiêu mới quan trọng. Đây là chỗ dễ quay lại kiểu trừ dần, và
 *    kiểu trừ dần hỏng đúng lúc tab bị ẩn.
 * 3. **Nối vào component**: đọc source `app/forgot-password/page.tsx` và assert
 *    nó thật sự chốt bấm bằng biến thật và khoá nút. Bỏ chặn bấm ở component thì
 *    lớp này đỏ, dù `forgot-limit.ts` vẫn đúng.
 *
 * **Không phụ thuộc `.env` của máy** (bài học `f4d04c4`): file này không import
 * `@/lib/swr`, nên `API_URL` đọc `process.env` lúc nạp module không liên quan, và
 * mọi assert về hằng số dùng chính hằng trong `forgot-limit.ts` chứ không gõ cứng.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PAGE_SRC = readFileSync(join(HERE, "..", "app", "forgot-password", "page.tsx"), "utf8");
const LIB_SRC = readFileSync(join(HERE, "forgot-limit.ts"), "utf8");

/**
 * Bỏ phần **comment** ra, chừa lại code.
 *
 * Cần vì chính `forgot-limit.ts` giải thích trong JSDoc rằng ta cố ý *không* lưu
 * bền, nên từ khoá `sessionStorage` xuất hiện trong prose mà không có ý nghĩa là
 * code đọc storage. Assert thẳng vào source thô sẽ đỏ vì chính tài liệu hoá quyết
 * định — đúng loại test tự lừa mình. Cùng kỹ thuật `blockCommentRanges` của
 * `kicker.test.ts`.
 */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Mốc hết hạn lúc bấm ở thời điểm `t`. */
function pressed(t: number): number {
  return cooldownUntil(t);
}

describe("bấm xong thì khoá, và chỉ khoá đúng 10 giây", () => {
  it("trước khi bấm thì không khoá", () => {
    expect(isCooling(0, 0)).toBe(false);
    expect(isCooling(0, FORGOT_COOLDOWN_MS * 100)).toBe(false);
    expect(remainingMs(0, 0)).toBe(0);
  });

  it("bấm xong thì khoá ngay lần bấm đó", () => {
    // Không phải "bấm thêm được một lần nữa rồi mới khoá": người dùng bấm xong thì
    // nút phải đã khoá, vì đó là điều màn này hứa.
    const at = pressed(1_000);
    expect(isCooling(at, 1_000)).toBe(true);
    expect(remainingMs(at, 1_000)).toBe(FORGOT_COOLDOWN_MS);
  });

  it("khoá đúng 10 giây, không sớm không muộn", () => {
    const at = pressed(0);
    expect(FORGOT_COOLDOWN_MS).toBe(10_000);
    // 1ms trước mốc thì vẫn khoá — làm tròn sớm hơn là mất lần bấm hợp lệ.
    expect(isCooling(at, FORGOT_COOLDOWN_MS - 1)).toBe(true);
    // Đúng mốc thì mở, không phải chậm thêm một nhịp nào nữa.
    expect(isCooling(at, FORGOT_COOLDOWN_MS)).toBe(false);
    expect(remainingMs(at, FORGOT_COOLDOWN_MS)).toBe(0);
  });

  it("bấm lần nữa sau khi hết hạn thì khoá lại từ đầu, không cộng dồn", () => {
    const first = pressed(0);
    expect(isCooling(first, FORGOT_COOLDOWN_MS)).toBe(false);
    const second = pressed(FORGOT_COOLDOWN_MS);
    // Mốc mới phải là `mốc cũ + 10 giây`, không phải `mốc cũ + 10 giây + 10 giây`.
    // Cộng dồn là khoá dài hơn hứa, và người dùng không có cách nào biết vì sao.
    expect(remainingMs(second, FORGOT_COOLDOWN_MS)).toBe(FORGOT_COOLDOWN_MS);
    expect(isCooling(second, FORGOT_COOLDOWN_MS * 2 - 1)).toBe(true);
    expect(isCooling(second, FORGOT_COOLDOWN_MS * 2)).toBe(false);
  });
});

describe("đồng hồ tính từ mốc tuyệt đối, không đếm số lần render", () => {
  it("còn lại luôn bằng mốc trừ thời điểm hiện tại", () => {
    const at = pressed(10_000);
    for (const now of [10_000, 10_001, 12_345, 15_000, 19_999, 20_000]) {
      expect(remainingMs(at, now), `now=${now}`).toBe(at - now);
    }
  });

  it("gọi lại bao nhiêu lần cũng không đổi kết quả", () => {
    // Bộ đếm giảm từng nhịp thì **mỗi** lần render là một lần trừ, nên kết quả phụ
    // thuộc vào số lần render chứ không phải thời gian. Đây là bản chất của lỗi
    // đồng hồ nhảy/kẹt, nên assert thẳng tính bất biến: hàm thuần theo `now`.
    const at = pressed(0);
    const expected = 4_321;
    for (let i = 0; i < 50; i += 1) {
      expect(remainingMs(at, 5_679)).toBe(expected);
      expect(isCooling(at, 5_679)).toBe(true);
    }
  });

  it("tạm chuyển tab: thời gian trôi mà không render thì số còn lại vẫn đúng", () => {
    // Tab bị ẩn thì trình duyệt hãm timer. Một bộ đếm giảm từng nhịp sẽ đứng yên
    // rồi tụt về 0 trong khi thực tế còn hàng giây — người dùng quay lại thấy
    // đồng hồ chạy ngược. Ở đây mô phỏng đúng việc đó: nhảy thời gian mà **không**
    // gọi `remainingMs` lần nào, rồi đọc một lần.
    const at = pressed(0);
    expect(remainingMs(at, 4_000)).toBe(6_000);
    expect(remainingMs(at, 9_500)).toBe(500);
    // Và nhịp 1 giây đầu tiên sau khi quay lại tab phải đưa đồng hồ về đúng 0, không
    // phải về 0 kiểu "nhảy cóc".
    expect(isCooling(at, FORGOT_COOLDOWN_MS)).toBe(false);
    expect(remainingMs(at, FORGOT_COOLDOWN_MS)).toBe(0);
  });

  it("đồng hồ không bao giờ âm hay bằng 0 lúc đang khoá", () => {
    // Quét cả cửa sổ từng mili giây: miễn là `isCooling` còn đúng thì số còn lại
    // phải dương, và `formatCountdown` không bao giờ hiện "0" trong khi nút còn
    // khoá. Số âm thì nút kẹt vĩnh viễn; "0" thì người dùng đợi hoài không thấy
    // nút mở, bấm thử, bấm không ăn, rồi tưởng nút chết hẳn.
    const at = pressed(0);
    for (let t = 0; t < FORGOT_COOLDOWN_MS; t += 137) {
      expect(isCooling(at, t), `t=${t}`).toBe(true);
      expect(remainingMs(at, t), `t=${t}`).toBeGreaterThan(0);
      expect(formatCountdown(remainingMs(at, t)), `t=${t}`).not.toBe("0");
    }
  });

  it("đồng hồ máy nhảy ngược thì không sinh ra số âm", () => {
    // `now` lùi về trước mốc đã bấm: đồng hồ phải **tăng** (còn nhiều hơn), tuyệt đối
    // không âm. Mốc cũ là lúc bấm, nên phải ra `mốcBấm + 10_000 - now`.
    const at = pressed(100_000);
    const back = 99_000;
    expect(remainingMs(at, back)).toBeGreaterThan(0);
    expect(remainingMs(at, back)).toBe(at - back);
  });
});

describe("không lưu bền: F5 bypass được, và đó là chủ ý", () => {
  it("không đụng tới storage ở bất kỳ đâu trong luồng này", () => {
    // Chủ repo chốt: chỉ cần cooldown, số lần bấm trước đó không lưu bền, nên F5
    // bypass được và điều đó được chấp nhận. Assert thẳng rằng **không còn** code
    // đọc/ghi storage: nếu sau này ai thêm vào, test này đỏ trước khi lớp bề mặt
    // của cooldown lệch với lời hứa "không lưu bền".
    for (const [ten, src] of [["forgot-limit.ts", LIB_SRC], ["page.tsx", PAGE_SRC]] as const) {
      expect(
        stripBlockComments(src),
        `${ten} không được lưu bền cooldown`,
      ).not.toMatch(/sessionStorage|localStorage/);
    }
  });

  it("mount lại thì bắt đầu từ đầu, không nhớ lần bấm trước", () => {
    // Hệ quả trực tiếp của việc không lưu: trạng thái ban đầu của component là
    // `cooldown = 0`. "F5" ở đây là state sạch — không có đường nào đọc lại được mốc
    // cũ, nên nút rảnh ngay.
    expect(isCooling(0, 0)).toBe(false);
    expect(remainingMs(0, 0)).toBe(0);
  });
});

describe("đồng hồ hiển thị", () => {
  it("số giây làm tròn lên, không bao giờ 0 giây lúc còn khoá", () => {
    expect(formatCountdown(0)).toBe("0");
    expect(formatCountdown(1)).toBe("1");
    expect(formatCountdown(1_000)).toBe("1");
    // 1ms dương là 1 giây chứ không phải 0: làm tròn xuống ở đây là nói dối.
    expect(formatCountdown(1_001)).toBe("2");
    expect(formatCountdown(9_999)).toBe("10");
    expect(formatCountdown(FORGOT_COOLDOWN_MS)).toBe("10");
    expect(formatCountdown(-5_000)).toBe("0");
  });

  it("ghim số, và câu báo nhắc đúng số đó", () => {
    // Đổi `FORGOT_COOLDOWN_MS` mà quên sửa câu thì người dùng được hứa một số giây
    // khác với số giây họ thật sự phải chờ.
    expect(FORGOT_COOLDOWN_MS).toBe(10_000);
    const seconds = FORGOT_COOLDOWN_MS / 1000;
    expect(cooldownMessage()).toContain(`${seconds} giây`);
  });
});

describe("nguyên tắc an toàn của câu báo", () => {
  it("câu khoá nói rõ nút tự mở lại — đây là cooldown, không phải khoá", () => {
    const msg = cooldownMessage();
    expect(msg).toContain("tự mở lại");
    // Nói rõ không khoá gì cả: đọc xong mà hiểu là mình vừa tự khoá tài khoản của
    // mình thì lần cooldown này đã thành công cụ tấn công.
    expect(msg).toMatch(/không có gì bị khoá/);
  });

  it("câu mở lại nói rõ là đã bấm lại được", () => {
    // Bỏ trống thì người dùng đọc bằng tai không có tín hiệu nào cho biết lúc nào
    // được bấm lại.
    expect(unlockedMessage()).toMatch(/mở lại/);
    expect(unlockedMessage()).toMatch(/bấm lại/);
  });

  it("không câu nào lộ ra có tồn tại tài khoản", () => {
    // Nguyên tắc của cả luồng: khác biệt nằm ở việc *có gửi mail hay không*,
    // không nằm ở câu trả lời. Câu nào nhắc tài khoản là tự phá nguyên tắc.
    for (const msg of [cooldownMessage(), unlockedMessage()]) {
      expect(msg, "không được nhắc email").not.toMatch(/@|\.com|\.vn|email/i);
      expect(msg, "không được khẳng định có tài khoản").not.toMatch(/tài khoản của bạn|đã gửi|đã tạo/i);
    }
  });
});

describe("component nối đúng vào cooldown", () => {
  const handler = PAGE_SRC.slice(PAGE_SRC.indexOf("async function onSubmit"));

  it("chặn bấm bằng biến thật, không đọc state của React", () => {
    // `vitest.config.ts` chạy `environment: 'node'`, không jsdom, nên không dựng
    // được component. Đọc source là cách duy nhất canh được chỗ nối — và chỗ nối
    // chính là chỗ dễ sót: logic ở `forgot-limit.ts` đúng mà component quên chốt
    // thì cooldown không tồn tại.
    //
    // Vì sao phải là biến thật: state React là **ảnh chụp theo lần render**, nên
    // lần bấm thứ hai trong cùng nhịp đọc ra `cooldown === 0` và chạy
    // `requestPasswordReset` thêm lần nữa — "mỗi lần bấm khoá 10 giây" thành vô
    // nghĩa ngay ở lần bấm kép đầu tiên. Cùng lý do `createAuthRunner` giữ cờ
    // chờ bằng biến thật.
    expect(PAGE_SRC).toMatch(/const cooldownRef = useRef\(/);
    expect(PAGE_SRC).toMatch(/const sendingRef = useRef\(/);
    expect(handler).toMatch(/if \(isCooling\(cooldownRef\.current, Date\.now\(\)\)\) return;/);
  });

  it("chặn bấm ngay ở đầu handler, trước lúc gọi mạng", () => {
    // Bỏ `return` này thì `isCooling` vẫn chạy, nhưng `requestPasswordReset` cũng
    // chạy — tức bấm vô hạn, đúng cái cooldown này chặn. Guard phải **trả về
    // ngay**; chỉ nhắc `cooldownRef` rồi chạy tiếp là không được.
    const guardAt = handler.indexOf("isCooling(cooldownRef.current");
    expect(guardAt, "onSubmit phải tự kiểm cooldown").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(handler.indexOf("requestPasswordReset"));
  });

  it("đặt mốc hết hạn đồng bộ, trước lúc chờ mạng", () => {
    // Đặt sau `await` thì lần bấm kép thứ hai lọt qua guard (state chưa kịp
    // render) và cả hai cùng gửi. Mốc phải có **trước** lần gọi mạng.
    const setAt = handler.indexOf("cooldownRef.current = cooldownUntil(Date.now())");
    expect(setAt, "phải đặt mốc hết hạn trong handler").toBeGreaterThan(-1);
    expect(setAt).toBeLessThan(handler.indexOf("requestPasswordReset"));
  });

  it("nút khoá theo cooldown chứ không chỉ theo busy", () => {
    // Bỏ `cooling` khỏi `disabled` là bỏ đúng cái chặn bấm mà cả bài này dựng.
    const disabled = PAGE_SRC.match(/disabled=\{[^}]*\}/g) ?? [];
    expect(disabled.join(" ")).toMatch(/cooling/);
    // `busy` vẫn phải còn: mất nó là mất khuôn chờ của commit 2a023e8.
    expect(disabled.join(" ")).toMatch(/busy/);
  });

  it("giữ nguyên khuôn nút đang chờ: LoaderCircle + aria-busy", () => {
    // Khuôn có sẵn ở màn này từ 2a023e8; cooldown không được phát minh khuôn mới.
    expect(PAGE_SRC).toMatch(/aria-busy=\{busy\}/);
    expect(PAGE_SRC).toMatch(/\{busy && <LoaderCircle/);
    expect(PAGE_SRC).toMatch(/\{busy \? "Đang gửi…"/);
  });

  it("đồng hồ đếm ngược được vẽ ra, không chỉ khoá nút", () => {
    expect(PAGE_SRC).toMatch(/formatCountdown\(/);
  });

  it("tự huỷ timer: dừng khi hết hạn, và dừng khi rời trang", () => {
    // Interval quay vô hạn thì nó giữ component sống và giữ một timer chạy trên
    // màn hình đã không còn việc gì. Ba chỗ phải có: dừng khi `cooldown` về 0,
    // cleanup của effect, và không tạo interval khi không khoá.
    expect(PAGE_SRC).toMatch(/if \(cooldown === 0\) return;/);
    expect(PAGE_SRC).toMatch(/setInterval\(/);
    expect(PAGE_SRC).toMatch(/return \(\) => clearInterval\(id\);/);
    // Đồng hồ phải được đặt lại từ mốc, không phải trừ dần mỗi giây.
    expect(PAGE_SRC).toMatch(/remainingMs\(cooldown, Date\.now\(\)\)/);
  });

  it("thông báo cooldown tới được trình đọc màn hình", () => {
    // Không chỉ đổi màu: cần một vùng `role="status"` để đọc bằng tai.
    //
    // **Bắt đúng vùng `sr-only`**, không bắt `role="status"` ở bất cứ đâu trang:
    // trang này còn một vùng `role="status"` khác cho câu "đã gửi link", và comment
    // cũng nhắc `role="status"`. Assert toàn cục thì bỏ vùng này đi vẫn xanh —
    // đúng loại test tự lừa mình.
    const srOnly = PAGE_SRC.match(/<p[^>]*className="sr-only"[^>]*>/);
    expect(srOnly, "phải có vùng sr-only cho trình đọc màn hình").not.toBeNull();
    const open = srOnly![0];
    expect(open, "vùng sr-only phải là role=status").toMatch(/role="status"/);
    expect(open, "phải nói rõ polite để không cắt ngang").toMatch(/aria-live="polite"/);
    // Vùng phải **luôn có mặt** trong DOM, rỗng khi không khoá: `role="status"` chỉ
    // đọc phần chữ được thêm vào sau này, nên đóng rồi mở thì trình đọc màn hình
    // đọc lúc đóng chứ không đọc lúc mở.
    const body = PAGE_SRC.slice(PAGE_SRC.indexOf(open) + open.length);
    expect(body.slice(0, body.indexOf("</p>"))).toContain("statusText");
  });

  it("đồng hồ từng giây nằm NGOÀI vùng status, để không spam trình đọc màn hình", () => {
    // Đây là lỗi a11y tinh vi nhất của bài này và rất dễ quay lại: bỏ `aria-hidden`
    // ở đồng hồ thì nó rơi vào vùng `status`, nội dung đổi mỗi giây, và trình đọc
    // màn hình đọc mỗi giây — đúng lúc người dùng đang cần tập trung để tìm cách
    // vào lại tài khoản. `kicker.test.ts` đã có tiền lệ kiểu chặn này: test đọc
    // source thay vì tin rằng "nó vẫn render được".
    const countdownAt = PAGE_SRC.indexOf("formatCountdown(remaining)");
    expect(countdownAt, "phải vẽ đồng hồ").toBeGreaterThan(-1);

    // Tìm **thẻ mở** của phần tế chứa đồng hồ, không phải `aria-hidden` ở đâu khác
    // trên trang (trang này có nhiều icon `aria-hidden` rải rác, và bản thân dòng
    // đồng hồ nằm ở dòng sau thẻ mở vì JSX xuống dòng cho dễ đọc).
    const tagStart = PAGE_SRC.lastIndexOf("<p", countdownAt);
    const openTag = PAGE_SRC.slice(tagStart, PAGE_SRC.indexOf(">", tagStart) + 1);
    expect(
      openTag,
      "thẻ chứa đồng hồ phải có aria-hidden để không bị đọc mỗi giây",
    ).toMatch(/^<p[^>]*aria-hidden/);

    // Và phải **nằm sau** vùng `status`, tức không phải con của nó.
    expect(countdownAt).toBeGreaterThan(PAGE_SRC.indexOf('aria-atomic="true"'));

    // Đồng hồ vẫn phải là **chữ thật**, không phải chỉ báo bằng màu: `aria-hidden`
    // chỉ giấu khỏi trình đọc màn hình, người dùng mắt vẫn phải đọc được con số.
    expect(openTag).not.toMatch(/sr-only/);
  });

  it("lối thoát luôn bấm được, kể cả khi đang khoá", () => {
    // Liên kết `/sign-in` phải nằm ngoài điều kiện `cooling` — khoá luôn cả nó thì
    // lần cooldown này biến thành ngõ cụt, đúng thứ tuyệt đối tránh.
    const links = PAGE_SRC.match(/<Link[\s\S]{0,200}?href="\/sign-in"/g) ?? [];
    expect(links.length, "phải còn lối thoát tới trang đăng nhập").toBeGreaterThan(0);

    // Khối cooldown chỉ được là dòng chữ, không được nuốt mất lối thoát và không
    // được chứa nút `disabled` — `disabled` trong khối hết hạn là ngõ cụt.
    const from = PAGE_SRC.indexOf("{cooling && (");
    const to = PAGE_SRC.indexOf("formatCountdown(remaining)", from);
    const block = PAGE_SRC.slice(from, to);
    expect(block, "khối cooldown phải tồn tại").not.toBe("");
    expect(block, "trong khối cooldown không được có nút disabled").not.toMatch(/<button/);
    // Và đường ra phải nằm **ngoài** khối đó.
    expect(PAGE_SRC.indexOf('href="/sign-in"')).toBeGreaterThan(to);
  });
});
