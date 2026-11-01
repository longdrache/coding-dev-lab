"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/api";
import {
  MAX_SOURCE_LENGTH,
  utf8ByteLength,
  validateIngestInput,
  isIngestSuccess,
  ingestErrorMessage,
  type IngestResponse,
} from "@/lib/rag-import";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";

export default function RagImportPage() {
  const [source, setSource] = useState("tai-lieu");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bytes = utf8ByteLength(text);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setSuccess(false);
    setError(null);
    // Cho phép chọn lại đúng tệp vừa chọn (nếu không, sự kiện không bắn lại).
    e.target.value = "";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const validation = validateIngestInput(source, text);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/rag/ingest", {
        method: "POST",
        body: JSON.stringify({ source, text }),
      });
      const data = (await res.json().catch(() => null)) as IngestResponse | null;
      if (!isIngestSuccess(res.status, data)) {
        setError(ingestErrorMessage(res.status, data));
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Không kết nối được server admin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-900">
          <BookOpen className="size-6 text-emerald-600" />
          Tài liệu RAG
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Nhập tài liệu (.txt, .md) vào bot RAG. Bot dùng nội dung này để trả lời người học.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nhập tài liệu</CardTitle>
          <CardDescription>
            Tải tệp hoặc dán trực tiếp. Nguồn dùng làm nhãn để nhóm tài liệu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="source">Nguồn (source)</Label>
              <Input
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="tai-lieu"
                maxLength={MAX_SOURCE_LENGTH}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Tệp tài liệu</Label>
              <label
                htmlFor="file"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50/50"
              >
                <Upload className="size-4" />
                {fileName ? "Chọn tệp khác" : "Chọn .txt hoặc .md"}
              </label>
              <input
                id="file"
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={onPickFile}
                className="sr-only"
              />
              {fileName && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <FileText className="size-3.5" /> {fileName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="text">Nội dung</Label>
                <span className="font-mono text-[11px] tabular-nums text-slate-400">
                  {text.length.toLocaleString("vi-VN")} ký tự · {bytes.toLocaleString("vi-VN")} bytes
                </span>
              </div>
              <Textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={14}
                placeholder="Dán nội dung tài liệu ở đây..."
                className="font-mono text-xs"
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}

            {success && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle2 className="size-4" /> Đã nhập tài liệu vào bot RAG.
              </p>
            )}

            <Button type="submit" disabled={busy || !text.trim()} className="w-full sm:w-auto">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {busy ? "Đang nhập..." : "Nhập tài liệu"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
