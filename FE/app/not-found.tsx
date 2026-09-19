"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function NotFound() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [typed, setTyped] = useState("");
  const fullText = "> trace /requested/page ... FAILED\n> error.code: 404_NOT_FOUND\n> intrusion detection: page does not exist\n> hint: system will redirect you to safe zone";

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      setTyped(fullText.slice(0, i + 1));
      i++;
      if (i >= fullText.length) clearInterval(t);
    }, 18);
    return () => clearInterval(t);
  }, []);

  // matrix rain
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const cols = Math.floor(w / 14);
    const drops = Array(cols).fill(1);
    const chars = "01G0C0DE404X$#%¥HACKER";

    let raf = 0;
    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#00ff41";
      ctx.font = "14px monospace";
      drops.forEach((y, i) => {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 14, y * 14);
        if (y * 14 > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      });
      raf = requestAnimationFrame(() => setTimeout(draw, 45));
    };
    draw();
    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 py-12 font-mono text-[#00ff41]">
      {/* matrix canvas */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 opacity-[0.18]" />

      {/* scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, #00ff41 3px)",
        }}
      />
      {/* vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.75)_100%)]" />

      <section className="relative z-10 w-full max-w-3xl">
        {/* top bar */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[11px] tracking-widest">
          <span className="border border-[#00ff41]/40 bg-[#00ff41]/10 px-2 py-1 text-[#00ff41]">SYSTEM // BREACH_DETECTED</span>
          <span className="border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-400 animate-pulse">ERR_404</span>
          <span className="ml-auto hidden text-[#00ff41]/50 sm:inline">[ GoCode Security Node v3.7 ]</span>
        </div>

        {/* glitch 404 */}
        <div className="relative select-none">
          <h1 className="text-center text-[92px] font-black leading-none tracking-[-0.06em] sm:text-[148px]">
            <span className="relative inline-block text-white">
              404
              <span
                aria-hidden
                className="absolute inset-0 text-[#00ff41] opacity-70"
                style={{ clipPath: "polygon(0 2%, 100% 2%, 100% 42%, 0 42%)", transform: "translate(2px,0)" }}
              >
                404
              </span>
              <span
                aria-hidden
                className="absolute inset-0 text-red-500 opacity-60"
                style={{ clipPath: "polygon(0 60%, 100% 60%, 100% 100%, 0 100%)", transform: "translate(-2px,0)" }}
              >
                404
              </span>
            </span>
          </h1>
          <p className="mt-1 text-center text-sm font-bold tracking-[0.35em] text-[#00ff41]/80">PAGE_NOT_FOUND // ACCESS_DENIED</p>
        </div>

        {/* terminal */}
        <div className="mt-8 overflow-hidden rounded-xl border border-[#00ff41]/20 bg-black/70 backdrop-blur shadow-[0_0_40px_rgba(0,255,65,0.15)]">
          <div className="flex items-center gap-2 border-b border-[#00ff41]/10 bg-[#00ff41]/[0.06] px-4 py-2.5">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-red-500/80" />
              <span className="size-2.5 rounded-full bg-yellow-500/80" />
              <span className="size-2.5 rounded-full bg-[#00ff41]" />
            </span>
            <span className="ml-2 text-xs tracking-widest text-[#00ff41]/60">root@gocode:~ — trace</span>
            <span className="ml-auto text-xs text-[#00ff41]/40">[● REC]</span>
          </div>
          <div className="px-5 py-5">
            <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-[#00ff41] sm:text-sm">
              {typed}
              <span className="ml-1 inline-block h-4 w-2 -translate-y-0.5 bg-[#00ff41] align-middle animate-pulse" />
            </pre>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#00ff41]/10 pt-4 text-xs">
              <span className="text-[#00ff41]/50">PATH:</span>
              <span className="text-white">/requested/page</span>
              <span className="text-[#00ff41]/50">STATUS:</span>
              <span className="text-red-400">404 // NULL_PTR</span>
              <span className="text-[#00ff41]/50">NODE:</span>
              <span className="text-[#00ff41]">GoCode::Judge0</span>
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="group inline-flex w-full items-center justify-center gap-2 border border-[#00ff41] bg-[#00ff41] px-6 py-3 text-sm font-bold tracking-widest text-black transition hover:bg-[#00ff41]/90 sm:w-auto"
          >
            <span>{"<"} RETURN_TO_BASE</span>
            <span className="transition group-hover:translate-x-1">_</span>
          </Link>
          <Link
            href="/problem"
            className="inline-flex w-full items-center justify-center gap-2 border border-[#00ff41]/30 bg-transparent px-6 py-3 text-sm font-bold tracking-widest text-[#00ff41] transition hover:border-[#00ff41] hover:bg-[#00ff41]/10 sm:w-auto"
          >
            ENTER_LAB // problem
          </Link>
          <Link
            href="/qna"
            className="inline-flex w-full items-center justify-center gap-2 border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold tracking-widest text-white/70 transition hover:border-white/20 hover:text-white sm:w-auto"
          >
            HELP_SIG
          </Link>
        </div>

        <p className="mt-8 text-center text-[11px] tracking-widest text-[#00ff41]/30">
          If you believe this is a system error, contact <span className="text-[#00ff41]/60">support@gocode.lab</span> — incident logged.
        </p>
      </section>
    </main>
  );
}
