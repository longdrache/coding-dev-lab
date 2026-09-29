"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, LoaderCircle, MailCheck, Timer } from "lucide-react";
import AuthShell from "@/app/ui/AuthShell";
import { normalizeEmail } from "@/lib/auth-form";
import { RESET_LINK_HOURS, requestPasswordReset } from "@/lib/password-reset";
import {
  FORGOT_COOLDOWN_MS,
  cooldownMessage,
  cooldownUntil,
  formatCountdown,
  isCooling,
  remainingMs,
  unlockedMessage,
} from "@/lib/forgot-limit";

/**
 * Quên mật khẩu — trang **Operate**: người tới đây đã biết mình có tài khoản và
 * chỉ cần lấy lại quyền truy cập. Không pitch lần nào ở đây.
 *
 * Mọi quyết định về endpoint và cách dịch lỗi BE nằm ở `@/lib/password-reset`,
 * mọi quyết định về cooldown nằm ở `@/lib/forgot-limit` — hai file .ts thuần,
 * test được (xem `vitest.config.ts`: chỉ `environment: 'node'`, không jsdom, nên
 * logic đáng test buộc phải nằm ngoài component).
 *
 * Màn này **không bao giờ** nói email có tài khoản hay không: BE trả 200 với cùng
 * một câu cho mọi trường hợp, và nếu ở đây ta tự suy ra từ response thì trang này
 * trở thành công cụ dò email — đúng thứ BE cả hai endpoint đều dựng để tránh.
 * Cooldown cũng tính từ lúc bấm chứ không từ kết quả, nên nó tăng như nhau với
 * mọi email.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * Mốc thời gian hết hạn của cooldown, `0` = không khoá. Đây là **nguồn sự thật**:
   * đồng hồ không trừ dần mà luôn tính lại từ mốc này (xem `forgot-limit.ts`), nên
   * tạm chuyển tab hay render lại cũng không làm đồng hồ nhảy hay kẹt.
   */
  const [cooldown, setCooldown] = useState(0);
  /** Còn bao lâu thì mở lại, mili giây. Chỉ để vẽ. */
  const [remaining, setRemaining] = useState(0);
  /**
   * Câu trong vùng `role="status"`. Tách khỏi `remaining` vì đồng hồ đếm ngược
   * **không** được nằm trong vùng đó: nội dung đổi mỗi giây thì trình đọc màn
   * hình đọc mỗi giây, tức spam người dùng đúng lúc họ đang cần tập trung để tìm
   * cách vào lại. Vùng `status` chỉ đổi khi **trạng thái** đổi: khoá, rồi mở lại.
   */
  const [statusText, setStatusText] = useState("");
  /**
   * Hai cờ chặn bấm, giữ trong ref chứ không đọc từ state.
   *
   * State React là **ảnh chụp theo lần render**: hai lần bấm trong cùng nhịp thì
   * lần thứ hai vẫn đọc ra `busy === false` và `cooldown === 0`, và chạy
   * `requestPasswordReset` thêm một lần nữa — tức "mỗi lần bấm khoá 10 giây" thành
   * vô nghĩa ngay lần bấm kép đầu tiên. `disabled` của nút cũng không cứu được:
   * nó cũng chỉ có hiệu lực sau khi đã kịp render. Đây đúng là lý do
   * `createAuthRunner` giữ cờ chờ bằng biến thật (`lib/auth-submit.ts`), và ta
   * làm y hệt.
   */
  const cooldownRef = useRef(0);
  const sendingRef = useRef(false);

  /**
   * Nhịp 1 giây, **chỉ** khi đang khoá.
   *
   * Dừng ngay khi hết hạn — `setCooldown(0)` làm effect này chạy lại, cleanup dọn
   * `setInterval` cũ rồi effect mới thoát sớm, nên không sót timer. Dừng cả khi
   * component rời trang: để quay vô hạn thì nó giữ component sống và giữ một
   * timer chạy trên màn hình đã không còn việc gì.
   *
   * `Date.now()` nằm **trong** effect chứ không nằm ở thân render: `react-hooks/
   * purity` cấm gọi hàm impure lúc render, và đó cũng là chỗ đúng để đo — render
   * phải thuần để React Compiler còn dịch được.
   */
  useEffect(() => {
    if (cooldown === 0) return;
    const id = setInterval(() => {
      const left = remainingMs(cooldown, Date.now());
      setRemaining(left);
      if (left === 0) {
        // Báo mở lại **ngay trong nhịp hết hạn**, thay vì để một effect khác lo: gọi
        // `setState` trong thân effect là cascading render, và ở đây không cần.
        setStatusText(unlockedMessage());
        setCooldown(0);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Chặn ở **đầu** handler, trước mọi `await`, và đọc từ ref chứ không từ state:
    // bấm lần hai trong cùng nhịp vừa render phải bị chặn, không chỉ lần bấm sau
    // khi nút đã kịp vẽ lại. `Date.now()` ở đây là bắt buộc: cooldown là một khoảng
    // thời gian, nên tab để ngỏ 20 giây rồi quay lại thì phải thấy nút đã mở.
    if (sendingRef.current) return;
    if (isCooling(cooldownRef.current, Date.now())) return;
    // Đặt mốc **đồng bộ**, trước lúc gọi mạng. Bấm là thao tác của người dùng, còn
    // "gửi được hay không" là việc của máy chủ và câu trả lời của BE không được
    // phân biệt — nên cooldown tính từ lúc bấm chứ không phụ thuộc request có
    // thành công hay không, kể cả khi request sau đó hỏng.
    cooldownRef.current = cooldownUntil(Date.now());
    setCooldown(cooldownRef.current);
    setRemaining(FORGOT_COOLDOWN_MS);
    sendingRef.current = true;
    setError("");
    setMessage("");
    // Báo khoá ngay ở lúc bấm, đồng bộ với lúc nút khoá: câu này vào vùng
    // `role="status"` nên trình đọc màn hình đọc được ngay, không phải chờ nhịp
    // 1 giây kế tiếp mới biết nút vừa bị khoá.
    setStatusText(cooldownMessage());
    setBusy(true);
    try {
      const r = await requestPasswordReset(email);
      if (r.kind === "error") setError(r.message);
      else setMessage(r.message);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  /**
   * Đang khoá hay không, suy ra từ `remaining` chứ không đo lại ở thân render.
   *
   * Render phải thuần (`react-hooks/purity`), nên gọi `Date.now()` ở đây là sai
   * kỹ thuật. Hệ quả cần nói thẳng: tab bị ẩn thì trình duyệt hãm nhịp 1 giây, nên
   * khoảng một giây cuối `remaining` còn cũ và **nút vẫn khoá** thêm tối đa một
   * nhịp sau khi quay lại tab — không phải kẹt, vì nhịp kế tiếp sửa ngay. Nhịp đó
   * không làm hỏng gì: chặn bấm thật vẫn nằm trong `onSubmit` với `Date.now()`
   * tươi, nên kể cả lúc nút vừa mở thì bấm kép vẫn bị chặn đúng.
   */
  const cooling = remaining > 0;

  return (
    <AuthShell title="Lấy lại quyền truy cập.">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        aria-busy={busy}
      >
        <div className="space-y-1.5">
          <label htmlFor="forgot-email" className="block text-sm font-medium text-zinc-800">
            Email đã đăng ký
          </label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </div>

        {/* Nói hạn link TRƯỚC khi bấm. Sau khi bấm thì việc còn lại là đi tìm mail,
            và người dùng không biết mình có bao lâu để tìm. */}
        <p className="flex gap-2.5 text-xs leading-relaxed text-zinc-600">
          <MailCheck aria-hidden className="mt-px size-4 shrink-0 text-emerald-700" />
          <span>
            Link đặt lại mật khẩu hết hạn sau {RESET_LINK_HOURS} giờ. Nếu email đó chưa có tài
            khoản, mình không gửi gì — và không nói cho bạn biết chuyện đó.
          </span>
        </p>

        {error && <ErrorNote message={error} />}
        {message && (
          <p role="status" className="text-sm leading-relaxed text-zinc-700">
            {message} Kiểm tra hộp thư <span className="font-medium text-zinc-900">{normalizeEmail(email)}</span>.
          </p>
        )}

        {/*
          Vùng `role="status"`: đây là thứ tới được trình đọc màn hình, nên thông
          báo cooldown không bao giờ chỉ là một màu chữ hay một dòng `aria-hidden`.
          `aria-live="polite"` nói rõ là đọc sau khi người dùng rảnh tay, không cắt
          ngang.

          Vùng phải **luôn có mặt** trong DOM, rỗng khi không khoá: `role="status"`
          chỉ đọc phần chữ được thêm vào sau này, nên đóng rồi mở thì trình đọc
          màn hình đọc lúc đóng chứ không đọc lúc mở. Giống hệt `PendingStatus` ở
          `AuthForm.tsx`.

          Đồng hồ đếm ngược đặt **ngoài** vùng này, trong `<p>` riêng và
          `aria-hidden`: nó đổi mỗi giây, mà để trong vùng `status` thì trình đọc
          màn hình đọc mỗi giây — tức spam người dùng đúng lúc họ đang cần tập
          trung để tìm cách vào lại tài khoản. Người dùng mắt thấy đồng hồ chạy;
          người dùng tai nghe câu "tạm khoá 10 giây, tự mở lại", và câu đó không
          sai theo thời gian. Câu "đã mở lại" sau đó vẫn vào vùng `status` nên
          được đọc đúng một lần, đúng lúc nó đúng.
        */}
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {statusText}
        </p>

        {cooling && (
          // `aria-hidden` chỉ để **con số** từng giây không bị đọc; nó vẫn là chữ
          // thật chứ không phải chỉ báo bằng màu — người dùng mắt thấy còn bao lâu
          // nữa mà không phải đoán. Cùng thông tin đó nằm trong câu của vùng
          // `status` phía trên cho người dùng tai.
          <p
            data-testid="forgot-cooldown"
            aria-hidden
            className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-zinc-600"
          >
            <Timer className="size-3.5" aria-hidden />
            Nút mở lại sau {formatCountdown(remaining)} giây.
          </p>
        )}

        <button type="submit" disabled={busy || cooling} className={PRIMARY}>
          {busy && <LoaderCircle aria-hidden className={SPINNER} />}
          {busy ? "Đang gửi…" : cooling ? "Tạm khoá, xem đồng hồ bên trên" : "Gửi link đặt lại"}
        </button>

        <p className="text-center text-xs text-zinc-500">
          Nhớ ra rồi?{" "}
          <Link href="/sign-in" className="font-medium text-zinc-900 underline underline-offset-4 hover:text-emerald-700">
            Đăng nhập
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    // `role="alert"` để screen reader đọc ngay khi câu xuất hiện, không cần
    // người dùng đi tìm lại nó.
    <p role="alert" className="flex gap-2 text-sm leading-relaxed text-rose-600">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/** `bg-white` + `ring-offset-white` để vòng focus nhìn thấy trên nền thẻ. */
const INPUT =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-950 " +
  "transition-colors focus:border-zinc-400 focus:bg-white focus:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-zinc-900/15";
const PRIMARY =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 " +
  "text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-zinc-900";
const SPINNER = "size-4 animate-spin motion-reduce:animate-none";
