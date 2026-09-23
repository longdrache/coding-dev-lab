"use client";

import { useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/swr";
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
      <div className="flex h-48 w-8 shrink-0 flex-col justify-between py-0 text-right font-mono text-[12px] tabular-nums text-slate-500">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="border-t border-slate-100" />
            ))}
          </div>
          {hovered && (
            <div
              className="pointer-events-none absolute -top-1 z-10 max-w-[240px] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-slate-50 shadow-[0_8px_32px_rgba(15,23,42,0.1)]"
              style={{ left: `min(max(${(hover! + 0.5) * (100 / daily.length)}%, 70px), calc(100% - 70px))` }}
            >
              <p className="font-medium">{hoverLabel}</p>
              <p className="mt-1 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" /> {hovered.runs} runs
              </p>
              <p className="mt-0.5 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-slate-900 ring-1 ring-white/40" /> {hovered.submits} submits
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
                  className={`flex h-full flex-1 cursor-crosshair items-end justify-center gap-[2px] rounded transition-colors ${hover === idx ? "bg-slate-100" : ""}`}
                  onMouseEnter={() => setHover(idx)}
                >
                  <div className="w-full max-w-3 rounded-t bg-emerald-600" style={{ height: `${hr}%`, minHeight: 2 }} />
                  <div className="w-full max-w-3 rounded-t bg-slate-900" style={{ height: `${hs}%`, minHeight: 2 }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex gap-[3px]">
          {daily.map((d, idx) => {
            const show = idx % 5 === 0 || idx === daily.length - 1;
            return (
              <span key={idx} className="flex-1 truncate text-center text-[12px] text-slate-500">
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
  const { data: stats, error } = useSWR<Stats>("/api/admin/stats", swrFetcher, {
    refreshInterval: 30000, // online counter tự tươi mỗi 30s
  });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-red-600">{error instanceof Error ? error.message : "Failed to load stats"}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Tổng quan hoạt động hệ thống</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-6">
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
    { label: "Đang trực tuyến", value: stats.online ?? "—", sub: "người dùng online" },
    { label: "Bài tập", value: stats.counts.problems, sub: "thử thách xuất bản" },
    { label: "Hỏi đáp", value: stats.counts.qna, sub: "câu hỏi chờ xem" },
    { label: "Lượt nộp", value: stats.counts.submissions, sub: "bài đã nộp" },
    { label: "Lượt chạy", value: runs30d, sub: `+${stats.todayRuns ?? daily[daily.length - 1]?.runs ?? 0} hôm nay` },
  ];

  const topProblems = stats.topProblems ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Tổng quan hoạt động hệ thống</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-slate-200 bg-white">
            <CardContent className="p-6">
              <p className="text-sm text-slate-500">{c.label}</p>
              <p className="mt-2 font-mono text-[32px] font-bold leading-none tabular-nums text-slate-900">{String(c.value)}</p>
              <p className="mt-2 text-xs text-slate-500">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="font-display text-xl font-semibold text-slate-900">Hoạt động 30 ngày</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Lượt chạy code và nộp bài mỗi ngày</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-600" /> Runs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-slate-900" /> Submits
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
        {daily.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Chưa có dữ liệu hoạt động.</p>
        ) : (
          <ChartRunsSubmits daily={daily} maxDaily={maxDaily} />
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-4 text-sm text-slate-500">
          <span>Tổng runs 30 ngày: <span className="font-mono font-bold tabular-nums text-slate-900">{runs30d}</span></span>
          <span>Tổng submits 30 ngày: <span className="font-mono font-bold tabular-nums text-slate-900">{submits30d}</span></span>
        </div>
        </CardContent>
      </Card>

      {topProblems.length > 0 && (
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xl font-semibold text-slate-900">Bài được nộp nhiều nhất</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Xếp theo lượt nộp bài</p>
          </CardHeader>
          <CardContent className="pt-2">
          <ul className="divide-y divide-slate-100">
            {topProblems.map((p, i) => {
              const slug = p.problemSlug;
              const count = p._count?.problemSlug ?? p.count ?? 0;
              return (
                <li key={slug ?? i} className="flex h-12 items-center justify-between px-2 text-sm transition-colors hover:bg-slate-50">
                  <span className="font-mono text-slate-900">{slug}</span>
                  <span className="font-mono tabular-nums text-slate-500">{count} lượt</span>
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
