"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  online: number | null;
  counts: { problems: number; qna: number; submissions: number };
  activity30d?: Array<{ date: string; count?: number; submissions?: number; value?: number }>;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

  const cards = [
    { label: "Online", value: stats.online ?? "—" },
    { label: "Problems", value: stats.counts.problems },
    { label: "QNA", value: stats.counts.qna },
    { label: "Submissions", value: stats.counts.submissions },
  ];

  const activity = stats.activity30d ?? [];
  const maxActivity = activity.length
    ? Math.max(...activity.map((a) => a.count ?? a.submissions ?? a.value ?? 0), 1)
    : 1;

  const topProblems = stats.topProblems ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-zinc-300 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-zinc-700">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-extrabold tracking-tight text-zinc-950">{String(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-zinc-300 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold tracking-tight text-zinc-950">Activity (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
        {activity.length === 0 ? (
          <p className="text-sm font-medium text-zinc-600">No activity data.</p>
        ) : (
          <div className="flex items-end gap-[3px] h-32 pt-2">
            {activity.map((a, idx) => {
              const v = a.count ?? a.submissions ?? a.value ?? 0;
              const h = Math.max(4, Math.round((v / maxActivity) * 100));
              const dateLabel = a.date ? new Date(a.date).toLocaleDateString("vi-VN", { month: "short", day: "numeric" }) : `#${idx + 1}`;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1" title={`${dateLabel}: ${v}`}>
                  <div className="w-full rounded bg-zinc-950" style={{ height: `${h}%`, minHeight: 4 }} />
                    <span className="hidden xl:block text-[9px] font-medium text-zinc-600 truncate w-full text-center">{dateLabel}</span>
                </div>
              );
            })}
          </div>
        )}
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
