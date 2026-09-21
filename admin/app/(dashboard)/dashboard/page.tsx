"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DayStat = { date: string; runs: number; submits: number };

function ChartRunsSubmits({ daily, maxDaily }: { daily: DayStat[]; maxDaily: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const ticks = [maxDaily, Math.ceil(maxDaily / 2), 0];
  const hovered = hover !== null ? daily[hover] : null;
  const hoverLabel = hovered?.date
    ? new Date(hovered.date).toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "short" })
    : "";

  return (
    <div className="flex gap-3">
      {/* trục Y */}
      <div className="flex h-48 w-8 shrink-0 flex-col justify-between py-0 text-right text-[10px] font-medium tabular-nums text-zinc-500">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" onMouseLeave={() => setHover(null)}>
          {/* lưới ngang */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="border-t border-zinc-100" />
            ))}
          </div>
          {/* tooltip */}
          {hovered && (
            <div
              className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-lg border border-zinc-200 bg-zinc-950 px-3 py-2 text-xs text-white shadow-lg"
              style={{ left: `min(max(${(hover! + 0.5) * (100 / daily.length)}%, 64px), calc(100% - 64px))` }}
            >
              <p className="font-bold">{hoverLabel}</p>
              <p className="mt-1 flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-emerald-400" /> {hovered.runs} runs
              </p>
              <p className="mt-0.5 flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-violet-400" /> {hovered.submits} submits
              </p>
            </div>
          )}
          <div className="relative flex h-48 items-end gap-[3px] pt-6">
            {daily.map((d, idx) => {
              const hr = Math.max(2, Math.round((d.runs / maxDaily) * 100));
              const hs = Math.max(2, Math.round((d.submits / maxDaily) * 100));
              return (
                <div
                  key={idx}
                  className={`flex h-full flex-1 cursor-crosshair items-end justify-center gap-[2px] rounded-sm transition-colors ${hover === idx ? "bg-zinc-100" : ""}`}
                  onMouseEnter={() => setHover(idx)}
                >
                  <div className={`w-full max-w-3 rounded-t ${hover === idx ? "bg-emerald-600" : "bg-emerald-500"}`} style={{ height: `${hr}%`, minHeight: 2 }} />
                  <div className={`w-full max-w-3 rounded-t ${hover === idx ? "bg-violet-600" : "bg-violet-500"}`} style={{ height: `${hs}%`, minHeight: 2 }} />
                </div>
              );
            })}
          </div>
        </div>
        {/* trục X — hiện cách 5 ngày */}
        <div className="mt-1 flex gap-[3px]">
          {daily.map((d, idx) => {
            const show = idx % 5 === 0 || idx === daily.length - 1;
            return (
              <span key={idx} className="flex-1 truncate text-center text-[9px] font-medium text-zinc-500">
                {show && d.date
                  ? new Date(d.date).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" })
                  : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Stats = {
  online: number | null;
  counts: { problems: number; qna: number; submissions: number };
  activity30d?: Array<{ date: string; count?: number; submissions?: number; value?: number }>;
  daily?: Array<{ date: string; runs: number; submits: number }>;
  runs30d?: number;
  submits30d?: number;
  todayRuns?: number;
  todaySubmits?: number;
  topProblems?: Array<{ problemSlug: string; _count?: { problemSlug: number }; count?: number }>;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch("/api/admin/stats")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message || `Failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load stats");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-zinc-300">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-3 h-7 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const daily = stats.daily ?? [];
  const maxDaily = daily.length
    ? Math.max(...daily.flatMap((d) => [d.runs, d.submits]), 1)
    : 1;
  const runs30d = stats.runs30d ?? daily.reduce((s, d) => s + d.runs, 0);
  const submits30d = stats.submits30d ?? daily.reduce((s, d) => s + d.submits, 0);

  const cards = [
    { label: "Online", value: stats.online ?? "—", sub: "đang truy cập" },
    { label: "Problems", value: stats.counts.problems, sub: "bài tập" },
    { label: "QNA", value: stats.counts.qna, sub: "câu hỏi" },
    { label: "Submissions", value: stats.counts.submissions, sub: "lượt nộp" },
    { label: "Runs", value: runs30d, sub: `+${stats.todayRuns ?? daily[daily.length - 1]?.runs ?? 0} hôm nay` },
  ];

  const topProblems = stats.topProblems ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-zinc-300 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-700">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-extrabold tracking-tight text-zinc-950 tabular-nums">{String(c.value)}</p>
              <p className="mt-1 text-xs font-medium text-zinc-500">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-zinc-300 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-bold tracking-tight text-zinc-950">Lượt chạy code vs Nộp bài (30 ngày)</CardTitle>
            <div className="flex items-center gap-3 text-xs font-medium text-zinc-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-emerald-500" /> Runs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-violet-500" /> Submits
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
        {daily.length === 0 ? (
          <p className="text-sm font-medium text-zinc-600">No activity data.</p>
        ) : (
          <ChartRunsSubmits daily={daily} maxDaily={maxDaily} />
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 text-xs font-medium text-zinc-600">
          <span>Tổng runs 30 ngày: <span className="font-bold text-zinc-900">{runs30d}</span></span>
          <span>Tổng submits 30 ngày: <span className="font-bold text-zinc-900">{submits30d}</span></span>
        </div>
        </CardContent>
      </Card>

      {topProblems.length > 0 && (
        <Card className="border-zinc-300 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold tracking-tight text-zinc-950">Top Problems</CardTitle>
          </CardHeader>
          <CardContent>
          <ul className="space-y-2">
            {topProblems.map((p, i) => {
              const slug = p.problemSlug;
              const count = p._count?.problemSlug ?? p.count ?? 0;
              return (
                <li key={slug ?? i} className="flex items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <span className="font-mono font-medium text-zinc-900">{slug}</span>
                  <span className="font-medium text-zinc-700">{count} submissions</span>
                </li>
              );
            })}
          </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
