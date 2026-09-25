"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Logo from "@/app/ui/Logo";
import Breadcrumbs from "@/app/ui/Breadcrumbs";
import { useDashboard } from "@/app/hooks/useDashboard";
import { useProblems } from "@/app/hooks/useProblems";
import { topics } from "@/app/data/topics";

export default function Page() {
  const { data, loading } = useDashboard();
  const { problems: dbProblems } = useProblems();
  const problems = dbProblems ?? [];
  // Gate theo mounted để lần render đầu khớp hệt server (tránh hydration
  // mismatch do SWR cache persist có data mà server không có).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard, cố ý 1 lần
    setMounted(true);
  }, []);

  const solvedSlugs = new Set(data?.solved?.slugs ?? []);
  const counts: Record<string, number> = {};
  for (const slug of solvedSlugs) {
    const prob = problems.find((p) => p.slug === slug);
    if (prob) counts[prob.topic] = (counts[prob.topic] ?? 0) + 1;
  }
  const topicProgress = topics.map((t) => {
    const total = problems.filter((p) => p.topic === t.slug).length;
    const done = counts[t.slug] ?? 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { ...t, total, done, pct };
  });
  const totalDone = topicProgress.reduce((s, t) => s + t.done, 0);
  const totalAll = topicProgress.reduce((s, t) => s + t.total, 0);
  const overall = totalAll ? Math.round((totalDone / totalAll) * 100) : 0;

  return (
    <main className="min-h-screen bg-wash px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-zinc-800 transition"
          >
            <ArrowLeft className="size-4" />
            Trang chủ
          </Link>
        </div>
        <Breadcrumbs
          className="mt-6"
          items={[{ label: "Trang chủ", href: "/" }, { label: "Tiến độ" }]}
        />


        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-zinc-950">
          Tiến độ theo chủ đề
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
          Hoàn thành từng chủ đề để lấp đầy thanh tiến độ — bấm vào thẻ để luyện tiếp.
        </p>

        {!mounted || (loading && !data) ? (
          <>
            <div className="mt-8 rounded-2xl border p-8 animate-pulse border-zinc-100 shadow-sm">
            </div>
            <div className="mt-8 grid animate-pulse gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-zinc-100" />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-bold text-zinc-900">
                  Tổng: {totalDone} / {totalAll} bài
                </p>
                <p className="font-mono text-sm font-bold text-violet-600">{overall}%</p>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-zinc-100">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all"
                  style={{ width: `${overall}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {topicProgress.map((t) => (
                <Link
                  key={t.slug}
                  href={`/problem?topic=${t.slug}`}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-violet-200 hover:shadow-md"
                >
                  <p className="text-sm font-bold text-zinc-900">{t.title}</p>
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    {t.done} / {t.total} bài • {t.pct}%
                  </p>
                  <div className="mt-3 h-1.5 rounded-full bg-zinc-100">
                    <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${t.pct}%` }} />
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/problem"
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Vào sân luyện ngay
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
