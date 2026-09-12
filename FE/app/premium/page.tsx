"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const plans = [
  { id: "monthly", label: "Monthly", price: "$1", detail: "per month" },
  { id: "yearly", label: "Yearly", price: "$2", detail: "per year" },
] as const;

export default function PremiumPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string>();
  const [error, setError] = useState("");

  async function choosePlan(plan: (typeof plans)[number]["id"]) {
    setError("");
    if (!isLoaded || !isSignedIn) {
      router.push("/sign-in?redirect_url=/premium");
      return;
    }

    setLoadingPlan(plan);
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
      setLoadingPlan(undefined);
    }
  }

  return (
    <main className="min-h-screen bg-[#17211b] px-6 py-12 text-[#f5f1e8] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-10 flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="font-serif text-xl tracking-tight">
            coding<span className="text-[#d65a3a]">.</span>lab
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
        </nav>

        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d65a3a]">
          Coding Dev Lab
        </p>
        <h1 className="mt-5 max-w-2xl font-serif text-5xl leading-tight sm:text-7xl">
          Upgrade your practice.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-white/60">
          Unlock the VIP workspace, advanced practice sessions, and a focused
          place to keep your momentum.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="border border-white/15 bg-[#202a24] p-7 shadow-[8px_8px_0_#d65a3a]"
            >
              <p className="text-sm text-white/50">VIP {plan.label}</p>
              <p className="mt-6 font-serif text-6xl">{plan.price}</p>
              <p className="mt-2 text-sm text-white/50">{plan.detail}</p>
              <button
                type="button"
                onClick={() => choosePlan(plan.id)}
                disabled={loadingPlan !== undefined}
                className="mt-10 w-full bg-[#d65a3a] px-4 py-3 font-bold text-white transition hover:bg-[#ed704e] disabled:opacity-50"
              >
                {loadingPlan === plan.id
                  ? "Opening checkout..."
                  : "Choose plan"}
              </button>
            </article>
          ))}
        </div>
        {error && <p className="mt-6 text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}
