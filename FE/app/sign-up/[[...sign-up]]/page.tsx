import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import Logo from "@/app/ui/Logo";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng ký",
  description: "Tạo tài khoản GoCode miễn phí — 20 bài, 8 ngôn ngữ, chấm batch 10.",
  openGraph: { title: "Đăng ký | GoCode" },
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 py-10">
      <Logo />
      <SignUp />
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-zinc-800 transition"
      >
        <ArrowLeft className="size-4" />
        Trang chủ
      </Link>
    </div>
  );
}
