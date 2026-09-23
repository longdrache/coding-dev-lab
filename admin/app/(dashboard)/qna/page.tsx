"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { adminFetch } from "@/lib/api";
import { swrFetcher } from "@/lib/swr";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2 } from "lucide-react";

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
  const { data, error, mutate } = useSWR<QnaItem[] | { qna?: QnaItem[]; data?: QnaItem[] }>(
    "/api/admin/qna",
    swrFetcher,
  );
  const items = useMemo<QnaItem[] | null>(() => {
    if (!data) return null;
    return Array.isArray(data) ? data : data?.qna ?? data?.data ?? [];
  }, [data]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<QnaItem | null>(null);
  const [replying, setReplying] = useState<QnaItem | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySending, setReplySending] = useState(false);
  const [replyDone, setReplyDone] = useState(false);

  const load = () => mutate();

  const openReply = (q: QnaItem) => {
    setReplying(q);
    setReplyMessage("");
    setReplyError(null);
    setReplyDone(false);
  };

  const handleReply = async () => {
    if (!replying || !replyMessage.trim() || replySending) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await adminFetch(`/api/admin/qna/${replying.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: replyMessage.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Gửi thất bại: ${res.status}`);
      setReplyDone(true);
      setTimeout(() => {
        setReplying(null);
        setReplyDone(false);
      }, 2500);
    } catch (e: unknown) {
      setReplyError(e instanceof Error ? e.message : "Gửi thất bại");
    } finally {
      setReplySending(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa câu hỏi này?")) return;
    setDeletingId(id);
    try {
      const res = await adminFetch(`/api/admin/qna/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Delete failed: ${res.status}`);
      }
      await mutate();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Hỏi đáp</h1>
        <p className="text-sm text-red-600">{error instanceof Error ? error.message : "Failed to load QNA"}</p>
        <button onClick={load} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium">Thử lại</button>
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
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Hỏi đáp</h1>
        <p className="mt-1 text-sm text-slate-500">{items.length} câu hỏi từ người dùng — bấm vào hàng để xem đầy đủ</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Chưa có câu hỏi nào.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-white hover:bg-white">
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Tên</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Email</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Câu hỏi</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Ngày gửi</TableHead>
                  <TableHead className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((q) => {
                  const text = q.question ?? q.message ?? q.content ?? "";
                  return (
                    <TableRow
                      key={q.id}
                      className="h-12 cursor-pointer border-slate-100 hover:bg-slate-50"
                      onClick={() => setSelected(q)}
                    >
                      <TableCell className="max-w-[160px] truncate px-4 py-2 text-sm font-normal text-slate-900" title={q.name}>{q.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate px-4 py-2 text-sm text-slate-500" title={q.email}>{q.email}</TableCell>
                      <TableCell className="max-w-[420px] truncate px-4 py-2 text-sm text-slate-900" title="Bấm để xem đầy đủ">{text}</TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-2 font-mono text-xs tabular-nums text-slate-500">{q.createdAt ? new Date(q.createdAt).toLocaleString("vi-VN") : "—"}</TableCell>
                      <TableCell className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <Button onClick={() => openReply(q)} variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 bg-white text-xs font-medium hover:bg-slate-50">
                            <Send className="size-3.5" />
                            Trả lời
                          </Button>
                          <Button
                            onClick={() => handleDelete(q.id)}
                            disabled={deletingId === q.id}
                            variant="destructive"
                            size="icon-sm"
                            title={deletingId === q.id ? "Đang xóa..." : "Xóa câu hỏi"}
                            className="size-8 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5 text-white" />
                          </Button>
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

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] gap-4 overflow-hidden border-slate-200 bg-white sm:max-w-xl">
          <DialogHeader className="min-w-0 space-y-1.5 text-left">
            <DialogTitle className="min-w-0 font-display text-xl font-semibold break-all text-slate-900 [overflow-wrap:anywhere]">Câu hỏi từ {selected?.name}</DialogTitle>
            <p className="min-w-0 text-xs break-all text-slate-500 [overflow-wrap:anywhere]">
              {selected?.email} • {selected?.createdAt ? new Date(selected.createdAt).toLocaleString("vi-VN") : "—"}
            </p>
          </DialogHeader>
          <div className="h-auto max-h-[55vh] min-w-0 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed break-all whitespace-pre-wrap text-slate-900 [overflow-wrap:anywhere]">
            {selected ? (selected.question ?? selected.message ?? selected.content ?? "") : ""}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => { if (selected) { setSelected(null); openReply(selected); } }}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-slate-200 bg-white text-xs font-medium hover:bg-slate-50"
            >
              <Send className="size-3.5" />
              Trả lời
            </Button>
            <Button
              onClick={() => { if (selected) { handleDelete(selected.id); setSelected(null); } }}
              disabled={deletingId === selected?.id}
              variant="destructive"
              size="icon-sm"
              title={deletingId === selected?.id ? "Đang xóa..." : "Xóa câu hỏi này"}
              className="size-8 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-40"
            >
              <Trash2 className="size-3.5 text-white" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replying} onOpenChange={(open) => { if (!open) setReplying(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[calc(100vw-2rem)] gap-4 overflow-hidden border-slate-200 bg-white sm:max-w-xl">
          <DialogHeader className="min-w-0 space-y-1.5 text-left">
            <DialogTitle className="min-w-0 font-display text-xl font-semibold break-all text-slate-900 [overflow-wrap:anywhere]">
              Trả lời {replying?.name}
            </DialogTitle>
            <p className="min-w-0 text-xs break-all text-slate-500 [overflow-wrap:anywhere]">
              Gửi tới {replying?.email} • Tiêu đề, chào hỏi và chữ ký tự động theo mẫu chuyên nghiệp
            </p>
          </DialogHeader>
          {replyDone ? (
            <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium break-all text-emerald-700 [overflow-wrap:anywhere]">
              Đã gửi email trả lời tới {replying?.email}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-900">Lời nhắn *</Label>
                <Textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  rows={6}
                  placeholder="Chỉ nhập nội dung trả lời..."
                  className="min-h-[140px] w-full max-w-full resize-y border-slate-200 break-all placeholder:text-slate-400 [overflow-wrap:anywhere]"
                />
              </div>
              {replyError && (
                <p className="rounded-lg border-2 border-red-500 bg-white px-3.5 py-2.5 text-sm text-red-600">{replyError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setReplying(null)}
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 bg-white text-xs font-medium hover:bg-slate-50"
                >
                  Hủy
                </Button>
                <Button
                  onClick={handleReply}
                  disabled={replySending || !replyMessage.trim()}
                  size="sm"
                  className="h-8 rounded-lg bg-slate-900 px-3.5 text-xs font-medium text-white hover:bg-slate-950 disabled:opacity-40"
                >
                  <Send className="size-3.5" />
                  {replySending ? "Đang gửi..." : "Gửi email"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
