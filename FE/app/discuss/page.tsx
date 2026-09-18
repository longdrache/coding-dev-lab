"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Eye, MessageSquareText, Search } from "lucide-react";
import {
  DISCUSSION_CATEGORIES,
  discussions,
} from "@/app/data/discussions";
import Logo from "@/app/ui/Logo";

export default function DiscussPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] =
    useState<(typeof DISCUSSION_CATEGORIES)[number]>("Tất cả");
  const [openId, setOpenId] = useState<string | null>(discussions[0]?.id ?? null);

  const filtered = discussions.filter((thread) => {
    const matchQuery =
      query.trim() === "" ||
      thread.title.toLowerCase().includes(query.trim().toLowerCase()) ||
      thread.excerpt.toLowerCase().includes(query.trim().toLowerCase());
    const matchCategory =
      category === "Tất cả" || thread.category === category;
    return matchQuery && matchCategory;
  });

  return (
    <main className="min-h-screen bg-white px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5">
          <Logo />
        </div>
        <header className="mb-8">
          <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-600">
            Discuss
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
            Thảo luận cùng cộng đồng
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Hỏi cách tiếp cận, chia sẻ kinh nghiệm phỏng vấn và học hỏi từ
            những người đi trước. Bấm vào một chủ đề để xem trao đổi.
          </p>
        </header>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative block sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm chủ đề..."
              className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-500"
            />
          </label>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {DISCUSSION_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                category === item
                  ? "bg-zinc-950 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-16 text-center">
            <p className="font-semibold text-zinc-900">Chưa có chủ đề nào</p>
            <p className="mt-2 text-sm text-zinc-500">
              Thử từ khóa khác hoặc chọn lại chuyên mục.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80 rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            {filtered.map((thread) => {
              const open = openId === thread.id;
              return (
                <div key={thread.id} className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : thread.id)}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-zinc-950/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
                          {thread.category}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          {thread.author} • {thread.timeAgo}
                        </span>
                      </span>
                      <span className="mt-1.5 block text-[15px] font-semibold text-zinc-900">
                        {thread.title}
                      </span>
                      <span className="mt-1.5 flex items-center gap-4 font-mono text-[11px] text-zinc-400">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquareText className="size-3.5" />
                          {thread.replies} trả lời
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5" />
                          {thread.views} lượt xem
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      className={`mt-1 size-4 shrink-0 text-zinc-400 transition-transform duration-300 ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      open
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="pt-3 text-sm leading-relaxed text-zinc-600">
                        {thread.excerpt}
                      </p>
                      <div className="mt-3 space-y-2.5 border-t border-zinc-100 pt-3">
                        {thread.topReplies.map((reply, i) => (
                          <div
                            key={i}
                            className="rounded-xl bg-zinc-50 px-4 py-3"
                          >
                            <p className="font-mono text-[11px] text-zinc-400">
                              {reply.author} • {reply.timeAgo}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-zinc-700">
                              {reply.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-sm text-zinc-500">
          Muốn trao đổi sâu hơn?{" "}
          <Link
            href="/problem"
            className="font-medium text-emerald-600 hover:text-emerald-700"
          >
            Giải một bài rồi quay lại bàn luận →
          </Link>
        </p>
      </div>
    </main>
  );
}
