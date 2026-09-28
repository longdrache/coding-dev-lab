"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, LoaderCircle, MailCheck } from "lucide-react";
import AuthShell from "@/app/ui/AuthShell";
import { MIN_NEW_PASSWORD, RESET_LINK_HOURS, submitNewPassword } from "@/lib/password-reset";

/** Lâu hơn `REDIRECT_MS` để đọc nốt câu "đã đổi mật khẩu" trước khi rời trang. */
const REDIRECT_MS = 2500;

/**
 * Phần đọc query tách riêng khỏi `page.tsx` vì **`useSearchParams` bắt buộc phải
 * nằm trong một `<Suspense>`** ở App Router: Next dựng route này tĩnh lúc build,
 * mà đọc query cần request thật — không có ranh giới `Suspense` thì `next build`
 * fail với "useSearchParams() should be wrapped in a suspense boundary".
 */
function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Đếm ngược tự chuyển về `/sign-in`, và phải huỷ khi component unmount. */
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectRef.current !== null) clearTimeout(redirectRef.current);
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await submitNewPassword(token, password);
      // Chỉ báo thành công khi BE **thật sự** đổi được. Coi mọi response là xong
      // thì link chết cũng hiện màn "Đã đổi mật khẩu" rồi đưa người dùng sang
      // trang đăng nhập — họ tin là đã đổi xong, vào lại thì bị từ chối, và không
      // có dòng nào giải thích vì sao.
      if (r.kind === "error") {
        setError(r.message);
        return;
      }
      setDone(true);
      redirectRef.current = setTimeout(() => router.push("/sign-in"), REDIRECT_MS);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className={CARD}>
        <p role="alert" className="flex gap-2 text-sm leading-relaxed text-rose-600">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Link này thiếu mã. Mở lại đúng link trong email đặt lại mật khẩu, hoặc{" "}
            <Link href="/forgot-password" className="font-medium text-zinc-900 underline underline-offset-4 hover:text-emerald-700">
              xin một link mới
            </Link>
            .
          </span>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={CARD}>
        <h2 className={TITLE}>Đã đổi mật khẩu</h2>
        <p className={BODY}>
          Mọi phiên đang mở trên các thiết bị khác đã bị đóng. Đang đưa bạn sang trang đăng
          nhập…
        </p>
        <Link href="/sign-in" className={`${PRIMARY} mt-5`}>
          Đăng nhập ngay
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD} space-y-5`} aria-busy={busy}>
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="block text-sm font-medium text-zinc-800">
          Mật khẩu mới
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_NEW_PASSWORD}
          aria-describedby="new-password-hint"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
        <p id="new-password-hint" className="text-xs text-zinc-500">
          Ít nhất {MIN_NEW_PASSWORD} ký tự. Đổi xong bạn sẽ bị đăng xuất khỏi mọi thiết bị.
        </p>
      </div>

      <p className="flex gap-2.5 text-xs leading-relaxed text-zinc-600">
        <MailCheck aria-hidden className="mt-px size-4 shrink-0 text-emerald-700" />
        <span>Link này hết hạn sau {RESET_LINK_HOURS} giờ và chỉ dùng được một lần.</span>
      </p>

      {error && (
        <p role="alert" className="flex gap-2 text-sm leading-relaxed text-rose-600">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy && <LoaderCircle aria-hidden className={SPINNER} />}
        {busy ? "Đang lưu…" : "Đổi mật khẩu"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell kicker="// new password" title="Đặt mật khẩu mới.">
      <Suspense
        fallback={
          // Trạng thái loading thật, không phải chấm chờ: `useSearchParams` chỉ
          // trả về ở client, nên lần render đầu luôn rơi vào đây.
          <div className={CARD} role="status">
            <span className={SPINNER_SOLO} />
            <p className={`${BODY} mt-3`}>Đang mở link đặt lại mật khẩu…</p>
          </div>
        }
      >
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}

/** Thẻ trắng viền hairline + một bóng rất mềm — đúng card của app, không nặng hơn. */
const CARD = "w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
/**
 * `tracking-wide` chứ không phải `tracking-widest`: `DESIGN.md` ghim
 * `letterSpacing: 0.04em` cho mono-label. `emerald-700` (5.5:1) thay vì
 * `emerald-600` (3.8:1) vì nhãn này nhỏ — cần mức tương phản của chữ thường.
 */
const TITLE = "mt-2.5 font-display text-xl font-bold tracking-tight text-zinc-950";
const BODY = "mt-2 text-sm leading-relaxed text-zinc-600";
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
const SPINNER_SOLO = "block size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 motion-reduce:animate-none";
