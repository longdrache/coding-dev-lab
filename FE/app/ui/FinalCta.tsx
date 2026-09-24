"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Reveal from "./Reveal";

export default function FinalCta() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-14 text-center sm:px-12">
          {/* Glow blobs trôi chậm */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-emerald-500/20 blur-3xl"
            animate={{ x: [0, 40, 0], y: [0, 24, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-24 size-72 rounded-full bg-violet-500/20 blur-3xl"
            animate={{ x: [0, -36, 0], y: [0, -20, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />

          <h2 className="relative mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Sẵn sàng rèn tư duy giải thuật?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-zinc-400">
            Tham gia GoCode miễn phí — mở bài tập đầu tiên và thấy code của
            bạn chạy trong vài mili-giây.
          </p>

          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="inline-flex w-full sm:w-auto">
              <Link
                href="/sign-up"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] sm:w-auto"
              >
                Bắt đầu miễn phí
                <ArrowRight className="size-4" />
              </Link>
            </motion.span>
            <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="inline-flex w-full sm:w-auto">
              <Link
                href="/problem"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98] sm:w-auto"
              >
                Thử sân luyện
              </Link>
            </motion.span>
          </div>

          <p className="relative mt-5 font-mono text-[11px] text-zinc-500">
            Miễn phí 100% • Không cần thẻ tín dụng
          </p>
        </div>
      </Reveal>
    </section>
  );
}
