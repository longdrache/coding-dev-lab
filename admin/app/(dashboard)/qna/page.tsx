"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type QnaItem = {
  id: string;
  name: string;
  email: string;
  question: string;
  message?: string;
  content?: string;
  createdAt: string;
};

export default function QnaPage() {
  const [items, setItems] = useState<QnaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch("/api/admin/qna");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Failed: ${res.status}`);
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.qna ?? data?.data ?? [];
      setItems(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load QNA");
    }
  };

  useEffect(() => {
    // Initial data load — async fetch wraps setState in callback, not sync cascade
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa câu hỏi này?")) return;
    setDeletingId(id);
    try {
      const res = await adminFetch(`/api/admin/qna/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Delete failed: ${res.status}`);
      }
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">QNA</h1>
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="rounded border px-3 py-1 text-sm">Retry</button>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">QNA</h1>
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(500px_circle_at_0%_0%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">QNA</h1>
          <p className="text-sm font-medium text-zinc-400">{items.length} câu hỏi từ người dùng</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm font-medium text-zinc-600">Chưa có câu hỏi nào.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200 bg-zinc-50 hover:bg-zinc-50">
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Tên</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Email</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Câu hỏi</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Ngày gửi</TableHead>
                  <TableHead className="px-4 py-3 text-right text-xs font-bold tracking-wide text-zinc-700">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((q) => {
                  const text = q.question ?? q.message ?? q.content ?? "";
                  return (
                    <TableRow key={q.id} className="hover:bg-zinc-50/70 border-zinc-100">
                      <TableCell className="font-semibold text-zinc-900">{q.name}</TableCell>
                      <TableCell className="font-medium text-zinc-700">{q.email}</TableCell>
                      <TableCell className="max-w-[420px] break-words font-medium text-zinc-900">{text}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-medium text-zinc-600">{q.createdAt ? new Date(q.createdAt).toLocaleString("vi-VN") : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button onClick={() => handleDelete(q.id)} disabled={deletingId === q.id} variant="destructive" size="sm" className="h-7 font-bold">
                          {deletingId === q.id ? "Đang xóa..." : "Xóa"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
