"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { useSession } from "@/app/ui/AuthProvider";
import { withTurn, type ChatTurn } from "@/app/problem/assistant";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function ProblemAssistant({ slug }: { slug: string }) {
  const { user, loading } = useSession();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history, busy]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500">
        Đăng nhập để hỏi trợ lý AI về bài này.
      </div>
    );
  }

  async function send() {
    const message = input.trim();
    if (!message || busy) return;

    const previous = history;
    const nextHistory = withTurn(history, { role: "user", content: message });

    setError(null);
    setInput("");
    setHistory(nextHistory);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/rag/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: previous, problemSlug: slug }),
      });
      const data = (await res.json().catch(() => null)) as {
        answer?: string;
        message?: string;
      } | null;

      if (!res.ok || !data?.answer) {
        setHistory(previous);
        if (res.status === 401) setError("Phiên đã hết hạn, hãy đăng nhập lại.");
        else if (res.status === 429) setError("Bạn hỏi hơi nhanh, thử lại sau một phút.");
        else if (res.status >= 500) setError("Trợ lý đang bận, thử lại sau.");
        else setError(data?.message ?? "Trợ lý đang bận, thử lại sau.");
        return;
      }

      setHistory((prev) => withTurn(prev, { role: "assistant", content: data.answer as string }));
    } catch {
      setHistory(previous);
      setError("Không kết nối được trợ lý.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Bot className="size-4 text-emerald-600" /> Trợ lý AI
        </span>
        <span className="text-xs text-zinc-500">
          {open ? "Thu gọn" : "Hỏi về bài này"}
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-200 p-3">
          <div ref={scrollRef} className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {history.length === 0 && (
              <p className="text-xs text-zinc-500">
                Hỏi về hướng làm, độ phức tạp, hoặc lỗi bạn đang gặp.
              </p>
            )}
            {history.map((turn, index) => (
              <div key={index} className={turn.role === "user" ? "text-right" : ""}>
                <p
                  className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    turn.role === "user"
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-800"
                  }`}
                >
                  {turn.content}
                </p>
              </div>
            ))}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="size-3.5 animate-spin" /> Đang trả lời...
              </p>
            )}
          </div>

          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

          <div className="mt-2 flex gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              disabled={busy}
              rows={2}
              maxLength={2000}
              placeholder="Nhập câu hỏi..."
              className="min-h-[42px] flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              aria-label="Gửi câu hỏi"
              className="self-end rounded-lg bg-emerald-600 px-3 py-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
