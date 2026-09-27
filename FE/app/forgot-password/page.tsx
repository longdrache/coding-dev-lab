"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, LoaderCircle, MailCheck } from "lucide-react";
import AuthShell from "@/app/ui/AuthShell";
import { normalizeEmail } from "@/lib/auth-form";
import { RESET_LINK_HOURS, requestPasswordReset } from "@/lib/password-reset";

/**
 * Quên mật khẩu — trang **Operate**: người tới đây đã biết mình có tài khoản và
 * chỉ cần lấy lại quyền truy cập. Không pitch lần nào ở đây.
 *
 * Mọi quyết định về endpoint và cách dịch lỗi BE nằm ở `@/lib/password-reset` —
 * file .ts thuần, test được (xem `vitest.config.ts`: chỉ `environment: 'node'`,
 * không jsdom, nên logic đáng test buộc phải nằm ngoài component).
 *
 * Màn này **không bao giờ** nói email có tài khoản hay không: BE trả 200 với cùng
 * một câu cho mọi trường hợp, và nếu ở đây ta tự suy ra từ response thì trang này
 * trở thành công cụ dò email — đúng thứ BE cả hai endpoint đều dựng để tránh.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const r = await requestPasswordReset(email);
      if (r.kind === "error") setError(r.message);
      else setMessage(r.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell kicker="// reset access" title="Lấy lại quyền truy cập.">
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

        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy && <LoaderCircle aria-hidden className={SPINNER} />}
          {busy ? "Đang gửi…" : "Gửi link đặt lại"}
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
