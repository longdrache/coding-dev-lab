"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Trophy, Users } from "lucide-react";
import {
  getNextContestDate,
  pastContests,
  upcomingContest,
} from "@/app/data/contests";
import Logo from "@/app/ui/Logo";

function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function Countdown() {
  const now = useNow();
  if (now === null) {
    return (
      <div className="flex items-center justify-center gap-2 sm:justify-start">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-16 animate-pulse rounded-xl bg-white/10 py-3 text-center"
          >
            <span className="font-mono text-2xl font-bold text-transparent">
              00
            </span>
          </div>
        ))}
      </div>
    );
  }
  const target = getNextContestDate(new Date(now)).getTime();
  const diff = Math.max(0, target - now);
  const units = [
    { value: Math.floor(diff / 86_400_000), label: "Ngày" },
    { value: Math.floor(diff / 3_600_000) % 24, label: "Giờ" },
    { value: Math.floor(diff / 60_000) % 60, label: "Phút" },
    { value: Math.floor(diff / 1000) % 60, label: "Giây" },
  ];
  return (
    <div className="flex items-center justify-center gap-2 sm:justify-start">
      {units.map((unit) => (
        <div key={unit.label} className="w-16 rounded-xl bg-white/10 py-2.5 text-center">
          <p className="font-mono text-2xl font-bold tabular-nums text-white">
            {String(unit.value).padStart(2, "0")}
          </p>
          <p className="mt-0.5 text-[11px] text-white/50">{unit.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function ContestPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <Logo />
        </div>
        <header className="mb-8">
          <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-600">
            Contest
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
            Cuộc thi luyện tập
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Cọ xát định kỳ cùng cộng đồng GoCode: giới hạn giờ, bảng điểm
            thời gian thực và đề thi bám sát phỏng vấn.
          </p>
        </header>

        <section className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-10 sm:px-10">
          <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 size-72 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-300">
                <Trophy className="size-3.5" />
                {upcomingContest.title} • {upcomingContest.edition}
              </p>
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Kỳ thi tiếp theo bắt đầu sau
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" />
                  {upcomingContest.scheduleLabel}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-4" />
                  {upcomingContest.durationLabel}
                </span>
              </p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
                {upcomingContest.description}
              </p>
              <Link
                href="/problem"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
              >
                Luyện bài thi thử
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <Countdown />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight text-zinc-950">
            Các kỳ đã diễn ra
          </h2>
          <div className="mt-5 space-y-4">
            {pastContests.map((contest) => (
              <article
                key={contest.slug}
                className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:border-zinc-300"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-zinc-900">
                    {contest.title}
                  </h3>
                  <span className="rounded-full bg-zinc-950/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                    {contest.scheduleLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {contest.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    {contest.participants} thí sinh
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {contest.durationLabel}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
