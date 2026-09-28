"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, LoaderCircle, MailCheck, Send } from "lucide-react";
import {
  MIN_PASSWORD_LENGTH,
  VERIFY_LINK_HOURS,
  normalizeEmail,
  resendVerification,
  submitCredentials,
  type AuthMode,
} from "@/lib/auth-form";
import { useSession } from "./AuthProvider";
import { BODY, CARD, FOOTER, FOOTER_LINK, INPUT, KICKER, PRIMARY, SECONDARY, SPINNER, TITLE } from "./auth-tokens";

/**
 * Form đăng nhập / đăng ký, thay `<SignIn>` / `<SignUp>` của nhà cung cấp danh
 * tính cũ.
 *
 * Trang là **Operate**: người tới đây đã biết GoCode và chỉ muốn vào dùng. Phần
 * thuyết phục đã nằm hết ở cột trái `AuthShell`, nên form này không lặp lại
 * một lời quảng cáo nào. Nó làm đúng ba việc: nhận email + mật khẩu, nói rõ
 * **trước khi** bấm đăng ký rằng sẽ phải xác minh email, và đưa người dùng tới
 * chỗ cần tới sau khi xong.
 *
 * Mọi quyết định về endpoint và về việc dịch lỗi BE sang tiếng Việt nằm ở
 * `@/lib/auth-form` — file .ts thuần, test được. Ở trong component thì một bản
 * đồ lỗi bỏ sót một câu sẽ không bị test nào báo, vì `vitest.config.ts` chỉ có
 * `environment: 'node'`, không jsdom (`api.ts` tách `commitSession` ra cũng vì
 * đúng lý do này).
 */
export default function AuthForm({
  mode,
  redirectTo = "/",
}: {
  mode: AuthMode;
  /**
   * Đích đến sau khi đăng nhập, lấy từ `?redirect_url=` qua `safeRedirect`.
   * Mặc định `/` (trang chủ) khi người dùng vào thẳng `/sign-in`.
   */
  redirectTo?: string;
}) {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** Màn kết quả: `sent` = link đã đi, `signedin` = đã có phiên. */
  const [done, setDone] = useState<"sent" | "signedin" | null>(null);
  /** Câu của màn "đã gửi link" sau khi bấm "Gửi lại link" lần nữa. */
  const [notice, setNotice] = useState("");

  const isSignup = mode === "signup";
  const submitLabel = isSignup ? "Tạo tài khoản" : "Đăng nhập";
  const toggleHref = isSignup ? "/sign-in" : "/sign-up";
  const toggleLabel = isSignup ? "Đã có tài khoản?" : "Chưa có tài khoản?";
  const toggleAction = isSignup ? "Đăng nhập" : "Đăng ký";

  /**
   * Một đường duy nhất cho cả lần bấm đầu và lần bấm "gửi lại", nên hai màn
   * kết quả không thể lệch nhau vì copy-paste.
   *
   * `action` phân biệt hai việc **khác nhau về bản chất**: đăng ký thì tạo tài
   * khoản, còn gửi lại thì chỉ phát lại link. Không thể dùng chung
   * `submitCredentials("signup", …)` cho cả hai — tài khoản vừa đăng ký chắc chắn
   * đã tồn tại, nên `/register` trả 409 và **không gửi mail**: nút "Gửi lại link"
   * chết đúng lúc cần nhất. `resendVerification` là route riêng, trả 200 với
   * cùng một câu cho mọi trạng thái tài khoản.
   */
  async function run(action: "submit" | "resend") {
    setError("");
    if (action === "resend") setNotice("");
    setBusy(true);
    try {
      if (action === "resend") {
        const r = await resendVerification(email);
        if (r.kind === "error") setError(r.message);
        else setNotice(r.message);
        return;
      }
      const r = await submitCredentials(mode, email, password);
      if (r.kind === "error") {
        setError(r.message);
      } else if (isSignup) {
        // `/register` trả 200 **không** kèm cookie phiên (`auth.controller.ts:123`):
        // tài khoản mới chỉ dùng được sau khi mở link xác nhận. Gọi `refresh()`
        // ở đây sẽ đọc `/me` ra `null` và bỏ người dùng ở trang trắng không có
        // một dòng giải thích nào.
        setDone("sent");
      } else {
        // `refresh` đọc lại `/me` nên `useSession().user` có giá trị ngay, và
        // `AuthProvider` tự hẹn lịch làm mới token từ `expiresIn` vừa nhận.
        await refresh();
        setDone("signedin");
      }
    } catch {
      // `submitCredentials` tự dịch lỗi mạng thành `kind: "error"` rồi, nên
      // nhánh này chỉ còn để đỡ `refresh()`. `loadSession` tự nuốt lỗi nên
      // hiện chưa tới được — nhưng một lần reject ở đây không được nổi ra ngoài
      // và biến thành màn trắng.
      setError("Không đăng nhập được. Thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void run("submit");
  }

  if (done === "sent") {
    return (
      // Hai màn kết quả dùng **margin tường minh** chứ không `space-y-*`: ở đây ta
      // cần heading có khoảng trên rộng hơn khoảng dưới, mà `space-y-4 > *` thắng
      // `mt-2.5` về độ ưu tiên nên không dùng chung được hai kiểu.
      <div className={CARD}>
        <p className={KICKER}>{"// check your inbox"}</p>
        <h2 className={TITLE}>Kiểm tra hộp thư</h2>
        <p className={BODY}>
          Mình vừa gửi link xác nhận tới{" "}
          <span className="break-all font-medium text-zinc-900">{normalizeEmail(email)}</span>. Mở link đó là vào
          được luôn — không mở thì tài khoản chưa dùng được. Link hết hạn sau {VERIFY_LINK_HOURS} giờ.
        </p>

        {error && (
          <div className="mt-4">
            <ErrorNote message={error} />
          </div>
        )}

        {notice && (
          // `role="status"` để screen reader đọc ngay khi bấm "Gửi lại link" xong,
          // không cần người dùng đi tìm lại dòng xác nhận.
          <p role="status" className="mt-4 text-sm leading-relaxed text-zinc-700">
            {notice}
          </p>
        )}

        <button
          type="button"
          onClick={() => void run("resend")}
          disabled={busy}
          className={`${SECONDARY} mt-5`}
        >
          {busy ? <LoaderCircle aria-hidden className={SPINNER} /> : <Send aria-hidden className="size-4" />}
          {busy ? "Đang gửi lại…" : "Gửi lại link"}
        </button>

        <p className={`${FOOTER} mt-4`}>
          Xác minh xong rồi?{" "}
          <Link href="/sign-in" className={FOOTER_LINK}>
            Đăng nhập
          </Link>
        </p>
      </div>
    );
  }

  if (done === "signedin") {
    // Người dùng mở `/problem/two-sum` rồi bị đá sang đây sẽ phải quay lại đúng
    // bài đó; nếu vào thẳng `/sign-in` thì về trang chủ như trước.
    const wentToProblem = redirectTo !== "/";
    return (
      <div className={CARD}>
        <p className={KICKER}>{"// signed in"}</p>
        <h2 className={TITLE}>Đã đăng nhập</h2>
        <p className={BODY}>
          {wentToProblem
            ? "Tài khoản đã mở. Quay lại bài bạn đang làm."
            : "Tài khoản đã mở. Vào trang chủ để luyện tiếp bài đang dở."}
        </p>
        <Link href={redirectTo} className={`${PRIMARY} mt-5`}>
          {wentToProblem ? "Quay lại bài đang làm" : "Vào trang chủ"}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD} space-y-5`} aria-busy={busy}>
      <div className="space-y-1.5">
        <label htmlFor="auth-email" className="block text-sm font-medium text-zinc-800">
          Email
        </label>
        <input
          id="auth-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="auth-password" className="block text-sm font-medium text-zinc-800">
          Mật khẩu
        </label>
        <input
          id="auth-password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          // Chỉ ràng ở chế độ đăng ký: ở chế độ đăng nhập, một tài khoản tạo từ
          // thời còn dùng thư viện xác thực cũ có thể còn mật khẩu ngắn hơn, và
          // chặn ở trình duyệt sẽ chặn nhầm người dùng hợp lệ với một câu không
          // giải thích được.
          minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
          aria-describedby={isSignup ? "auth-password-hint" : undefined}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
        {isSignup && (
          <p id="auth-password-hint" className="text-xs text-zinc-500">
            Ít nhất {MIN_PASSWORD_LENGTH} ký tự.
          </p>
        )}
      </div>

      {isSignup && (
        // Nói TRƯỚC khi bấm, không phải chỉ sau khi đăng ký xong. Bấm xong thì
        // tài khoản đã tồn tại và cách vào duy nhất là mở link — biết hạn 24
        // giờ từ trước là thứ tiết kiệm được một lượt đi lại với support.
        <p className="flex gap-2.5 text-xs leading-relaxed text-zinc-600">
          <MailCheck aria-hidden className="mt-px size-4 shrink-0 text-emerald-600" />
          <span>
            GoCode gửi link xác nhận tới email này. Phải mở link đó mới đăng nhập được, và link hết hạn sau{" "}
            {VERIFY_LINK_HOURS} giờ.
          </span>
        </p>
      )}

      {error && <ErrorNote message={error} />}

      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy && <LoaderCircle aria-hidden className={SPINNER} />}
        {busy ? "Đang xử lý…" : submitLabel}
      </button>

      {/* Ở chế độ đăng nhập thêm link "Quên mật khẩu?" — đó là lúc người dùng
          thật sự cần nó. Ở chế độ đăng ký thì không: link này đã thuộc cặp trang
          kia, thêm vào đây là thêm một đường thoát khỏi một màn chưa xong. */}
      <p className={FOOTER}>
        {toggleLabel}{" "}
        <Link href={toggleHref} className={FOOTER_LINK}>
          {toggleAction}
        </Link>
        {!isSignup && (
          <>
            {" · "}
            <Link href="/forgot-password" className={FOOTER_LINK}>
              Quên mật khẩu?
            </Link>
          </>
        )}
      </p>
    </form>
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

/** Thẻ trắng viền hairline + một bóng rất mềm — đúng card của app, không nặng hơn. */
