import { SignIn } from "@clerk/nextjs";
import AuthShell from "@/app/ui/AuthShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập GoCode để lưu streak, lịch sử nộp bài và huy hiệu.",
  openGraph: { title: "Đăng nhập | GoCode" },
};

export default function SignInPage() {
  return (
    <AuthShell kicker="// welcome back" title="Chào mừng trở lại sân luyện.">
      <SignIn />
    </AuthShell>
  );
}
