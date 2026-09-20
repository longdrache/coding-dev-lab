"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">QNA</h1>
      {items.length === 0 ? (
        <p className="text-sm font-medium text-zinc-600">No questions yet.</p>
      ) : (
        <Card className="border-zinc-300 bg-white shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-100 hover:bg-zinc-100 border-b border-zinc-300">
                  <TableHead className="font-bold text-zinc-900">Name</TableHead>
                  <TableHead className="font-bold text-zinc-900">Email</TableHead>
                  <TableHead className="font-bold text-zinc-900">Question</TableHead>
                  <TableHead className="font-bold text-zinc-900">CreatedAt</TableHead>
                  <TableHead className="font-bold text-zinc-900 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((q) => {
                  const text = q.question ?? q.message ?? q.content ?? "";
                  return (
                    <TableRow key={q.id} className="hover:bg-zinc-50 align-top border-zinc-200">
                      <TableCell className="whitespace-nowrap font-semibold text-zinc-900">{q.name}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-zinc-700">{q.email}</TableCell>
                      <TableCell className="max-w-[400px] break-words font-medium text-zinc-900">{text}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-zinc-600">
                        {q.createdAt ? new Date(q.createdAt).toLocaleString("vi-VN") : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          onClick={() => handleDelete(q.id)}
                          disabled={deletingId === q.id}
                          variant="destructive"
                          size="sm"
                          className="font-bold"
                        >
                          {deletingId === q.id ? "Deleting..." : "Delete"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
