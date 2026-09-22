"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Trash2, Pencil, CheckCircle2, Undo2 } from "lucide-react";

type ProblemStatus = "draft" | "pending" | "published";

const STATUS_LABEL: Record<ProblemStatus, string> = {
  draft: "Nháp",
  pending: "Chờ duyệt",
  published: "Đã xuất bản",
};

type Problem = {
  id?: string;
  slug: string;
  title: string;
  difficulty: string;
  topic: string;
  description?: string;
  status?: string;
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

  const handleStatus = async (slug: string, action: "approve" | "unpublish") => {
    try {
      const res = await adminFetch(`/api/admin/problems/${slug}/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Failed: ${res.status}`);
      }
      const updated = await res.json();
      setProblems((prev) =>
        prev ? prev.map((p) => (p.slug === slug ? { ...p, status: updated.status ?? p.status } : p)) : prev,
      );
    } catch (e: any) {
      alert(e.message || "Cập nhật trạng thái thất bại");
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
        <p className="rounded-lg border-2 border-red-500 bg-white px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!problems) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Quản lý bài tập</h1>
          <p className="mt-1 text-sm text-slate-500">Đang tải thư viện...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Quản lý bài tập</h1>
          <p className="mt-1 text-sm text-slate-500">Thư viện thử thách và tình trạng xuất bản.</p>
        </div>
        <Link
          href="/problems/new"
          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-lg bg-slate-900 px-[22px] text-sm font-semibold text-white transition hover:bg-slate-950"
        >
          + Tạo bài tập
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Tổng bài tập</p>
          <p className="mt-2 font-mono text-[32px] font-bold leading-none tabular-nums text-slate-900">{problems.length}</p>
          <p className="mt-2 text-xs text-emerald-600">+{recentCount} trong 30 ngày</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Đang xuất bản</p>
          <p className="mt-2 font-mono text-[32px] font-bold leading-none tabular-nums text-slate-900">{problems.length}</p>
          <p className="mt-2 text-xs text-sky-600">100% danh mục</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Chờ duyệt</p>
          <p className="mt-2 font-mono text-[32px] font-bold leading-none tabular-nums text-slate-900">0</p>
          <p className="mt-2 text-xs text-amber-600">Không có nội dung chờ</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-xl font-semibold text-slate-900">Thư viện bài tập</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3.5 size-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên, slug..."
                className="h-[42px] border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-[3px] focus-visible:ring-slate-900/10"
              />
            </label>
            <div className="flex items-center gap-1">
              {["Tất cả", "Dễ", "Trung bình", "Khó"].map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => setDifficulty(lv)}
                  className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium uppercase tracking-[0.5px] transition ${
                    difficulty === lv
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-900"
                  }`}
                >
                  {lv}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">Không tìm thấy problem</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-white hover:bg-white">
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Bài tập</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Chủ đề</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Độ khó</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Trạng thái</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Cập nhật</TableHead>
                  <TableHead className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((p) => (
                  <TableRow key={p.slug} className="h-12 border-b border-slate-100 bg-white last:border-0 hover:bg-slate-50">
                    <TableCell className="px-4 py-2">
                      <p className="text-sm font-normal text-slate-900">{p.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{p.slug}</p>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-sm text-slate-500">{p.topic}</TableCell>
                    <TableCell className="px-4 py-2">
                      <span
                        className={`rounded px-3 py-1 text-xs font-medium uppercase tracking-[0.5px] ${
                          p.difficulty === "Dễ"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : p.difficulty === "Trung bình"
                              ? "bg-yellow-500/10 text-yellow-700"
                              : "bg-red-500/10 text-red-600"
                        }`}
                      >
                        {p.difficulty}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      <span
                        className={`rounded px-3 py-1 text-xs font-medium uppercase tracking-[0.5px] ${
                          p.status === "published"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : p.status === "pending"
                              ? "bg-yellow-500/10 text-yellow-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {STATUS_LABEL[(p.status as ProblemStatus) ?? "draft"] ?? p.status ?? "Nháp"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-2 font-mono text-xs tabular-nums text-slate-500">
                      {p.createdAt
                        ? new Date(p.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {p.status !== "published" ? (
                          <button
                            type="button"
                            onClick={() => handleStatus(p.slug, "approve")}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="size-3.5 text-white" /> Duyệt
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatus(p.slug, "unpublish")}
                            title="Gỡ xuất bản"
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
                          >
                            <Undo2 className="size-3.5" /> Gỡ
                          </button>
                        )}
                        <Link
                          href={`/problems/${p.slug}/edit`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-900 bg-transparent px-3.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-900/5"
                        >
                          <Pencil className="size-3.5" /> Sửa
                        </Link>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(p.slug)}
                          className="h-8 rounded-lg bg-red-500 px-3.5 text-xs font-medium hover:bg-red-600"
                        >
                          <Trash2 className="size-3.5 text-white" />
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
          <p className="text-xs text-slate-500">Trang {currentPage}/{totalPages} • {filtered.length} bài</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 rounded-lg border-slate-200 bg-white"
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 rounded-lg border-slate-200 bg-white"
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
