"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import {
  buildWeek,
  calcStreak,
  useActivityMap,
} from "@/app/problem/activity";

function formatShort(key: string): string {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

export default function ActivityChart() {
  const map = useActivityMap();
  const [offset, setOffset] = useState(0);
  const week = buildWeek(map, offset);
  const streak = calcStreak(map);
  const max = Math.max(1, ...week.map((day) => day.count));
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-md shadow-orange-500/25">
            <Flame className="size-5 text-white" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              Chuỗi luyện tập{" "}
              <span className="font-mono tabular-nums text-amber-600">
                {streak} ngày
              </span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {weekTotal} lượt chạy trong tuần này
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((value) => value - 1)}
            title="Tuần trước"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.04] hover:text-zinc-900"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-28 text-center font-mono text-[11px] text-zinc-500">
            {offset === 0
              ? "Tuần này"
              : `${formatShort(week[0].key)} – ${formatShort(week[6].key)}`}
          </span>
          <button
            type="button"
            onClick={() => setOffset((value) => Math.min(0, value + 1))}
            disabled={offset >= 0}
            title="Tuần sau"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-950/[0.04] hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2">
        {week.map((day) => (
          <div key={day.key} className="flex min-w-0 flex-col items-center gap-1.5">
            <div
              className={`flex h-24 w-full items-end justify-center rounded-lg p-1 ${
                day.isToday ? "bg-amber-50 ring-1 ring-amber-200" : "bg-zinc-50"
              } ${day.isFuture ? "opacity-40" : ""}`}
              title={
                day.active && day.count === 0
                  ? `${day.label}: đã đăng nhập`
                  : `${day.label}: ${day.count} lượt chạy`
              }
            >
              {day.count > 0 ? (
                <div
                  className="w-full max-w-7 rounded-md bg-gradient-to-t from-emerald-500 to-emerald-400"
                  style={{ height: `${Math.max(12, Math.round((day.count / max) * 100))}%` }}
                />
              ) : day.active ? (
                <div className="h-4 w-full max-w-7 rounded-md bg-amber-300" />
              ) : (
                <div className="h-1.5 w-full max-w-7 rounded-full bg-zinc-200" />
              )}
            </div>
            <span
              className={`font-mono text-[11px] ${
                day.isToday ? "font-bold text-zinc-900" : "text-zinc-400"
              }`}
            >
              {day.label}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-zinc-400">
              {day.count > 0 ? day.count : day.active ? "•" : "–"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
