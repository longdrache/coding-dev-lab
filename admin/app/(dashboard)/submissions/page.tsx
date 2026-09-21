"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ScrollText, Eye } from "lucide-react";

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
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(500px_circle_at_0%_0%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white text-zinc-900 shadow"><ScrollText className="size-5" /></div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Bài nộp</h1>
            <p className="text-sm font-medium text-zinc-400">Xem ai nộp bài nào + code đã nộp • {total} lượt</p>
          </div>
        </div>
      </div>

      <Card className="border-zinc-300 bg-white shadow-sm">
        <CardContent className="p-3">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 size-4 text-zinc-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo email, tên, slug bài..." className="pl-9 border-zinc-300 placeholder:text-zinc-400" />
          </label>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      ) : loading ? (
        <p className="text-sm font-medium text-zinc-600">Loading...</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm font-medium text-zinc-600">Chưa có bài nộp nào</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200 bg-zinc-50 hover:bg-zinc-50">
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Người nộp</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Bài</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Ngôn ngữ</TableHead>
                  <TableHead className="px-4 py-3 text-center text-xs font-bold tracking-wide text-zinc-700">Kết quả</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Thời gian</TableHead>
                  <TableHead className="px-4 py-3 text-right text-xs font-bold tracking-wide text-zinc-700">Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id} className="border-zinc-100 hover:bg-zinc-50/70">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <img src={s.user?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(s.user?.email || s.clerkId)}`} alt="" className="size-8 rounded-full border border-zinc-200 bg-white object-cover" />
                        <div>
                          <p className="text-sm font-semibold tracking-tight text-zinc-900">
                            {[s.user?.firstName, s.user?.lastName].filter(Boolean).join(" ") || s.user?.username || "—"}
                          </p>
                          <p className="text-xs text-zinc-500">{s.user?.email || s.clerkId.slice(0, 12) + "…"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium text-zinc-700">{s.problemSlug}</TableCell>
                    <TableCell className="text-sm font-medium text-zinc-700">{LANG_LABELS[s.languageId] ?? `#${s.languageId}`}</TableCell>
                    <TableCell className="text-center">
                      {s.passed ? (
                        <Badge className="border-0 bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">Accepted {s.passedCount}/{s.totalCount}</Badge>
                      ) : (
                        <Badge variant="outline" className="border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">{s.status ?? "Failed"} {s.passedCount ?? 0}/{s.totalCount ?? "?"}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium text-zinc-600">
                      {s.createdAt ? new Date(s.createdAt).toLocaleString("vi-VN") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelected(s)} className="h-7 border-zinc-300">
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
        <p className="text-xs font-medium text-zinc-600">Trang {page + 1}/{totalPages} • {total} lượt nộp</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="border-zinc-300">Trước</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-zinc-300">Sau</Button>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden border-zinc-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-950">
              Code — {selected?.problemSlug} • {[selected?.user?.firstName, selected?.user?.lastName].filter(Boolean).join(" ") || selected?.user?.username || selected?.user?.email}
            </DialogTitle>
            <p className="text-xs font-medium text-zinc-500">
              {selected && LANG_LABELS[selected.languageId]} • {selected?.status} {selected?.passedCount}/{selected?.totalCount}
              {selected?.time ? ` • ${selected.time}s` : ""} • {selected?.createdAt ? new Date(selected.createdAt).toLocaleString("vi-VN") : ""}
            </p>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100">
            {selected?.sourceCode}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
