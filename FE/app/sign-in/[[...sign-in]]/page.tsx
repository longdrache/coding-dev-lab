import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import Logo from "@/app/ui/Logo";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập GoCode để lưu streak, lịch sử nộp bài và huy hiệu.",
  openGraph: { title: "Đăng nhập | GoCode" },
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 py-10">
      <Logo />
      <SignIn />
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
