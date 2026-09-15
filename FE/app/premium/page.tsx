import Link from "next/link";
import Pricing from "@/app/ui/Pricing";
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
    <main className="min-h-screen  bg-[#1a1a1a] px-6 py-12 text-[#f5f1e8] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-10 flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="font-serif text-xl tracking-tight">
            coding<span className="">.</span>lab
          </Link>
          <div className="flex items-center gap-6 text-sm text-[#f5f1e8]/65">
            <Link href="/problem" className="transition hover:text-[#f5f1e8]">
              Problem Lab
            </Link>
            <Link
              href="/"
              className="border border-[#f5f1e8]/30 px-3 py-1.5 text-xs font-semibold text-[#f5f1e8] transition hover:border-[#f5f1e8]"
            >
              ← Trang chủ
            </Link>
          </div>
          {/* <div className="fixed top-6 right-6 z-50 grid w-full max-w-sm items-start gap-3">
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Payment successful</AlertTitle>
              <AlertDescription>
                Your payment of $29.99 has been processed. A receipt has been
                sent to your email address.
              </AlertDescription>
            </Alert>
          </div> */}
        </nav>

        <div
          id="plans-section"
          className="mt-10 mb-10 flex flex-col items-center text-center"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-3.5 rounded-full bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 mb-3 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-[#ffa116]"></span>
            <span>2 lựa chọn gói thành viên tối ưu</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center justify-center gap-2.5 flex-wrap">
            <span className="text-neutral-200 flex items-center gap-1.5">
              <span>⏱️</span>
              <span>Linh hoạt thời gian</span>
            </span>
            <span className="text-neutral-500 font-normal">&bull;</span>
            <span className="text-[#ffa116] flex items-center gap-1.5">
              <span>👑</span>
              <span>Gói Năm tiết kiệm 83.3%</span>
            </span>
          </h2>

          <p className="mt-2.5 text-xs sm:text-sm text-neutral-400 max-w-xl leading-relaxed">
            Tùy chọn thanh toán từng tháng để ôn luyện cấp tốc, hoặc đăng ký
            trọn năm để tiết kiệm đến 83.3% chi phí kèm 35 LeetCoins mỗi tuần.
          </p>
        </div>
        <Pricing />

        {/* {error && <p className="mt-6 text-sm text-red-300">{error}</p>} */}
      </div>
    </main>
  );
}
