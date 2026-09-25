"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Logo from "./ui/Logo";
import HeroScene from "./ui/HeroScene";
import { useProblems } from "./hooks/useProblems";

export default function NotFound() {

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-wash px-6 py-12">
      {/* Nền 3D nhẹ + lưới mờ kiểu trang tri thức */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <HeroScene className="h-full w-full opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_45%,rgba(255,255,255,0.9),rgba(255,255,255,0.4)_60%,transparent)]" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-2xl text-center"
      >
        <div className="flex justify-center">
          <Logo />
        </div>

        <p className="mt-10 font-mono text-xs font-medium tracking-widest text-emerald-600">
          {"// lỗi 404 — không tìm thấy trang"}
        </p>
        <h1 className="mt-4 font-display text-[96px] font-black leading-none tracking-tight text-zinc-950 sm:text-[150px]">
          4<span className="text-emerald-500">0</span>4
        </h1>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
          Trang này không có trong thư viện GoCode
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
          Có thể đường dẫn đã đổi hoặc bạn gõ nhầm. Trong lúc này, hãy chọn một
          bài dưới đây để luyện tiếp — đừng để streak đứt.
        </p>

       

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
          >
            <ArrowLeft className="size-4" />
            Về trang chủ
          </Link>
          <Link
            href="/problem"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 hover:bg-zinc-50 sm:w-auto"
          >
            Vào sân luyện
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </motion.section>
    </main>
  );
}
