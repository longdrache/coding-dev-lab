import { SignUp } from "@clerk/nextjs";
import AuthShell from "@/app/ui/AuthShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng ký",
  description: "Tạo tài khoản GoCode miễn phí — 56 bài, 8 ngôn ngữ, chấm batch 10.",
  openGraph: { title: "Đăng ký | GoCode" },
};

export default function SignUpPage() {
  return (
    <AuthShell kicker="// join_56_bai" title="Tạo tài khoản, giải bài đầu tiên hôm nay.">
      <SignUp />
    </AuthShell>
  );
}
