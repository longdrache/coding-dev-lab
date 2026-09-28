import AuthForm from "@/app/ui/AuthForm";
import AuthShell from "@/app/ui/AuthShell";
import { safeRedirect } from "@/lib/auth-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập GoCode để lưu streak, lịch sử nộp bài và huy hiệu.",
  openGraph: { title: "Đăng nhập | GoCode" },
};

/**
 * `?redirect_url=` là nơi người dùng định tới trước khi bị chặn — ví dụ mở
 * `/problem/two-sum` thì `app/problem/page.tsx` đẩy sang
 * `/sign-in?redirect_url=/problem/two-sum`. Trước đó tham số này được **gửi đi
 * nhưng không ai đọc**, nên đăng xong mất luôn bài đang định làm.
 *
 * Đọc ở server component rồi truyền xuống, **không** dùng `useSearchParams`:
 * Next 16 yêu cầu bọc `useSearchParams` trong `Suspense` khi build, sẽ làm
 * `next build` hỏng. `safeRedirect` loại URL ngoài (open redirect).
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const { redirect_url } = await searchParams;
  const redirectTo = safeRedirect(Array.isArray(redirect_url) ? redirect_url[0] : redirect_url);

  return (
    <AuthShell kicker="// welcome back" title="Chào mừng trở lại sân luyện.">
      <AuthForm mode="signin" redirectTo={redirectTo} />
    </AuthShell>
  );
}
