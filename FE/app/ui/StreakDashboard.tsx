"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Flame,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useDashboard } from "@/app/hooks/useDashboard";
import { useProblems } from "@/app/hooks/useProblems";
import { topics } from "@/app/data/topics";

export default function StreakDashboard() {
  const { data, loading } = useDashboard();
  const { problems: dbProblems } = useProblems();
  const problems = dbProblems ?? [];
  const streak = data?.streak ?? 0;
  const solved = data?.solved;
  const heatmap = data?.heatmap ?? [];
  const badges = data?.badges;

  // weekly T2-CN derived from heatmap last 7 or from activityMap
  const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
  // Build current week active map for streak card (reuse first 7 of heatmap tail? Instead use activityMap week)
  // For simplicity, show last 7 days from heatmap tail as T2-CN aligned? We'll compute T2-CN week of current date.
  // Use dashboard activityMap to build week T2-CN quickly
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekActive: boolean[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const key = `${day}-${month}-${year}`;
    return Boolean(data?.activityMap?.[key] !== undefined);
  });


  if (loading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 rounded-2xl bg-zinc-100" />
        <div className="h-48 rounded-2xl bg-zinc-100" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-48 rounded-2xl bg-zinc-100" />
          <div className="h-48 rounded-2xl bg-zinc-100" />
          <div className="h-48 rounded-2xl bg-zinc-100" />
        </div>
      </div>
    );
  }

  const totalProblems = problems.length;
  const totalEasy = problems.filter((p) => p.difficulty === "Dễ").length;
  const totalMedium = problems.filter((p) => p.difficulty === "Trung bình").length;
  const totalHard = problems.filter((p) => p.difficulty === "Khó").length;
  const totalSolved = solved?.total ?? 0;
  const easy = solved?.byDifficulty?.["Dễ"] ?? 0;
  const medium = solved?.byDifficulty?.["Trung bình"] ?? 0;
  const hard = solved?.byDifficulty?.["Khó"] ?? 0;
  const easyPct = totalEasy ? Math.round((easy / totalEasy) * 100) : 0;
  const mediumPct = totalMedium ? Math.round((medium / totalMedium) * 100) : 0;
  const hardPct = totalHard ? Math.round((hard / totalHard) * 100) : 0;

  // 35 ngày chăm chỉ
  const activeDays = heatmap.filter((h) => h.active).length;
  const diligence = heatmap.length ? Math.round((activeDays / heatmap.length) * 100) : 0;

  const badgesUnlocked = badges?.unlocked ?? 0;
  const badgesTotal = badges?.total ?? 12;
  const badgeList = badges?.list ?? [];

  const MILESTONES = [
    { days: 3, label: "3 ngày", badge: "Khởi động" },
    { days: 7, label: "7 ngày", badge: "Streak 7" },
    { days: 14, label: "14 ngày", badge: "Kỷ luật" },
    { days: 30, label: "30 ngày", badge: "Bền bỉ" },
  ] as const;
  const nextMilestone = MILESTONES.find((m) => m.days > streak);

  // đề xuất & tiến độ theo chủ đề
  const solvedSlugs = new Set(solved?.slugs ?? []);
  const suggestions = problems.filter((p) => !solvedSlugs.has(p.slug)).slice(0, 3);
  const topicProgress = (() => {
    const counts: Record<string, number> = {};
    for (const slug of solvedSlugs) {
      const prob = problems.find((p) => p.slug === slug);
      if (prob) counts[prob.topic] = (counts[prob.topic] ?? 0) + 1;
    }
    return topics.slice(0, 4).map((t) => {
      const total = problems.filter((p) => p.topic === t.slug).length;
      const done = counts[t.slug] ?? 0;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { ...t, total, done, pct };
    });
  })();

  return (
    <div className="space-y-6">

      {/* Streak large card - tự động điểm danh khi đăng nhập */}
      <div className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50/60 via-white to-amber-50/40 p-6 shadow-sm md:p-7">
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-black tracking-tight text-zinc-900">{streak}</span>
              <Flame className="size-9 fill-orange-500 text-orange-500" />
              <span className="text-xl font-bold tracking-tight text-zinc-700">ngày liên tiếp</span>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-600">
              {streak > 0
                ? `Xuất sắc! Chuỗi ${streak} ngày liên tiếp — hôm nay đã điểm danh, phong độ đang vững vàng.`
                : `Chuỗi hiện tại đã đứt. Đăng nhập hôm nay để bắt đầu lại từ 1 ngày.`}
            </p>

            <p className="mt-6 font-mono text-xs uppercase tracking-widest text-zinc-400">
              Lịch tuần này (Thứ Hai – Chủ Nhật)
            </p>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {weekDays.map((label, i) => {
                const active = weekActive[i];
                const isToday = i === ((new Date().getDay() + 6) % 7);
                return (
                  <div
                    key={label}
                    className={`flex h-14 flex-col items-center justify-center rounded-xl border text-xs font-semibold ${
                      active
                        ? "border-orange-500 bg-orange-500 text-white shadow"
                        : "border-zinc-200 bg-white text-zinc-400"
                    } ${isToday ? "ring-2 ring-amber-200" : ""}`}
                  >
                    <span className="font-mono text-[11px] opacity-80">{label}</span>
                    {active ? <Check className="mt-1 size-4" /> : <Flame className="mt-1 size-3.5 opacity-60" />}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
              {nextMilestone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="size-4 text-amber-500" /> Mốc tiếp theo:{" "}
                  <b className="text-zinc-900">{nextMilestone.label}</b> (+Huy hiệu {nextMilestone.badge})
                  <span className="text-zinc-400">— còn {nextMilestone.days - streak} ngày</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-emerald-600">
                  <Trophy className="size-4" /> Đã đạt tất cả mốc — Xuất sắc!
                </span>
              )}
            </div>
      </div>

      {/* 3 cards second row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tổng bài đã giải */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Tổng bài đã giải
            </p>
            <span className="flex size-6 items-center justify-center rounded-full border border-emerald-200 text-emerald-600">◎</span>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-zinc-900">
            {totalSolved} <span className="text-base font-normal text-zinc-400">/ {totalProblems} bài tập</span>
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-emerald-600">Dễ: {easy} bài</span>
                <span className="text-emerald-600">{easyPct}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-zinc-100">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, easyPct)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-amber-600">Trung bình: {medium} bài</span>
                <span className="text-amber-600">{mediumPct}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-zinc-100">
                <div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.min(100, mediumPct)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-rose-600">Khó: {hard} bài</span>
                <span className="text-rose-600">{hardPct}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-zinc-100">
                <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.min(100, hardPct)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Nhật ký hoạt động */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Nhật ký hoạt động
            </p>
            <span className="flex size-6 items-center justify-center rounded-full border border-orange-200 text-orange-500">▣</span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-zinc-900">
            {heatmap.length} <span className="text-lg font-semibold">ngày qua</span>{" "}
            <span className="text-sm font-semibold text-emerald-600">{diligence}% chăm chỉ</span>
          </p>

          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {heatmap.map((cell) => {
              const intensity = cell.count === 0 ? (cell.active ? 1 : 0) : Math.min(4, Math.ceil((cell.count / 3) * 4));
              const bg =
                intensity === 0
                  ? "bg-zinc-100"
                  : intensity === 1
                    ? "bg-emerald-100"
                    : intensity === 2
                      ? "bg-emerald-300"
                      : intensity === 3
                        ? "bg-emerald-400"
                        : "bg-emerald-600";
              return (
                <div
                  key={cell.date}
                  title={`${cell.date}: ${cell.count} bài`}
                  className={`aspect-square rounded-md ${bg} border border-zinc-100`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-zinc-400">
            <span>Ít hoạt động</span>
            <span className="flex gap-1">
              <span className="size-3 rounded-sm bg-zinc-100 border" />
              <span className="size-3 rounded-sm bg-emerald-100" />
              <span className="size-3 rounded-sm bg-emerald-300" />
              <span className="size-3 rounded-sm bg-emerald-600" />
            </span>
            <span>Nhiều bài giải</span>
          </div>
        </div>

        {/* Huy hiệu */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Huy hiệu thành tích
            </p>
            <span className="flex size-6 items-center justify-center rounded-full border border-amber-200 text-amber-500">♛</span>
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-zinc-900">
            {badgesUnlocked} <span className="text-2xl">/</span> {badgesTotal}{" "}
            <span className="text-sm font-normal text-zinc-400">đã mở khóa</span>
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {badgeList.slice(0, 6).map((b) => (
              <div
                key={b.id}
                className={`rounded-xl border p-3 text-center ${
                  b.unlocked ? "bg-orange-50 border-orange-200" : "bg-zinc-50 border-zinc-200 opacity-60"
                }`}
              >
                <div className="flex justify-center">
                  {b.icon === "streak" && <Flame className={`size-5 ${b.unlocked ? "text-orange-500" : "text-zinc-300"}`} />}
                  {b.icon === "zap" && <span className={b.unlocked ? "text-teal-600" : "text-zinc-300"}>⚡</span>}
                  {b.icon === "star" && <span className={b.unlocked ? "text-amber-500" : "text-zinc-300"}>★</span>}
                  {b.icon === "trophy" && <Trophy className={`size-5 ${b.unlocked ? "text-amber-500" : "text-zinc-300"}`} />}
                  {b.icon === "target" && <span className={b.unlocked ? "text-sky-600" : "text-zinc-300"}>◎</span>}
                  {b.icon === "shield" && <ShieldCheck className={`size-5 ${b.unlocked ? "text-emerald-600" : "text-zinc-300"}`} />}
                </div>
                <p className="mt-1.5 font-mono text-xs font-bold leading-tight text-zinc-900">{b.name}</p>
                <p className="font-mono text-[11px] text-zinc-500">{b.desc}</p>
              </div>
            ))}
          </div>
          {badgeList.length > 6 && (
            <p className="mt-3 text-center font-mono text-xs text-zinc-400">
              +{badgeList.length - 6} huy hiệu khác
            </p>
          )}
        </div>
      </div>

      {/* Bài tập đề xuất */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-100 pt-6">
        <h3 className="inline-flex items-center gap-2 text-base font-bold text-zinc-900">
          <span className="text-emerald-500">{"</>"}</span> Bài tập đề xuất cho bạn hôm nay
        </h3>
        <Link href="/problem" className="font-mono text-sm font-semibold text-emerald-600 hover:text-emerald-700">
          Xem tất cả &gt;
        </Link>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {suggestions.map((p) => (
          <Link
            key={p.slug}
            href={`/problem/${p.slug}`}
            className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
          >
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">{p.topic}</p>
            <h4 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-zinc-900 group-hover:text-emerald-700">
              {p.title}
            </h4>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500">{p.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-600">
              Giải ngay <ArrowRight className="size-3.5" />
            </span>
          </Link>
        ))}
      </div>

      {/* Tiến độ theo chủ đề */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h3 className="inline-flex items-center gap-2 text-base font-bold text-zinc-900">
          <span className="text-violet-500">◉</span> Tiến độ theo chủ đề
        </h3>
        <Link href="/roadmap" className="font-mono text-sm font-semibold text-violet-600 hover:text-violet-700">
          Xem chi tiết &gt;
        </Link>
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
    </div>
  );
}
