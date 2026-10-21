"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Send, X } from "lucide-react";
import { useSession } from "@/app/ui/AuthProvider";
import { withTurn, type ChatTurn } from "@/app/problem/assistant";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const SUGGESTIONS = [
  "Gợi ý hướng làm cho bài này",
  "Độ phức tạp mong đợi là bao nhiêu?",
  "Vì sao code của mình bị lỗi?",
];

export function ProblemAssistant({
  problemTitle,
  language,
}: { problemTitle: string; language: string }) {
  const { user, loading } = useSession();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history, busy, open, streaming]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, user]);

  if (loading) return null;

  const displayName = user?.name ?? user?.email ?? "Bạn";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  async function send() {
    const message = input.trim();
    if (!message || busy || !user) return;

    if (streaming && draft) {
      setHistory((prev) => withTurn(prev, { role: "assistant", content: draft }));
      setDraft("");
      setStreaming(false);
    }

    const previous = history;
    const nextHistory = withTurn(history, { role: "user", content: message });

    setError(null);
    setInput("");
    setHistory(nextHistory);
    setBusy(true);
    setStreaming(true);
    setDraft("");
    try {
      const res = await fetch(`${API_URL}/api/rag/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: previous,
          context: { problem: problemTitle, language },
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        answer?: string;
        message?: string;
      } | null;

      if (!res.ok || !data?.answer) {
        setStreaming(false);
        setHistory(previous);
        if (res.status === 401) setError("Phiên đã hết hạn, hãy đăng nhập lại.");
        else if (res.status === 429) setError("Bạn hỏi hơi nhanh, thử lại sau một phút.");
        else if (res.status >= 500) setError("Trợ lý đang bận, thử lại sau.");
        else setError(data?.message ?? "Trợ lý đang bận, thử lại sau.");
        return;
      }

      const answer = data.answer as string;
      let i = 0;
      while (i < answer.length) {
        setDraft((d) => d + answer[i]);
        i += 1;
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      setHistory((prev) => withTurn(prev, { role: "assistant", content: answer }));
      setDraft("");
      setStreaming(false);
    } catch {
      setStreaming(false);
      setHistory(previous);
      setError("Không kết nối được trợ lý.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700"
      >
        <Bot className="size-4" />
        Trợ lý AI
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-zinc-950/40 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Trợ lý AI"
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-zinc-200 bg-white shadow-2xl sm:w-[420px]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                  <Bot className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Trợ lý AI</p>
                  <p className="text-xs text-zinc-500">Hỏi về bài này</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng trợ lý"
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X className="size-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {!user ? (
                <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600">
                  Đăng nhập để hỏi trợ lý AI về bài này.{" "}
                  <Link href="/sign-in" className="font-semibold text-emerald-700 hover:underline">
                    Đăng nhập
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                      <Bot className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold text-zinc-700">Trợ lý</p>
                      <p className="inline-block max-w-full whitespace-pre-wrap break-words rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                        Chào bạn, mình có thể gợi ý hướng làm, độ phức tạp hoặc giúp tìm lỗi trong code.
                      </p>
                      {history.length === 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {SUGGESTIONS.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => {
                                setInput(suggestion);
                                inputRef.current?.focus();
                              }}
                              className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {streaming && draft && (
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                        <Bot className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="mb-1 text-xs font-semibold text-zinc-700">Trợ lý</p>
                        <p className="inline-block max-w-full whitespace-pre-wrap break-words rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                          {draft}<span className="animate-pulse font-mono text-xs">…</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {history.map((turn, index) =>
                    turn.role === "user" ? (
                      <div key={index} className="flex items-start justify-end gap-2">
                        <div className="min-w-0 text-right">
                          <p className="mb-1 text-xs font-semibold text-zinc-700">{displayName}</p>
                          <p className="inline-block max-w-full whitespace-pre-wrap break-words rounded-xl bg-zinc-900 px-3 py-2 text-left text-sm text-white">
                            {turn.content}
                          </p>
                        </div>
                        <span
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 bg-cover bg-center text-xs font-semibold text-zinc-700"
                          style={
                            user.avatarUrl
                              ? { backgroundImage: `url("${user.avatarUrl}")` }
                              : undefined
                          }
                        >
                          {user.avatarUrl ? null : initial}
                        </span>
                      </div>
                    ) : (
                      <div key={index} className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                          <Bot className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="mb-1 text-xs font-semibold text-zinc-700">Trợ lý</p>
                          <p className="inline-block max-w-full whitespace-pre-wrap break-words rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                            {turn.content}
                          </p>
                        </div>
                      </div>
                    ),
                  )}

                  {!streaming && busy && (
                    <p className="flex items-center gap-2 pl-10 text-xs text-zinc-500">
                      Đang nghĩ<span className="animate-pulse font-mono text-xs">…</span>
                    </p>
                  )}

                  {error && (
                    <p role="alert" className="pl-10 text-xs text-rose-600">
                      {error}
                    </p>
                  )}
                </>
              )}
            </div>

            {user && (
              <div className="border-t border-zinc-200 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
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
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy || streaming ? <span className="animate-pulse font-mono text-xs">…</span> : <Send className="size-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  Enter để gửi · Shift+Enter để xuống dòng
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
