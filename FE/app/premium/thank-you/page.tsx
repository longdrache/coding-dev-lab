import Link from "next/link";
import Logo from "@/app/ui/Logo";
import Breadcrumbs from "@/app/ui/Breadcrumbs";
import { CheckCircle2, Sparkles, ArrowRight, Trophy, Code2, Flame } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cảm ơn — GoCode Premium",
  description: "Cảm ơn bạn đã đăng ký GoCode Premium",
};

const planLabels: Record<string, { name: string; desc: string }> = {
  daily: { name: "Gói Theo Ngày", desc: "200 ₫ / 24h" },
  monthly: { name: "Gói Hàng Tháng", desc: "1.000 ₫ / tháng" },
  yearly: { name: "Gói Hàng Năm", desc: "2.000 ₫ / năm" },
};

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const planParam = typeof params.plan === "string" ? params.plan : Array.isArray(params.plan) ? params.plan[0] : undefined;
  const payment = typeof params.payment === "string" ? params.payment : undefined;
  const plan = planParam && planLabels[planParam] ? planParam : undefined;
  const planInfo = plan ? planLabels[plan] : null;
  const isSuccess = payment === "success" || !!plan;

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-[#f5f1e8] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#1a1a1a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo theme="dark" />
          <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 transition">
            Trang chủ
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="w-full max-w-2xl">
          <Breadcrumbs
            tone="dark"
            className="mb-6"
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Premium", href: "/premium" },
              { label: "Cảm ơn" },
            ]}
          />
          <div className="relative overflow-hidden rounded-[2rem] border border-amber-500/20 bg-gradient-to-b from-neutral-900 to-neutral-900/50 p-8 sm:p-10 shadow-[0_20px_80px_-20px_rgba(245,158,11,0.3)]">
            {/* glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[120%] -translate-x-1/2 bg-gradient-to-b from-amber-500/10 via-[#ffa116]/5 to-transparent blur-2xl" />
            
            <div className="relative flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-500/20 ring-1 ring-white/20">
                {isSuccess ? <CheckCircle2 className="size-8 text-white" /> : <Sparkles className="size-7 text-white" />}
              </div>

              <h1 className="mt-6 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                {isSuccess ? "Cảm ơn bạn đã đăng ký Premium! 🎉" : "Chào mừng đến Premium"}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-neutral-400 leading-relaxed max-w-lg">
                {planInfo ? (
                  <>Bạn đã kích hoạt <span className="font-semibold text-amber-400">{planInfo.name}</span> ({planInfo.desc}). Tài khoản của bạn đã được nâng lên <span className="font-semibold text-white">VIP</span> — mở khóa toàn bộ 20 bài, chấm Batch 10 và streak không giới hạn.</>
                ) : (
                  <>Tài khoản của bạn đã được nâng lên VIP. Cảm ơn bạn đã đồng hành cùng GoCode — chúc bạn luyện tập hiệu quả!</>
                )}
              </p>

              {planInfo && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="size-3.5" />
                  Đã kích hoạt {planInfo.name} — có hiệu lực ngay
                </div>
              )}

              <div className="mt-8 grid grid-cols-3 gap-3 w-full">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col items-center gap-2">
                  <Code2 className="size-5 text-emerald-400" />
                  <span className="text-xs font-medium text-neutral-300">20 bài Premium</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col items-center gap-2">
                  <Trophy className="size-5 text-amber-400" />
                  <span className="text-xs font-medium text-neutral-300">Huy hiệu VIP</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col items-center gap-2">
                  <Flame className="size-5 text-orange-400" />
                  <span className="text-xs font-medium text-neutral-300">Streak 35 ngày</span>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full">
                <Link href="/problem" className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ffa116] via-amber-500 to-[#ff8c00] px-6 py-3.5 text-sm font-bold text-neutral-950 shadow-lg shadow-amber-500/20 hover:brightness-110 transition">
                  Bắt đầu luyện tập
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/" className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition">
                  Quay về trang chủ
                </Link>
              </div>

              <p className="mt-6 text-xs text-neutral-500">
                Tự động hạ VIP khi hết hạn • Hóa đơn Stripe gửi qua email • Hỗ trợ <Link href="/qna" className="underline hover:text-neutral-300">Hỏi đáp</Link>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-neutral-500">
            Không nhận được quyền VIP? Thử làm mới hoặc liên hệ hỗ trợ.
          </p>
        </div>
      </div>
    </main>
  );
}
