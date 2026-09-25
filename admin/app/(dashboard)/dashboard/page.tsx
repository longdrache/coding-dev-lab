"use client";

import { useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DayStat = { date: string; runs: number; submits: number };

type ViewDay = { date: string; views: number; uniques: number };

// Sparkline mini cho tile số: bars SVG thuần, rẻ paint
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 120;
  const h = 32;
  const bw = w / Math.max(values.length, 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-8 w-full" aria-hidden>
      {values.map((v, i) => {
        const bh = Math.max(2, (v / max) * (h - 2));
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={h - bh}
            width={Math.max(1.5, bw - 2)}
            height={bh}
            rx={1}
            className={color}
          />
        );
      })}
    </svg>
  );
}

function ChartViews({ series }: { series: ViewDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = series.length ? Math.max(...series.flatMap((d) => [d.views, d.uniques]), 1) : 1;
  const ticks = [max, Math.ceil(max / 2), 0];
  const hovered = hover !== null ? series[hover] : null;
  const hoverLabel = hovered?.date
    ? new Date(hovered.date).toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "short" })
    : "";

  return (
    <div className="flex gap-3">
      <div className="flex h-48 w-8 shrink-0 flex-col justify-between py-0 text-right font-mono text-[12px] tabular-nums text-slate-500">
        {ticks.map((t, i) => (
          <span key={`tick-${i}`}>{t}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((t, i) => (
              <div key={`grid-${i}`} className="border-t border-slate-100" />
            ))}
          </div>
          {hovered && (
            <div
              className="pointer-events-none absolute -top-1 z-10 max-w-[240px] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-slate-50 shadow-[0_8px_32px_rgba(15,23,42,0.1)]"
              style={{ left: `min(max(${(hover! + 0.5) * (100 / series.length)}%, 70px), calc(100% - 70px))` }}
            >
              <p className="font-medium">{hoverLabel}</p>
              <p className="mt-1 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" /> {hovered.views} lượt xem
              </p>
              <p className="mt-0.5 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-500" /> {hovered.uniques} người dùng
              </p>
            </div>
          )}
          <div className="relative flex h-48 items-end gap-[3px] pt-6">
            {series.map((d, idx) => {
              const hv = Math.max(2, Math.round((d.views / max) * 100));
              const hu = Math.max(2, Math.round((d.uniques / max) * 100));
              return (
                <div
                  key={idx}
                  className={`flex h-full flex-1 cursor-crosshair items-end justify-center gap-[2px] rounded transition-colors ${hover === idx ? "bg-slate-100" : ""}`}
                  onMouseEnter={() => setHover(idx)}
                >
                  <div className="w-full max-w-3 rounded-t bg-emerald-600" style={{ height: `${hv}%`, minHeight: 2 }} />
                  <div className="w-full max-w-3 rounded-t bg-sky-500" style={{ height: `${hu}%`, minHeight: 2 }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex gap-[3px]">
          {series.map((d, idx) => {
            const show = idx % 5 === 0 || idx === series.length - 1;
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
        {ticks.map((t, i) => (
          <span key={`tick-${i}`}>{t}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((t, i) => (
              <div key={`grid-${i}`} className="border-t border-slate-100" />
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
  monthRuns?: number;
  monthSubmits?: number;
  topProblems?: Array<{ problemSlug: string; _count?: { problemSlug: number }; count?: number }>;
};

type ViewsAnalytics = {
  today: { views: number; uniques: number };
  month: { views: number; uniques: number };
  year: { views: number; uniques: number };
  series30d: ViewDay[];
  byCountry: Array<{ country: string; count: number }>;
};

type LoginsAnalytics = {
  recent: Array<{ key: string; name: string; avatar: string | null; country: string; at: string }>;
  byCountry: Array<{ country: string; count: number }>;
};

type RecentView = { kind: string; path: string; country: string; at: string };

export default function DashboardPage() {
  const { data: stats, error } = useSWR<Stats>("/api/admin/stats", swrFetcher, {
    refreshInterval: 30000, // online counter tự tươi mỗi 30s
  });
  const { data: views } = useSWR<ViewsAnalytics>("/api/admin/analytics/views", swrFetcher, {
    refreshInterval: 60000,
  });
  const { data: logins } = useSWR<LoginsAnalytics>("/api/admin/analytics/logins", swrFetcher, {
    refreshInterval: 60000,
  });
  const { data: recentViews } = useSWR<RecentView[]>("/api/admin/analytics/views/recent", swrFetcher, {
    refreshInterval: 30000,
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

  const cards: Array<{ label: string; value: string | number; sub: string; series?: number[]; color?: string }> = [
    { label: "Đang trực tuyến", value: stats.online ?? "—", sub: "người dùng online" },
    { label: "Bài tập", value: stats.counts.problems, sub: "thử thách xuất bản" },
    { label: "Hỏi đáp", value: stats.counts.qna, sub: "câu hỏi chờ xem" },
    { label: "Lượt nộp", value: stats.counts.submissions, sub: "bài đã nộp", series: daily.map((d) => d.submits), color: "fill-slate-900" },
    { label: "Lượt chạy", value: runs30d, sub: `+${stats.todayRuns ?? daily[daily.length - 1]?.runs ?? 0} hôm nay`, series: daily.map((d) => d.runs), color: "fill-emerald-500" },
  ];

  const topProblems = stats.topProblems ?? [];

  // Lấp đủ 30 ngày cho chart visits (ngày không data = 0)
  const viewsSeries: ViewDay[] = (() => {
    const map = new Map((views?.series30d ?? []).map((d) => [d.date, d]));
    const out: ViewDay[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push(map.get(key) ?? { date: key, views: 0, uniques: 0 });
    }
    return out;
  })();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Tổng quan hoạt động hệ thống</p>
      </div>

      {/* Bento: chart visits lớn + 3 ô ngày/tháng/năm */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-slate-200 bg-white md:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="font-display text-xl font-semibold text-slate-900">Lượt truy cập 30 ngày</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Pageview theo user (khách dùng hash IP, không lưu IP thô)</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <span className="size-2 rounded-full bg-emerald-600" /> Views
                <span className="size-2 rounded-full bg-sky-500" /> người dùng
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ChartViews series={viewsSeries} />
            {(views?.byCountry?.length ?? 0) > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {(() => {
                  const max = Math.max(...views!.byCountry.map((c) => c.count), 1);
                  return views!.byCountry.map((c) => (
                    <div key={c.country} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 font-mono text-xs font-bold text-slate-700">
                        {c.country === "XX" ? "—" : c.country}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                          style={{ width: `${Math.max(3, Math.round((c.count / max) * 100))}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-slate-500">{c.count}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="grid grid-cols-3 gap-4 md:grid-cols-1">
          {[
            { label: "Hôm nay", data: views?.today },
            { label: "Tháng này", data: views?.month },
            { label: "Năm nay", data: views?.year },
          ].map((t) => (
            <Card key={t.label} className="border-slate-200 bg-slate-900 text-white">
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{t.label}</p>
                <p className="mt-1 font-mono text-[28px] font-bold leading-none tabular-nums">{String(t.data?.views ?? "—")}</p>
                <p className="mt-1.5 font-mono text-xs tabular-nums text-slate-400">{String(t.data?.uniques ?? "—")} người dùng</p>
                <Sparkline values={viewsSeries.map((d) => d.views)} color="fill-emerald-500" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

     
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-slate-200 bg-white">
            <CardContent className="p-6">
              <p className="text-sm text-slate-500">{c.label}</p>
              <p className="mt-2 font-mono text-[32px] font-bold leading-none tabular-nums text-slate-900">{String(c.value)}</p>
              <p className="mt-2 text-xs text-slate-500">{c.sub}</p>
              {c.series && <Sparkline values={c.series} color={c.color ?? "fill-emerald-500"} />}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="border-slate-200 bg-white md:col-span-2">
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

      <Card className="border-slate-200 bg-white md:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-xl font-semibold text-slate-900">Đăng nhập gần đây</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Ai vừa vào, từ quốc gia nào</p>
        </CardHeader>
        <CardContent className="pt-2">
          {(logins?.byCountry?.length ?? 0) > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {logins!.byCountry.map((c) => (
                <span key={c.country} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                  {c.country === "XX" ? "—" : c.country}
                  <span className="font-normal text-slate-500">{c.count}</span>
                </span>
              ))}
            </div>
          )}
          {(logins?.recent?.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Chưa có lượt đăng nhập nào.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {logins!.recent.map((r) => (
                <li key={r.key} className="flex h-12 items-center justify-between gap-3 px-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {r.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar} alt="" className="size-7 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[11px] font-bold text-slate-500">
                        {r.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate font-medium text-slate-900">{r.name}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                      {r.country === "XX" ? "—" : r.country}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {new Date(r.at).toLocaleString("vi-VN", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white md:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-xl font-semibold text-slate-900">Truy cập gần đây</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Cả user lẫn khách vãng lai</p>
        </CardHeader>
        <CardContent className="pt-2">
          {(recentViews?.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Chưa có lượt truy cập nào.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentViews!.map((r, i) => (
                <li key={`${r.path}-${i}`} className="flex h-11 items-center justify-between gap-3 px-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${r.kind === "user" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {r.kind === "user" ? "USER" : "KHÁCH"}
                    </span>
                    <span className="truncate font-mono text-slate-900">{r.path}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                      {r.country === "XX" ? "—" : r.country}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {new Date(r.at).toLocaleString("vi-VN", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
