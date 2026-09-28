import AuthForm from "@/app/ui/AuthForm";
import AuthShell from "@/app/ui/AuthShell";
import VerifyEmail from "@/app/ui/VerifyEmail";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng ký",
  description: "Tạo tài khoản GoCode miễn phí — 56 bài, 8 ngôn ngữ, chấm batch 10.",
  openGraph: { title: "Đăng ký | GoCode" },
};

/**
 * Trang này có hai vai, phân biệt bằng `?token=` trong link mail
 * (`be/src/auth/auth.service.ts:189`):
 *
 * 1. Có `token` → mở link xác nhận: hiện `VerifyEmail`, dùng token đó xác minh
 *    và đăng nhập. Không hiện form, vì người dùng đã có tài khoản rồi.
 * 2. Không có `token` → form đăng ký như bình thường.
 *
 * `searchParams` của Next 16 là Promise nên phải `await`; xem
 * `node_modules/next/dist/docs/` trước khi đổi cách gọi.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const raw = Array.isArray(token) ? token[0] : token;

  return (
    <AuthShell kicker="// join_56_bai" title="Tạo tài khoản, giải bài đầu tiên hôm nay.">
      {raw ? <VerifyEmail token={raw} /> : <AuthForm mode="signup" />}
    </AuthShell>
  );
}
