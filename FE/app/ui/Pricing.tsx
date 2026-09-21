"use client";
import { pricingPlans } from "../data/pricing";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Check,
  Sparkles,
  ShieldCheck,
  Zap,
  Coins,
  ArrowRight,
} from "lucide-react";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export default function PricingCards() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState("");
  const [error, setError] = useState("");
  const dailyPlan = pricingPlans.find((p) => p.id === "daily")!;
  const monthlyPlan = pricingPlans.find((p) => p.id === "monthly")!;
  const yearlyPlan = pricingPlans.find((p) => p.id === "yearly")!;
  const formatPrice = (vnd: number) => {
    return new Intl.NumberFormat("vi-VN").format(vnd) + " ₫";
  };
  async function choosePlan(plan: string) {
    setError("");
    if (!isLoaded || !isSignedIn) {
      router.push("/sign-in?redirect_url=/premium");
      return;
    }

    setLoadingPlan(plan);
    console.log(plan)
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/premium/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan }),
      });
      const result = await response.json();
      console.log(result);
      if (!response.ok || !result.url) {
        throw new Error(result.message ?? "Không thể tạo phiên thanh toán.");
      }
      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Không thể bắt đầu thanh toán.",
      );
      setLoadingPlan("");
    }
  }

  return (
    <section
      id="pricing-cards-container"
      className="mx-auto w-full max-w-[1480px] px-0 py-4"
    >
      {/* 3 Plans Grid - full width */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8 items-stretch w-full">
        {/* ================= GÓI THEO NGÀY (DAILY - 200₫) ================= */}
        <div
          id="daily-plan-card"
          className="relative flex flex-col justify-between rounded-2xl p-6 sm:p-7 transition-all duration-300 cursor-pointer bg-neutral-900/50 border border-emerald-500/20 hover:border-emerald-500/40 opacity-90 hover:opacity-100"
        >
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">{dailyPlan.nameVi}</h3>
                <p className="mt-1 text-xs text-neutral-400">{dailyPlan.descriptionVi}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-300">
                {dailyPlan.badgeVi}
              </span>
            </div>
            <div className="mt-6 border-y border-neutral-800 py-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight text-emerald-400">
                  {formatPrice(dailyPlan.totalBilledVND)}
                </span>
                <span className="text-sm font-medium text-neutral-400">/ ngày</span>
              </div>
              <p className="mt-2 text-xs text-neutral-400">Thanh toán {formatPrice(dailyPlan.totalBilledVND)} cho 24h. Tự hết hạn sau 1 ngày.</p>
            </div>
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Đặc quyền bao gồm:</div>
              <ul className="space-y-3 text-sm text-neutral-300">
                {dailyPlan.features.map((feature) => (
                  <li key={feature.id} className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-emerald-500/20 p-1 text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <span>{feature.textVi}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-neutral-800/80">
            <button
              id="select-daily-plan-btn"
              type="button"
              disabled={!!loadingPlan}
              onClick={() => choosePlan(dailyPlan.id)}
              className="w-full disabled:opacity-50 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 py-3.5 px-4 text-sm font-semibold text-white transition duration-200 flex items-center justify-center gap-2 group"
            >
              {loadingPlan === dailyPlan.id ? <span>Đang tiến hành thanh toán...</span> : <><span>{dailyPlan.ctaVi}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></>}
            </button>
            <p className="mt-2.5 text-center text-[11px] text-neutral-500">Dùng thử siêu rẻ • Không tự gia hạn</p>
          </div>
        </div>

        {/* ================= GÓI HÀNG THÁNG (MONTHLY PLAN) ================= */}
        <div
          id="monthly-plan-card"
          className="relative flex flex-col justify-between rounded-2xl p-6 sm:p-8 transition-all duration-300 cursor-pointer 
    
            bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 opacity-90 hover:opacity-100
          "
        >
          <div>
            {/* Header: Name & Badge */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {monthlyPlan.nameVi}
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  {monthlyPlan.descriptionVi}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-neutral-800 border border-neutral-700 px-3 py-1 text-xs font-semibold text-neutral-300">
                {monthlyPlan.badgeVi}
              </span>
            </div>

            {/* Price section */}
            <div className="mt-6 border-y border-neutral-800 py-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
                  {formatPrice(monthlyPlan.monthlyEquivalentVND)}
                </span>
                <span className="text-sm font-medium text-neutral-400">
                  / tháng
                </span>
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                {`Thanh toán ${formatPrice(monthlyPlan.totalBilledVND)} mỗi tháng. Hủy bất cứ lúc nào.`}
              </p>
            </div>

            {/* Features list */}
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
                Đặc quyền bao gồm:
              </div>
              <ul className="space-y-3.5 text-sm text-neutral-300">
                {monthlyPlan.features.map((feature) => (
                  <li key={feature.id} className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-neutral-800 p-1 text-neutral-300">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <span>{feature.textVi}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Card CTA Footer */}
          <div className="mt-8 pt-6 border-t border-neutral-800/80">
            <button
              id="select-monthly-plan-btn"
              type="button"
              disabled={!!loadingPlan}
              onClick={() => choosePlan(monthlyPlan.id)}
              className="w-full disabled:opacity-50 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 py-3.5 px-4 text-sm font-semibold text-white transition duration-200 flex items-center justify-center gap-2 group"
            >
              {loadingPlan === monthlyPlan.id ? (
                <span>Đang tiến hành thanh toán...</span>
              ) : (
                <>
                  <span>{monthlyPlan.ctaVi}</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </>
              )}
            </button>
            <p className="mt-2.5 text-center text-[11px] text-neutral-500">
              Thanh toán bảo mật qua cổng quốc tế • Không tự động ràng buộc
            </p>
          </div>
        </div>

        {/* ================= GÓI HÀNG NĂM (ANNUAL PLAN - FEATURED) ================= */}
        <div
          id="yearly-plan-card"
          className="relative flex flex-col justify-between rounded-2xl p-6 sm:p-8 transition-all duration-300 cursor-pointer overflow-hidden   
            bg-neutral-900/80 border border-amber-500/40 hover:border-amber-500/70"
        >
          {/* Top highlight banner */}
          <div className="absolute top-0 right-0 left-0 bg-gradient-to-r from-amber-600 via-[#ffa116] to-amber-500 py-1.5 px-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider text-black">
              <Sparkles className="h-3.5 w-3.5 fill-black" />
              <span>{yearlyPlan.badgeVi}</span>
            </div>
          </div>

          <div className="pt-4">
            {/* Header: Name & Savings badge */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                    {yearlyPlan.nameVi}
                    <span className="text-[#ffa116] text-sm">👑</span>
                  </h3>
                </div>
                <p className="mt-1 text-xs text-neutral-300">
                  {yearlyPlan.descriptionVi}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-500/20 border border-amber-500/60 px-3 py-1 text-xs font-black text-amber-300 shadow-sm">
                Khuyên dùng
              </span>
            </div>

            {/* Price section */}
            <div className="mt-6 border-y border-neutral-800 py-6 bg-amber-500/5 -mx-6 sm:-mx-8 px-6 sm:px-8">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black tracking-tight text-[#ffa116]">
                  {formatPrice(yearlyPlan.monthlyEquivalentVND)}
                </span>
                <span className="text-sm font-medium text-neutral-300">
                  / tháng
                </span>
                <span className="text-xs line-through text-neutral-400">
                  {formatPrice(12000)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-neutral-200">
                  {`Thanh toán một lần ${formatPrice(yearlyPlan.totalBilledVND)} / năm.`}
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                  Tiết kiệm 10.000 ₫
                </span>
              </div>
            </div>

            {/* Features list */}
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-3 flex items-center justify-between">
                <span>Đặc quyền vượt trội của gói Năm:</span>
                <span className="flex items-center gap-1 text-[11px] text-amber-300 font-normal">
            
                
                </span>
              </div>
              <ul className="space-y-3.5 text-sm text-neutral-200">
                {yearlyPlan.features.map((feature) => (
                  <li
                    key={feature.id}
                    className={`flex items-start gap-3 ${
                      feature.isHighlight ? "font-medium text-white" : ""
                    }`}
                  >
                    <div
                      className={`mt-0.5 rounded-full p-1 ${
                        feature.isHighlight
                          ? "bg-[#ffa116] text-black shadow-sm"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <span>{feature.textVi}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Card CTA Footer */}
          <div className="mt-8 pt-6 border-t border-neutral-800/80">
            <button
              id="select-yearly-plan-btn"
              type="button"
              disabled={!!loadingPlan}
              onClick={() => choosePlan(yearlyPlan.id)}
              className="w-full disabled:opacity-50 rounded-xl bg-gradient-to-r from-[#ffa116] via-amber-500 to-[#ff8c00] hover:brightness-110 py-3.5 px-4 text-sm font-extrabold text-neutral-950 transition duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 group"
            >
              <Sparkles className="h-4 w-4 fill-black" />
              {loadingPlan === yearlyPlan.id ? (
                <span>Đang tiến hành thanh toán...</span>
              ) : (
                <>
                  <span>{yearlyPlan.ctaVi}</span>

                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </>
              )}
            </button>
            <div className="mt-2.5 flex items-center justify-center gap-4 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Bảo đảm đáng giá 
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Kích hoạt tức thì
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trust banner underneath cards */}
      <div className="mt-10 rounded-xl border border-neutral-700 bg-neutral-900/60 p-4 max-w-6xl mx-auto flex flex-wrap items-center justify-around gap-4 text-xs font-medium text-neutral-300 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Thanh toán bằng Stripe</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#ffa116]" />
          <span>Nâng cấp ngay</span>
        </div>
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          <span>Tùy chọn gói mà bạn thích</span>
        </div>
      </div>
      {error && <p className="mt-6 text-sm text-red-300">{error}</p>}
    </section>
  );
}
