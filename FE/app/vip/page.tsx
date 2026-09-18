"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Logo from "@/app/ui/Logo";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function VipPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in?redirect_url=/vip");
      return;
    }

    async function checkVipAccess() {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/vip/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        router.replace("/premium");
        return;
      }
      setAllowed(true);
      setChecking(false);
    }

    checkVipAccess();
  }, [getToken, isLoaded, isSignedIn, router]);

  if (checking || !allowed) {
    return (
      <main className="min-h-screen animate-pulse bg-[#17211b] p-10 text-[#f5f1e8]">
        <div className="h-10 w-64 bg-white/10" />
        <div className="mt-8 h-40 max-w-2xl bg-white/10" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#17211b] px-6 py-12 text-[#f5f1e8] sm:px-10">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-10 flex items-center justify-between border-b border-white/10 pb-5">
          <Logo theme="dark" />
          <div className="flex items-center gap-6 text-sm text-[#f5f1e8]/65">
            <Link href="/problem" className="transition hover:text-[#f5f1e8]">
              Problem Lab
            </Link>
            <Link href="/premium" className="transition hover:text-[#f5f1e8]">
              Premium
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
          VIP workspace
        </p>
        <h1 className="mt-5 font-serif text-6xl sm:text-8xl">
          Welcome inside.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-white/60">
          Your VIP access is active. Keep your sessions focused and your next
          solution closer than the last.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {[
            [
              "01",
              "VIP problems",
              "Curated practice sets for deeper sessions.",
            ],
            ["02", "Private progress", "A calm space to build consistency."],
            [
              "03",
              "Priority practice",
              "Keep your momentum with fewer distractions.",
            ],
          ].map(([number, title, detail]) => (
            <article
              key={number}
              className="border border-white/15 bg-[#202a24] p-6"
            >
              <p className="font-mono text-[#d65a3a]">{number}</p>
              <h2 className="mt-8 font-serif text-2xl">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/55">{detail}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
