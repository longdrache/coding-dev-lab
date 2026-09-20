"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Search } from "lucide-react";
import Logo from "@/app/ui/Logo";
import type { Difficulty } from "@/app/data/problems";
import { topics } from "@/app/data/topics";
import { useSolvedSlugs } from "./solved";
import { useProblems } from "@/app/hooks/useProblems";

const DIFFICULTIES: Array<"Tất cả" | Difficulty> = [
  "Tất cả",
  "Dễ",
  "Trung bình",
  "Khó",
];

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  Dễ: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Trung bình": "bg-amber-50 text-amber-700 border-amber-200",
  Khó: "bg-rose-50 text-rose-700 border-rose-200",
};

function topicTitle(slug: string): string {
  return topics.find((topic) => topic.slug === slug)?.title ?? slug;
}

function ProblemList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Topic lấy trực tiếp từ URL để nút lọc, back/forward và link
  // từ homepage (?topic=...) luôn đồng bộ, không kẹt state cũ.
  const topic = searchParams.get("topic") ?? "all";

  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<"Tất cả" | Difficulty>("Tất cả");
  const solvedSlugs = useSolvedSlugs();
  const { problems: dbProblems, loading } = useProblems();
  const problems = useMemo(() => dbProblems ?? [], [dbProblems]);

  function updateTopic(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("topic");
    } else {
      params.set("topic", next);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/problem?${queryString}` : "/problem", {
      scroll: false,
    });
  }

  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const problem of problems) {
      counts.set(problem.topic, (counts.get(problem.topic) ?? 0) + 1);
    }
    return counts;
  }, [problems]);

  const filtered = problems.filter((problem) => {
    const matchQuery =
      query.trim() === "" ||
      problem.title.toLowerCase().includes(query.trim().toLowerCase());
    const matchTopic = topic === "all" || problem.topic === topic;
    const matchDifficulty =
      difficulty === "Tất cả" || problem.difficulty === difficulty;
    return matchQuery && matchTopic && matchDifficulty;
  });

  return (
    <main className="min-h-screen bg-white px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <Logo />
        </div>
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-300 pb-5">
          <div>
            <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-600">
              Problem Lab
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
              Danh sách bài tập
            </h1>
            <p className="mt-2 text-sm font-medium text-zinc-700">
              {problems.length} bài tập • chọn một bài để bắt đầu giải
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 transition"
          >
            <ArrowLeft className="size-4" />
            Trang chủ
          </Link>
        </header>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="relative block lg:max-w-xs lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm bài tập..."
              className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-500"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {DIFFICULTIES.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  difficulty === level
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateTopic("all")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              topic === "all"
                ? "bg-zinc-950 text-white"
                : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
            }`}
          >
            Tất cả ({problems.length})
          </button>
          {topics.map((item) => {
            const count = topicCounts.get(item.slug) ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => updateTopic(item.slug)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  topic === item.slug
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                {item.title} ({count})
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-zinc-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-16 text-center">
            <p className="font-semibold text-zinc-900">Không tìm thấy bài tập</p>
            <p className="mt-2 text-sm text-zinc-500">
              Thử từ khóa khác hoặc chọn lại chủ đề và độ khó.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((problem) => (
              <Link
                key={problem.slug}
                href={`/problem/${problem.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-[0_16px_35px_-16px_rgba(16,24,40,0.2)]"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-zinc-950/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                    {topicTitle(problem.topic)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${DIFFICULTY_STYLES[problem.difficulty]}`}
                  >
                    {problem.difficulty}
                  </span>
                </div>
                <h2 className="mt-3 text-[16px] font-semibold tracking-tight text-zinc-900">
                  {problem.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-500">
                  {problem.description}
                </p>
                <div className="mt-auto flex items-center justify-between pt-4">
                  {solvedSlugs.includes(problem.slug) ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="size-3.5" />
                      Đã giải
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-zinc-400">
                      {problem.tests.length} test mẫu
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-emerald-600">
                    Giải ngay
                    <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function ProblemPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-5 py-8 sm:px-10">
          <div className="mx-auto max-w-6xl animate-pulse">
            <div className="mb-8 h-12 w-72 rounded-lg bg-zinc-200" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-zinc-100" />
              ))}
            </div>
          </div>
        </main>
      }
    >
      <ProblemList />
    </Suspense>
  );
}
