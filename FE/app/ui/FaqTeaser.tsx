"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { EXTENDED_FAQS } from "@/app/data/faq";
import Reveal from "./Reveal";

// Chỉ chọn các câu không dính số liệu/phiên bản đang xung đột (f2, f8)
// và không nhắc brand cũ (f4, f6).
const TEASER_IDS = ["f1", "f3", "f5", "f9"];

export default function FaqTeaser() {
  const [openId, setOpenId] = useState<string | null>("f1");
  const faqs = EXTENDED_FAQS.filter((faq) => TEASER_IDS.includes(faq.id));

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Reveal className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
          Câu hỏi thường gặp
        </h2>
        <p className="mt-3 text-zinc-500">
          Những điều bạn cần biết trước khi bắt đầu luyện tập
        </p>
      </Reveal>

      <Reveal delay={100}>
        <div className="divide-y divide-zinc-200/80 rounded-2xl border border-zinc-200/80 bg-white px-6 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          {faqs.map((faq) => {
            const open = openId === faq.id;
            return (
              <div key={faq.id} className="py-5">
                <button
                  onClick={() => setOpenId(open ? null : faq.id)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span className="text-[15px] font-semibold text-zinc-900">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-zinc-400 transition-transform duration-300 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="pt-3 text-sm leading-relaxed text-zinc-500">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>

      <Reveal className="mt-6 text-center" delay={100}>
        <Link
          href="/qna"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 transition hover:text-emerald-700"
        >
          Xem tất cả câu hỏi
          <ArrowRight className="size-4" />
        </Link>
      </Reveal>
    </section>
  );
}
