"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Trash2, Pencil } from "lucide-react";

type Problem = {
  id?: string;
  slug: string;
  title: string;
  difficulty: string;
  topic: string;
  description?: string;
  createdAt?: string;
};

const PAGE_SIZE = 10;

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<string>("Tất cả");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    adminFetch("/api/admin/problems")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message || `Failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.problems ?? data?.data ?? [];
        setProblems(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!problems) return [];
    return problems.filter((p) => {
      const mq = query.trim() === "" || p.title.toLowerCase().includes(query.trim().toLowerCase()) || p.slug.includes(query.trim().toLowerCase());
      const md = difficulty === "Tất cả" || p.difficulty === difficulty;
      return mq && md;
    });
  }, [problems, query, difficulty]);

  useEffect(() => { setPage(1); }, [query, difficulty]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);

  const handleDelete = async (slug: string) => {
    if (!confirm(`Xóa problem "${slug}"?`)) return;
    try {
      const res = await adminFetch(`/api/admin/problems/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Delete failed: ${res.status}`);
      }
      setProblems((prev) => (prev ? prev.filter((p) => p.slug !== slug) : prev));
    } catch (e: any) {
      alert(e.message || "Delete failed");
    }
  };

  const FE_URL = process.env.NEXT_PUBLIC_FE_URL || "http://localhost:3000";

  const recentCount = useMemo(() => {
    if (!problems) return 0;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return problems.filter((p) => {
      if (!p.createdAt) return false;
      const t = new Date(p.createdAt).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    }).length;
  }, [problems]);

  if (error) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      </div>
    );
  }

  if (!problems) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950">Quản lý bài tập</h1>
          <p className="mt-1 text-sm text-zinc-500">Thư viện thử thách và tình trạng xuất bản.</p>
        </div>
        <Link
          href="/problems/new"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-600"
        >
          + Tạo bài tập
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Tổng bài tập</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-zinc-950 tabular-nums">{problems.length}</p>
          <p className="mt-2 text-sm font-semibold text-emerald-600">+{recentCount} trong 30 ngày</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Đang xuất bản</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-zinc-950 tabular-nums">{problems.length}</p>
          <p className="mt-2 text-sm font-semibold text-indigo-500">100% danh mục</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Chờ duyệt</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-zinc-950 tabular-nums">0</p>
          <p className="mt-2 text-sm font-semibold text-amber-500">Không có nội dung chờ</p>
        </div>
      </div>

      {/* Library card */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-950">Thư viện bài tập</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-zinc-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên, slug..."
                className="border-zinc-200 bg-white pl-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-indigo-400"
              />
            </label>
            <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1">
              {["Tất cả", "Dễ", "Trung bình", "Khó"].map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => setDifficulty(lv)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    difficulty === lv ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {lv}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm font-medium text-zinc-500">Không tìm thấy problem</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200 bg-zinc-50 hover:bg-zinc-50">
                  <TableHead className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Bài tập</TableHead>
                  <TableHead className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Chủ đề</TableHead>
                  <TableHead className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Độ khó</TableHead>
                  <TableHead className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Trạng thái</TableHead>
                  <TableHead className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Cập nhật</TableHead>
                  <TableHead className="px-5 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((p) => (
                  <TableRow key={p.slug} className="border-b border-zinc-100 bg-white transition-colors last:border-0 hover:bg-zinc-50">
                    <TableCell className="px-5 py-4">
                      <p className="text-sm font-bold tracking-tight text-zinc-900">{p.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-400">{p.slug}</p>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm text-zinc-500">{p.topic}</TableCell>
                    <TableCell className="px-5 py-4">
                      <span
                        className={`text-sm font-bold ${
                          p.difficulty === "Dễ"
                            ? "text-emerald-600"
                            : p.difficulty === "Trung bình"
                              ? "text-amber-500"
                              : "text-rose-500"
                        }`}
                      >
                        {p.difficulty}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm font-semibold text-emerald-600">Đã xuất bản</TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-4 text-sm text-zinc-500">
                      {p.createdAt
                        ? new Date(p.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <Link
                          href={`/problems/${p.slug}/edit`}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          <Pencil className="size-3.5" /> Sửa
                        </Link>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(p.slug)}
                          className="h-7 font-bold"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-zinc-500">Trang {currentPage}/{totalPages} • {filtered.length} bài</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="border-zinc-200 bg-white"
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="border-zinc-200 bg-white"
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
