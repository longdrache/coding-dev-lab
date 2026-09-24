"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search, List, LayoutGrid, ArrowUpDown, Eye, Star, CheckCircle2, Circle, Tag } from "lucide-react";
import Logo from "@/app/ui/Logo";
import Breadcrumbs from "@/app/ui/Breadcrumbs";
import type { Difficulty, Problem } from "@/app/data/problems";
import { topics } from "@/app/data/topics";
import { useSolvedSlugs, useServerSolvedSlugs } from "./solved";
import { useProblems } from "@/app/hooks/useProblems";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const DIFFICULTIES: Array<"Tất cả" | Difficulty> = ["Tất cả", "Dễ", "Trung bình", "Khó"];

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  Dễ: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Trung bình": "bg-amber-50 text-amber-700 border-amber-200",
  Khó: "bg-rose-50 text-rose-700 border-rose-200",
};

const PAGE_SIZE = 10;

function topicTitle(slug: string): string {
  return topics.find((topic) => topic.slug === slug)?.title ?? slug;
}

const FAV_KEY = "gocode-favorites";
const FAV_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function readLocalFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function useFavorites() {
  const { getToken, isSignedIn } = useAuth();
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setFavs(JSON.parse(raw));
    } catch {}
  }, []);
  // Đồng bộ từ server (FavoriteProblem) khi đăng nhập — gộp với local
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      // Đẩy favorites local chưa có lên server trước (máy mới)
      const local = readLocalFavs();
      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        await Promise.all(
          local.map((slug) =>
            fetch(`${FAV_API}/api/progress/favorites`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ slug }),
            }).catch(() => null),
          ),
        );
        const res = await fetch(`${FAV_API}/api/progress/favorites`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.slugs)) {
          const merged = [...new Set([...readLocalFavs(), ...data.slugs.filter((s: unknown): s is string => typeof s === "string")])];
          try { localStorage.setItem(FAV_KEY, JSON.stringify(merged)); } catch {}
          setFavs(merged);
        }
      } catch {
        // BE offline thì giữ local, không vỡ app
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, isSignedIn]);
  const toggle = (slug: string) => {
    const adding = !favs.includes(slug);
    setFavs((prev) => {
      const next = adding ? [...prev, slug] : prev.filter((s) => s !== slug);
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    // Lưu server nền (fire-and-forget) để không mất khi đổi máy
    if (isSignedIn) {
      (async () => {
        try {
          const token = await getToken();
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
          if (adding) {
            await fetch(`${FAV_API}/api/progress/favorites`, {
              method: "POST",
              headers,
              body: JSON.stringify({ slug }),
            });
          } else {
            await fetch(`${FAV_API}/api/progress/favorites/${encodeURIComponent(slug)}`, {
              method: "DELETE",
              headers,
            });
          }
        } catch {}
      })();
    }
  };
  return { favs, toggle };
}

export default function ProblemList({ initial }: { initial: Problem[] | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic") ?? "all";
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<"Tất cả" | Difficulty>("Tất cả");
  const [statusFilter, setStatusFilter] = useState<"all" | "solved" | "unsolved" | "fav">("all");
  const [sortBy, setSortBy] = useState<"id" | "title">("id");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  // Hợp nhất localStorage + server (SolvedProblem) để nhận diện
  // bài đã giải dù đổi trình duyệt hay mất cache
  const localSolved = useSolvedSlugs();
  const serverSolved = useServerSolvedSlugs();
  const solvedSlugs = useMemo(
    () => [...new Set([...localSolved, ...serverSolved])],
    [localSolved, serverSolved],
  );
  const { favs, toggle: toggleFav } = useFavorites();
  // initial là data server đã fetch sẵn (SSR) — SWR dùng làm fallback nên
  // lần render đầu đã có data, không chớp skeleton, không fetch lại.
  const { problems: dbProblems, loading: swrLoading } = useProblems(initial ?? undefined);
  // Gate data theo mounted để lần render đầu của client khớp hệt server
  // (tránh hydration mismatch do SWR cache persist). Sau mount data đã
  // có sẵn trong cache nên chỉ chớp skeleton 1 frame, không fetch mới.
  // Khi server đã có initial thì HTML đã chứa data — hiện ngay, bỏ gate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard, cố ý 1 lần
    setMounted(true);
  }, []);
  const problems = useMemo(
    () => (mounted ? (dbProblems ?? initial ?? []) : (initial ?? [])),
    [mounted, dbProblems, initial],
  );
  const loading = initial ? false : (!mounted || swrLoading);

  // counts cho pills
  const topicCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of problems) m.set(p.topic, (m.get(p.topic) ?? 0) + 1);
    return m;
  }, [problems]);

  const difficultyCounts = useMemo(() => {
    const m: Record<string, number> = { "Tất cả": problems.length };
    for (const d of ["Dễ", "Trung bình", "Khó"] as const) m[d] = problems.filter((p) => p.difficulty === d).length;
    return m;
  }, [problems]);

  const solvedCount = useMemo(() => problems.filter((p) => solvedSlugs.includes(p.slug)).length, [problems, solvedSlugs]);
  const unsolvedCount = problems.length - solvedCount;
  const favCount = useMemo(() => problems.filter((p) => favs.includes(p.slug)).length, [problems, favs]);

  function updateTopic(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("topic");
    else params.set("topic", next);
    const qs = params.toString();
    router.replace(qs ? `/problem?${qs}` : "/problem", { scroll: false });
  }

  const filtered = useMemo(() => {
    let arr = problems.filter((p) => {
      const mq = query.trim() === "" || p.title.toLowerCase().includes(query.trim().toLowerCase()) || p.slug.includes(query.trim().toLowerCase());
      const mt = topic === "all" || p.topic === topic;
      const md = difficulty === "Tất cả" || p.difficulty === difficulty;
      return mq && mt && md;
    });
    // status filter
    if (statusFilter === "solved") arr = arr.filter((p) => solvedSlugs.includes(p.slug));
    else if (statusFilter === "unsolved") arr = arr.filter((p) => !solvedSlugs.includes(p.slug));
    else if (statusFilter === "fav") arr = arr.filter((p) => favs.includes(p.slug));

    // sort
    if (sortBy === "id") {
      // giữ nguyên thứ tự gốc (đã là ID tăng dần)
    } else {
      arr = [...arr].sort((a, b) => a.title.localeCompare(b.title, "vi"));
    }
    return arr;
  }, [problems, query, topic, difficulty, statusFilter, sortBy, solvedSlugs, favs]);

  useEffect(() => {
    // Reset pagination khi filter đổi — cố ý cascading 1 lần
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [query, topic, difficulty, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);

  return (
    <main className="min-h-screen bg-wash px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <Breadcrumbs
          className="mb-4"
          items={[{ label: "Trang chủ", href: "/" }, { label: "Bài tập" }]}
        />
        {/* Top header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <Logo />
          <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-zinc-800 transition">
            <ArrowLeft className="size-4" /> Trang chủ
          </Link>
        </div>

        {/* Filter card như ảnh */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4 shadow-sm">
          {/* Row 1: search + difficulty pills + sort + view toggle */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex flex-1 items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm kiếm bài tập theo tên, thẻ tag (ví dụ: Two Pointers, Trie, DP, #1)..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white"
              />
            </label>

            <div className="flex items-center gap-2 overflow-x-auto">
              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1">
                {DIFFICULTIES.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setDifficulty(lv)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      difficulty === lv ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    {lv} ({difficultyCounts[lv] ?? 0})
                  </button>
                ))}
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSortBy(sortBy === "id" ? "title" : "id")}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Sắp xếp: {sortBy === "id" ? "Mã bài (#ID)" : "Tên bài"} <ArrowUpDown className="size-3.5 text-zinc-400" />
                </button>
                <div className="flex items-center rounded-xl border border-zinc-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className={`rounded-lg p-1.5 ${view === "list" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}
                    title="Dạng danh sách"
                  >
                    <List className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("grid")}
                    className={`rounded-lg p-1.5 ${view === "grid" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}
                    title="Dạng lưới"
                  >
                    <LayoutGrid className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Chủ đề scroll */}
          <div className="mt-3 flex items-center gap-2 overflow-hidden">
            <span className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-zinc-500">
              <Tag className="size-3.5" /> Chủ đề:
            </span>
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-thin py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => updateTopic("all")}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${topic === "all" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
              >
                Tất cả
              </button>
              {topics.map((t) => {
                const cnt = topicCounts.get(t.slug) ?? 0;
                if (cnt === 0) return null;
                return (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => updateTopic(t.slug)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${topic === t.slug ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
          {/* scrollbar giả như ảnh */}
          <div className="mt-2 h-1.5 rounded-full bg-zinc-100">
            <div className="h-1.5 w-3/4 rounded-full bg-zinc-300" />
          </div>

          {/* Row 3: Trạng thái */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`font-medium ${statusFilter === "all" ? "font-bold text-zinc-900 underline decoration-zinc-900 underline-offset-4" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Tất cả ({problems.length})
            </button>
            <span className="text-zinc-300">•</span>
            <button
              type="button"
              onClick={() => setStatusFilter("solved")}
              className={`inline-flex items-center gap-1 ${statusFilter === "solved" ? "font-bold text-zinc-900 underline decoration-zinc-900 underline-offset-4" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              <CheckCircle2 className="size-3.5 text-emerald-600" /> Đã giải ({solvedCount})
            </button>
            <span className="text-zinc-300">•</span>
            <button
              type="button"
              onClick={() => setStatusFilter("unsolved")}
              className={`${statusFilter === "unsolved" ? "font-bold text-zinc-900 underline decoration-zinc-900 underline-offset-4" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Chưa giải ({unsolvedCount})
            </button>
            <span className="text-zinc-300">•</span>
            <button
              type="button"
              onClick={() => setStatusFilter("fav")}
              className={`inline-flex items-center gap-1 ${statusFilter === "fav" ? "font-bold text-zinc-900 underline decoration-zinc-900 underline-offset-4" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              <Star className="size-3.5 fill-amber-400 text-amber-400" /> Yêu thích ({favCount})
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-zinc-500">Hiển thị <span className="font-bold text-zinc-900">{filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span> / {problems.length} bài tập</p>

        {/* Table / Grid */}
        {loading ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="divide-y divide-zinc-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4">
                  <div className="h-5 w-5 animate-pulse rounded-full bg-zinc-100" />
                  <div className="h-5 w-8 animate-pulse rounded bg-zinc-100" />
                  <div className="h-5 w-48 animate-pulse rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <p className="font-semibold text-zinc-900">Không tìm thấy bài tập</p>
            <p className="mt-2 text-sm font-medium text-zinc-600">Thử từ khóa khác hoặc chọn lại chủ đề.</p>
          </div>
        ) : view === "grid" ? (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((p, idx) => {
              const globalIndex = (currentPage - 1) * PAGE_SIZE + idx + 1;
              const solved = solvedSlugs.includes(p.slug);
              const fav = favs.includes(p.slug);
              return (
                <Link key={p.slug} href={`/problem/${p.slug}`} className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300 hover:shadow-md transition">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-zinc-500">#{globalIndex}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); toggleFav(p.slug); }}
                      className={fav ? "text-amber-400" : "text-zinc-300 hover:text-amber-400"}
                    >
                      <Star className={`size-4 ${fav ? "fill-amber-400" : ""}`} />
                    </button>
                  </div>
                  <h3 className="mt-2 line-clamp-1 text-sm font-bold tracking-tight text-zinc-900 group-hover:text-zinc-700">{p.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{p.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${DIFFICULTY_STYLES[p.difficulty]}`}>{p.difficulty}</span>
                    {solved && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">Đã đạt</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600 border border-zinc-200">{topicTitle(p.topic)}</span>
                    <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white">Giải →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/80 hover:bg-zinc-50/80 border-b border-zinc-200">
                    <TableHead className="w-[56px] text-center font-mono text-[11px] font-bold tracking-widest text-zinc-500">TRẠNG THÁI</TableHead>
                    <TableHead className="w-[64px] text-center font-mono text-[11px] font-bold tracking-widest text-zinc-500">MÃ</TableHead>
                    <TableHead className="min-w-[320px] font-mono text-[11px] font-bold tracking-widest text-zinc-500">TIÊU ĐỀ BÀI TOÁN</TableHead>
                    <TableHead className="w-[110px] text-center font-mono text-[11px] font-bold tracking-widest text-zinc-500">ĐỘ KHÓ</TableHead>
                    <TableHead className="w-[150px] font-mono text-[11px] font-bold tracking-widest text-zinc-500">CHỦ ĐỀ</TableHead>
                    <TableHead className="w-[120px] text-right font-mono text-[11px] font-bold tracking-widest text-zinc-500">THAO TÁC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((p, idx) => {
                    const globalIndex = (currentPage - 1) * PAGE_SIZE + idx + 1;
                    const solved = solvedSlugs.includes(p.slug);
                    const fav = favs.includes(p.slug);
         
                    return (
                      <TableRow key={p.slug} className="group border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1">
                            {solved ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-zinc-300" />}
                            <button
                              type="button"
                              onClick={() => toggleFav(p.slug)}
                              className={fav ? "text-amber-400" : "text-zinc-300 hover:text-amber-400"}
                            >
                              <Star className={`size-4 ${fav ? "fill-amber-400" : ""}`} />
                            </button>
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs font-bold text-zinc-500">#{globalIndex}</TableCell>
                        <TableCell>
                          <Link href={`/problem/${p.slug}`} className="block group/link">
                            <span className="flex items-center gap-2">
                              <span className="line-clamp-1 text-sm font-semibold tracking-tight text-zinc-900 group-hover/link:text-zinc-700">{p.title}</span>
                              {solved && <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">Đã đạt</span>}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600 border border-zinc-200">{topicTitle(p.topic)}</span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${DIFFICULTY_STYLES[p.difficulty]}`}>{p.difficulty}</span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 border border-zinc-200">{topicTitle(p.topic)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-1">
                            <span className="hidden sm:inline-flex size-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500"><Eye className="size-3.5" /></span>
                            <Link href={`/problem/${p.slug}`} className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-black">
                              Giải <span aria-hidden>→</span>
                            </Link>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs font-medium text-zinc-500">Trang {currentPage}/{Math.ceil(filtered.length / PAGE_SIZE)}</p>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer border border-zinc-300 bg-white"} />
                </PaginationItem>
                {Array.from({ length: Math.ceil(filtered.length / PAGE_SIZE) }).map((_, i) => {
                  const p = i + 1;
                  const total = Math.ceil(filtered.length / PAGE_SIZE);
                  if (total > 7 && p !== 1 && p !== total && Math.abs(p - currentPage) > 1) {
                    if (p === 2 || p === total - 1) return <PaginationItem key={p}><span className="px-2 text-zinc-400">…</span></PaginationItem>;
                    return null;
                  }
                  return (
                    <PaginationItem key={p}>
                      <PaginationLink href="#" isActive={p === currentPage} onClick={(e) => { e.preventDefault(); setPage(p); }} className={p === currentPage ? "bg-zinc-900 text-white border-zinc-900" : "border border-zinc-300 bg-white"}>
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(Math.ceil(filtered.length / PAGE_SIZE), p + 1)); }} className={currentPage === Math.ceil(filtered.length / PAGE_SIZE) ? "pointer-events-none opacity-50" : "cursor-pointer border border-zinc-300 bg-white"} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </main>
  );
}
