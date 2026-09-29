"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, MailCheck, Send } from "lucide-react";
import {
  MIN_PASSWORD_LENGTH,
  VERIFY_LINK_HOURS,
  googleStartUrl,
  normalizeEmail,
  type AuthMode,
} from "@/lib/auth-form";
import { createAuthRunner, pendingLabel, type AuthAction, type AuthPending, type AuthRunner } from "@/lib/auth-submit";
import { useSession } from "./AuthProvider";
import GoogleMark from "./GoogleMark";
import { BODY, CARD, FOOTER, FOOTER_LINK, INPUT, PRIMARY, SECONDARY, SPINNER, TITLE } from "./auth-tokens";

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
 *
 * `@/lib/auth-form` cũng giữ cả bản đồ `OAUTH_MESSAGES`, nên component này
 * chỉ nhận **câu đã dịch** qua prop, không tự tra bản đồ lỗi lần nữa.
 *
 * Phần chờ và hạn thời gian nằm ở `@/lib/auth-submit`, không nằm ở đây: `busy`
 * kiểu cũ chỉ là ảnh chụp theo lần render, nên một lần bấm thứ hai có thể đọc
 * ra `null` và chạy `/register` hai lần — lần hai 409 và **không gửi mail**.
 * Runner giữ chỗ đang chờ bằng biến thật nên bấm lần hai luôn bị chặn, kể cả khi
 * `disabled` của nút chưa kịp được vẽ lại. Ở component này chỉ còn `pending`
 * để vẽ nút, cộng vùng thông báo cho trình đọc màn hình.
 */
export default function AuthForm({
  mode,
  redirectTo = "/",
  oauthNotice,
}: {
  mode: AuthMode;
  /**
   * Đường dẫn người dùng định tới trước khi bị đá sang đây, lấy từ
   * `?redirect_url=` qua `safeRedirect`. Mặc định `/`.
   *
   * **Không còn quyết định đích đến sau khi đăng nhập** — sau khi vào được thì
   * đi thẳng về trang chủ. Prop này còn lại vì nút Google vẫn gửi nó lên BE
   * (`googleStartUrl`), và BE vẫn lưu nó vào dòng `UserOAuthState`; bỏ hẳn sẽ
   * là xoá luôn lớp kiểm `safeInternalPath` ở hai đầu, mà lớp đó phải còn ngay
   * cả khi đích cuối đang là trang chủ.
   */
  redirectTo?: string;
  /**
   * Câu báo về vòng OAuth vừa hỏng, đã dịch sẵn từ `?oauth=` ở server
   * component. `null` khi không có gì để báo.
   */
  oauthNotice?: string | null;
}) {
  const { refresh } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  /** Đang chờ server: `null` = rảnh, còn lại là việc đang chờ. */
  const [pending, setPending] = useState<AuthPending>(null);
  /** Màn kết quả: `sent` = link đã đi, `signedin` = đã có phiên. */
  const [done, setDone] = useState<"sent" | "signedin" | null>(null);
  /** Câu của màn "đã gửi link" sau khi bấm "Gửi lại link" lần nữa. */
  const [notice, setNotice] = useState("");
  /**
   * Giữ qua suốt vòng đời component, tạo **lười** trong handler chứ không phải
   * lúc render: đây là biến mang trạng thái, dựng lại mỗi lần render thì lần
   * bấm kế tiếp sẽ không còn nhớ lần bấm trước và chốt bấm hai lần thành vô
   * hiệu.
   */
  const runnerRef = useRef<AuthRunner | null>(null);

  const isSignup = mode === "signup";
  const submitLabel = isSignup ? "Tạo tài khoản" : "Đăng nhập";
  const toggleHref = isSignup ? "/sign-in" : "/sign-up";
  const toggleLabel = isSignup ? "Đã có tài khoản?" : "Chưa có tài khoản?";
  const toggleAction = isSignup ? "Đăng nhập" : "Đăng ký";
  /** Chữ trên nút lúc đang chờ, hoặc `""` khi rảnh. */
  const waiting = pendingLabel(pending);

  /**
   * Đã có phiên thì đi thẳng về trang chủ.
   *
   * Chạy ở `useEffect` chứ không phải ngay trong `run()` vì `run()` gọi
   * `await refresh()` trước: `AuthProvider` phải kịp đọc lại `/me` và giữ
   * token trong bộ nhớ trước khi rời trang, nếu không thì trang chủ dựng lên
   * với `user = null` rồi nhảy về `/sign-in` — tức đăng nhập xong thì bị đuổi.
   *
   * `router.replace` (chuyển trang mềm) chứ không phải `location.href`: nó giữ
   * nguyên `AuthProvider` và không reload lại tài nguyên. Không có `setTimeout`
   * cố ý — chờ bao lâu cũng là đoán, còn bên dưới đã còn nút "Vào trang chủ" làm
   * đường thoát khi `replace` ném.
   */
  useEffect(() => {
    if (done !== "signedin") return;
    router.replace("/");
  }, [done, router]);

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
   *
   * Mọi quyết định còn lại — chặn bấm hai lần, chờ bao lâu, hết giờ thì nói gì,
   * lỗi nào đọc ra câu nào — nằm ở `@/lib/auth-submit` và có test. Ở đây chỉ
   * truyền `setState` của React vào làm hiệu ứng; `effects` dựng **mỗi lần bấm**
   * nên `refresh` luôn là bản mới nhất, không phải bản của render đầu tiên.
   */
  async function run(action: AuthAction) {
    const runner = (runnerRef.current ??= createAuthRunner());
    await runner.run(
      { action, mode, email, password },
      { setPending, setError, setNotice, setDone, refresh },
    );
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
      <div className={CARD} aria-busy={pending !== null}>
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

        <PendingStatus pending={pending} />

        <button
          type="button"
          onClick={() => void run("resend")}
          disabled={pending !== null}
          className={`${SECONDARY} mt-5`}
        >
          {pending !== null ? (
            <LoaderCircle aria-hidden className={SPINNER} />
          ) : (
            <Send aria-hidden className="size-4" />
          )}
          {waiting || "Gửi lại link"}
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
    // Sau khi đăng nhập xong thì đi thẳng về trang chủ — kể cả khi vào từ
    // `?redirect_url=`. Nút bên dưới **không phải** đường thoát dự phòng cho
    // người bấm nhầm: `router.replace` là chuyển trang mềm, nên nếu nó ném (mạng
    // chặn, middleware lỗi) thì người dùng vẫn còn một cách vào bằng tay.
    return (
      <div className={CARD}>
        <h2 className={TITLE}>Đã đăng nhập</h2>
        <p className={BODY}>Tài khoản đã mở. Đang đưa bạn về trang chủ…</p>
        <Link href="/" className={`${PRIMARY} mt-5`}>
          Vào trang chủ
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD} space-y-5`} aria-busy={pending !== null}>
      <PendingStatus pending={pending} />
      {oauthNotice && (
        // `role="alert"` vì đây là **lý do** người dùng đang không đăng nhập
        // được, và nó xuất hiện ngay khi trang tải — screen reader không báo
        // thì người dùng quay lại `/sign-in?oauth=exists` sẽ thấy một form
        // bình thường chẳng có gì sai, rồi bấm Google lần nữa mãi.
        // Dùng lại đúng khối của màn xác nhận email (`VerifyEmail.tsx:101`)
        // để hai câu "không vào được" trong luồng auth trông như một.
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"
        >
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-amber-700" />
          <p className="text-sm leading-relaxed text-amber-900">{oauthNotice}</p>
        </div>
      )}

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

      {/*
        Nút Google nằm TRÊN nút chính: mốc trên thẻ là `Dùng email và mật khẩu`
        (đã quen, không cần nghĩ), Google là đường thứ hai cho người không muốn
        nhớ mật khẩu. `SECONDARY` (viền, nền trắng) chứ không phải `PRIMARY`:
        hai nút đen đặt cạnh nhau sẽ giống hệt nhau và người dùng không biết
        nút nào là mặc định.
      */}
      <a href={googleStartUrl(redirectTo)} className={`${SECONDARY} mt-3`} data-testid="google-signin">
        <GoogleMark aria-hidden className="size-4" />
        Tiếp tục với Google
      </a>

      <button type="submit" disabled={pending !== null} className={PRIMARY}>
        {pending !== null && <LoaderCircle aria-hidden className={SPINNER} />}
        {waiting || submitLabel}
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

/**
 * Vùng thông báo cho trình đọc màn hình khi đang chờ server.
 *
 * `aria-busy` trên form chỉ nói "chỗ này đang bận" — trình đọc màn hình không đọc
 * được chữ trên nút vì nút đã bị `disabled`, nên người dùng bàn phím bấm xong
 * nghe im lặng y và tưởng bấm trượt. Ở đây câu đang chờ **đọc ra thành tiếng**,
 * nói luôn đang đăng nhập, đang tạo tài khoản hay đang gửi lại link.
 *
 * Vùng phải **luôn có mặt** trong DOM, rỗng khi không chờ: `role="status"` chỉ
 * đọc phần chữ được thêm vào sau này, nên dựng nó đúng lúc bấm thì trình đọc
 * không kịp bắt. `sr-only` vì trạng thái chờ đã hiện bằng chữ trên chính nút
 * rồi — vùng này chỉ phục vụ người không nhìn thấy.
 */
function PendingStatus({ pending }: { pending: AuthPending }) {
  return (
    <p role="status" className="sr-only">
      {pendingLabel(pending)}
    </p>
  );
}

/** Thẻ trắng viền hairline + một bóng rất mềm — đúng card của app, không nặng hơn. */
