import Link from "next/link";
import Logo from "@/app/ui/Logo";
import Pricing from "@/app/ui/Pricing";
import PremiumGuard from "./PremiumGuard";
import { ArrowLeft } from "lucide-react";
import { Metadata } from "next";
// const plans = [
//   { id: "monthly", label: "Monthly", price: "1vnd", detail: "per month" },
//   { id: "yearly", label: "Yearly", price: "2vnd", detail: "per year" },
// ] as const;

export const metadata: Metadata = {
  title: "Bảng giá",
  description: "Mô tả trang web",
  keywords: ["nextjs", "react", "web"],
  generator: "Next.js",
  applicationName: "GoCode",
  openGraph: {
    title: "Bảng giá",
    description: "",
    url: 'https://fe-p.vercel.app"',
    siteName: "GoCode",
    images: [
      {
        url: "https://fe-p.vercel.app/logo.png",
        width: 1200,
        height: 630,
        alt: "GoCode",
      },
    ],
    locale: "vi_VN",
    type: "website", // hoặc 'article', 'profile'...
  },
};
export default function PremiumPage() {
  return (
    <main className="min-h-screen bg-[#1a1a1a] text-[#f5f1e8]">
      <PremiumGuard />
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#1a1a1a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6 sm:px-10">
          <div className="flex items-center gap-8">
            <Logo theme="dark" />
            <nav className="hidden items-center gap-6 text-sm text-white/60 md:flex">
              <Link href="/problem" className="transition hover:text-white">
                Bài tập
              </Link>
              <Link href="/#topics" className="transition hover:text-white">
                Dạng bài
              </Link>
              <Link href="/qna" className="transition hover:text-white">
                Hỏi đáp
              </Link>
            </nav>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 shadow hover:bg-zinc-100 transition"
          >
            <ArrowLeft className="size-4" />
            Trang chủ
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-12 sm:px-10">

        <div
          id="plans-section"
          className="mt-10 mb-10 flex flex-col items-center text-center"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-3.5 rounded-full bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 mb-3 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-[#ffa116]"></span>
            <span>GoCode Premium • 20 bài • 8 ngôn ngữ • Batch 10</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center justify-center gap-2.5 flex-wrap">
            <span className="text-neutral-200 flex items-center gap-1.5">
              <span>⏱️</span>
              <span>Linh hoạt</span>
            </span>
            <span className="text-neutral-500 font-normal">&bull;</span>
            <span className="text-[#ffa116] flex items-center gap-1.5">
              <span>👑</span>
              <span>Tiết kiệm 83% gói Năm</span>
            </span>
          </h2>

          <p className="mt-2.5 text-xs sm:text-sm text-neutral-400 max-w-xl leading-relaxed">
            20 bài Dễ/Trung bình, chấm Batch 10, streak & heatmap, lưu Neon — chọn
            tháng linh hoạt hoặc năm tiết kiệm 10.000 ₫.
          </p>
        </div>
        <Pricing />

        {/* {error && <p className="mt-6 text-sm text-red-300">{error}</p>} */}
      </div>
    </main>
  );
}
