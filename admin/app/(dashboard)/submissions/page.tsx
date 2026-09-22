"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye } from "lucide-react";

type SubUser = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl: string;
} | null;

type Submission = {
  id: string;
  clerkId: string;
  problemSlug: string;
  languageId: number;
  sourceCode: string;
  status: string | null;
  passed: boolean | null;
  passedCount: number | null;
  totalCount: number | null;
  time: string | null;
  memory: number | null;
  createdAt: string;
  user: SubUser;
};

const LANG_LABELS: Record<number, string> = {
  71: "Python 3",
  63: "JavaScript",
  74: "TypeScript",
  54: "C++ 17",
  62: "Java",
  51: "C#",
  60: "Go",
  68: "PHP",
};

export default function SubmissionsPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Submission | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { setPage(0); }, [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const offset = page * limit;
    const url = `/api/admin/submissions?limit=${limit}&offset=${offset}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ""}`;
    adminFetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message || `Failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, debouncedQuery]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Bài nộp</h1>
        <p className="mt-1 text-sm text-slate-500">Xem ai nộp bài nào và mã nguồn đã nộp • {total} lượt</p>
      </div>

      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 size-4 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo email, tên, slug bài..." className="h-[42px] border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-[3px] focus-visible:ring-slate-900/10" />
      </div>

      {error ? (
        <p className="rounded-lg border-2 border-red-500 bg-white px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Chưa có bài nộp nào</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-white hover:bg-white">
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Người nộp</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Bài</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Ngôn ngữ</TableHead>
                  <TableHead className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Kết quả</TableHead>
                  <TableHead className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Thời gian chạy</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Ngày nộp</TableHead>
                  <TableHead className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow
                    key={s.id}
                    className="h-12 cursor-pointer border-slate-100 hover:bg-slate-50"
                    onClick={() => setSelected(s)}
                  >
                    <TableCell className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <img src={s.user?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(s.user?.email || s.clerkId)}`} alt="" className="size-8 rounded-full border border-slate-200 bg-white object-cover" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-normal text-slate-900">
                            {[s.user?.firstName, s.user?.lastName].filter(Boolean).join(" ") || s.user?.username || "—"}
                          </p>
                          <p className="truncate text-xs text-slate-500">{s.user?.email || s.clerkId.slice(0, 12) + "…"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 font-mono text-sm text-slate-900">{s.problemSlug}</TableCell>
                    <TableCell className="px-4 py-2 text-sm text-slate-500">{LANG_LABELS[s.languageId] ?? `#${s.languageId}`}</TableCell>
                    <TableCell className="px-4 py-2 text-center">
                      {s.passed ? (
                        <Badge className="rounded border-0 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.5px] text-emerald-700 hover:bg-emerald-500/10">Accepted {s.passedCount}/{s.totalCount}</Badge>
                      ) : (
                        <Badge className="rounded border-0 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.5px] text-red-600 hover:bg-red-500/10">{s.status ?? "Failed"} {s.passedCount ?? 0}/{s.totalCount ?? "?"}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-center font-mono text-xs tabular-nums text-slate-500">
                      {s.time ? `${s.time}s` : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-2 font-mono text-xs tabular-nums text-slate-500">
                      {s.createdAt ? new Date(s.createdAt).toLocaleString("vi-VN") : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelected(s)} className="h-8 rounded-lg border-slate-200 bg-white text-xs font-medium hover:bg-slate-50">
                        <Eye className="size-3.5" /> Xem code
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Trang {page + 1}/{totalPages} • {total} lượt nộp</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-8 rounded-lg border-slate-200 bg-white">Trước</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-lg border-slate-200 bg-white">Sau</Button>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] gap-4 overflow-hidden border-slate-200 bg-white sm:max-w-3xl">
          <DialogHeader className="min-w-0 space-y-1.5 text-left">
            <DialogTitle className="min-w-0 font-display text-xl font-semibold break-all text-slate-900 [overflow-wrap:anywhere]">
              {selected?.problemSlug} • {[selected?.user?.firstName, selected?.user?.lastName].filter(Boolean).join(" ") || selected?.user?.username || selected?.user?.email}
            </DialogTitle>
            <p className="min-w-0 text-xs break-all text-slate-500 [overflow-wrap:anywhere]">
              {selected && LANG_LABELS[selected.languageId]} • {selected?.status} {selected?.passedCount}/{selected?.totalCount}
              {selected?.time ? ` • ${selected.time}s` : ""} • {selected?.createdAt ? new Date(selected.createdAt).toLocaleString("vi-VN") : ""}
            </p>
          </DialogHeader>
          <pre className="h-auto max-h-[60vh] min-w-0 overflow-auto rounded-lg border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-slate-50 [overflow-wrap:anywhere]">
            {selected?.sourceCode}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
