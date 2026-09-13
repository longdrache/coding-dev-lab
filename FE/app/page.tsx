"use client";

import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import NavBar from "@/app/ui/Navbar";
import { ArrowRight, Terminal } from "lucide-react";
import { useState, useEffect } from "react";
import { codeLines } from "@/app/data/code";

export default function Home() {
  const { user } = useUser();
  const [visibleLines, setVisibleLines] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (visibleLines < codeLines.length) {
      const timer = setTimeout(() => {
        setVisibleLines((prev) => prev + 1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visibleLines]);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="mx-auto  px-6 pb-7 sm:px-6 lg:px-8">
        <SignedOut>
          {/* <nav className="flex items-center justify-between border-b border-[#f5f1e8]/20 pb-5 pt-4"> */}
          <NavBar />
          {/* <Link href="/" className="font-serif text-xl tracking-tight">
              coding<span className="text-[#d65a3a]">.</span>lab
            </Link>
            <div className="flex items-center gap-6 text-sm text-[#f5f1e8]/65">
              <Link href="/problem" className="transition hover:text-[#f5f1e8]">
                Problem Lab
              </Link>
              <Link href="/premium" className="transition hover:text-[#f5f1e8]">
                Premium
              </Link>
              <Link href="/vip" className="transition hover:text-[#f5f1e8]">
                Vip
              </Link> */}

          {/* </div> */}
          {/* </nav> */}
        </SignedOut>

        <SignedOut>
          <section className="relative grid min-h-[72vh] items-center gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative z-10 max-w-3xl">
              {/* Minimalist Top Eyebrow Tag */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100/90 border border-zinc-200/80 text-[11px] font-mono text-zinc-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Local Native Engine</span>
                  <span className="text-zinc-300">/</span>
                  <span>
                    TypeScript 3.7 • Python 3.8 • Go 1.23 • Swift 5.2•C#•C
                    C++•••{" "}
                  </span>
                </div>
              </div>
              <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
                <h1 className="text-4xl sm:text-5xl md:text-6xl  tracking-tight text-zinc-950 leading-[1.12] mb-6">
                  Rèn tư duy giải thuật.{" "}
                  <span className="block   font-normal text-zinc-500 text-3xl sm:text-4xl md:text-5xl mt-1">
                    Tối giản, thuần khiết &amp; tức thì.
                  </span>
                </h1>
                <p className="text-base sm:text-lg text-zinc-600 leading-relaxed max-w-2xl mx-auto">
                  Hệ thống chấm mã nguồn độc lập chạy trực tiếp trong vài
                  mili-giây. Tuyển chọn bài toán cấu trúc dữ liệu và giải thuật
                  cốt lõi, không rườm rà, tập trung 100% vào năng lực kỹ thuật.
                </p>
                <div
                  className="rise mt-8 px-25 flex items-center gap-5 font-mono text-[12px] text-ink-muted"
                  style={{ animationDelay: "0.36s" }}
                >
                  <span>
                    <span className="text-ink font-semibold">12.000+</span> học
                    viên
                  </span>
                  <span className="size-1 rounded-full bg-line"></span>
                  <span>
                    <span className="text-ink font-semibold">480</span> bài tập
                    chọn lọc
                  </span>
                  <span className="size-1 rounded-full bg-line"></span>
                  <span>
                    <span className="text-ink font-semibold">14</span> lộ trình
                    hướng dẫn
                  </span>
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full rounded-md bg-black max-w-md lg:justify-self-end">
              {/* Right: Code terminal */}

              <div
                className="relative animate-fade-up bg-ink-800/50"
                style={{ animationDelay: "0.3s", opacity: 1 }}
              >
                {/* <div className="absolute inset-0 bg-gradient-to-br from-accent-500/20 to-cyanx-500/20 rounded-2xl blur-3xl" /> */}
                <div className="relative glass-card overflow-hidden glow-border">
                  {/* Terminal header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-ink-800/50">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400/80" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                      <div className="w-3 h-3 rounded-full bg-green-400/80" />
                    </div>
                    <div className="flex items-center gap-2 ml-3 text-xs text-gray-500">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>solution.js</span>
                    </div>
                    <div className="ml-auto text-xs text-accent-400 font-mono">
                      ● Đang chạy
                    </div>
                  </div>

                  {/* Code area */}
                  <div className="p-5 font-mono text-sm leading-relaxed min-h-[320px]">
                    {codeLines.slice(0, visibleLines).map((line, i) => (
                      <div
                        key={i}
                        className="flex animate-fade-in"
                        style={{ animationDuration: "0.3s" }}
                      >
                        <span className="text-gray-600 select-none w-8 text-right pr-3 flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className={line.color}>
                          {line.text || "\u00A0"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Output bar */}
                  {visibleLines >= codeLines.length && (
                    <div
                      className="border-t border-white/5 bg-ink-800/50 px-5 py-3 animate-fade-in"
                      style={{ animationDelay: "0.5s", opacity: 1 }}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Output</span>
                        <span className="text-accent-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-accent-400 text-green animate-pulse" />
                          24 — Test passed
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </SignedOut>

        <SignedIn>
          <section className="-mx-6 min-h-screen bg-[#1b1b1b] px-6 pb-16 text-[#f0f0f0] sm:-mx-10 sm:px-10 lg:-mx-14 lg:px-14">
            <div className="mx-auto max-w-6xl">
              <nav className="flex items-center gap-7 border-b border-white/10 py-4 text-sm text-white/60">
                <Link
                  href="/"
                  className="text-2xl text-[#f5b900] transition hover:opacity-80"
                >
                  ◈
                </Link>
                <Link href="/problem" className="transition hover:text-white">
                  Problems
                </Link>
                <span className="hidden hover:text-white sm:inline">
                  Contest
                </span>
                <span className="hidden hover:text-white sm:inline">
                  Discuss
                </span>
                <span className="hidden hover:text-white sm:inline">
                  Interview
                </span>
                {user?.publicMetadata?.role !== "vip" && (
                  <Link
                    href="/premium"
                    className="font-medium text-[#f5b900] transition hover:brightness-125"
                  >
                    Premium
                  </Link>
                )}
                {user?.publicMetadata?.role === "vip" && (
                  <Link
                    href="/vip"
                    className="rounded border border-[#f5b900]/40 bg-[#f5b900]/10 px-2 py-0.5 text-xs font-semibold text-[#f5b900] transition hover:bg-[#f5b900]/20"
                  >
                    VIP
                  </Link>
                )}
                <div className="ml-auto flex items-center gap-4">
                  <span className="hidden text-xs text-white/40 md:inline">
                    {user?.firstName ?? "Coder"}&apos;s feed
                  </span>
                  <UserButton />
                </div>
              </nav>

              <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-6 border-b border-white/10 px-2 text-sm">
                    <span className="border-b-2 border-[#f5b900] py-4 text-white">
                      Feed
                    </span>
                    <span className="py-4 text-white/45">Following</span>
                  </div>

                  <div className="divide-y divide-white/10">
                    <article className="flex gap-4 py-7">
                      <div className="pt-1 text-2xl text-[#f5b900]">♛</div>
                      <div className="flex-1">
                        <p className="text-xs text-white/45">in 21 hours</p>
                        <p className="mt-2 text-sm">
                          Join our next Contest{" "}
                          <span className="text-[#2f9be8]">
                            Biweekly Contest 191
                          </span>
                        </p>
                      </div>
                    </article>
                    <article className="flex gap-4 py-7">
                      <div className="pt-1 text-2xl text-[#f5b900]">♛</div>
                      <div className="flex-1">
                        <p className="text-xs text-white/45">in a day</p>
                        <p className="mt-2 text-sm">
                          Join our next Contest{" "}
                          <span className="text-[#2f9be8]">
                            Weekly Contest 519
                          </span>
                        </p>
                      </div>
                    </article>
                    <article className="py-7">
                      <p className="text-xs text-white/45">25 days ago</p>
                      <p className="mt-2 text-sm">
                        <span className="text-[#2f9be8]">Coding Dev Lab</span>{" "}
                        posted{" "}
                        <span className="text-[#2f9be8]">
                          School&apos;s in.
                        </span>
                      </p>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">
                        Welcome back, {user?.firstName ?? "coder"}! Open the
                        problem lab and turn one idea into a working program.
                      </p>
                    </article>
                    <article className="py-7">
                      <p className="text-xs text-white/45">11 days ago</p>
                      <p className="mt-2 text-sm">
                        <span className="text-[#2f9be8]">Coding Dev Lab</span>{" "}
                        posted{" "}
                        <span className="text-[#2f9be8]">
                          Before Vibe Coding, Do You Frame the Problem First?
                        </span>
                      </p>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">
                        In the AI era, the advantage is knowing what to ask,
                        what to challenge, and what to trust.
                      </p>
                    </article>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="h-36 bg-linear-to-br from-[#262626] via-[#42351b] to-[#f5b900] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/60">
                      Coding Dev Lab
                    </p>
                    <p className="mt-5 max-w-37.5 text-2xl font-bold leading-none">
                      Build your next habit.
                    </p>
                  </div>
                  <div className="h-36 bg-linear-to-br from-[#32246b] to-[#a53cff] p-5">
                    <p className="text-lg font-bold">Problem Lab</p>
                    <p className="mt-3 text-sm text-white/75">
                      Practice data structures and algorithms.
                    </p>
                    <Link
                      href="/problem"
                      className="mt-4 inline-block bg-white px-3 py-2 text-xs font-bold text-[#32246b]"
                    >
                      Start solving
                    </Link>
                  </div>
                  <div className="border-t border-white/10 pt-5">
                    <p className="font-semibold">Coding Dev Lab Contest</p>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      Participate, run code, and sharpen your solutions.
                    </p>
                    <Link
                      href="/problem"
                      className="mt-4 inline-block bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
                    >
                      Join practice
                    </Link>
                  </div>
                  <div className="border-t border-white/10 pt-5">
                    <p className="font-semibold">Discuss Now</p>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      Share questions, approaches, and solutions.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </SignedIn>

        <SignedOut>
          <section className="grid gap-8 border-t border-[#f5f1e8]/20 py-10 text-sm sm:grid-cols-3">
            <div>
              <p className="mb-2 font-mono text-[#d65a3a]">01</p>
              <h2 className="mb-2 font-semibold">Start without friction</h2>
              <p className="text-[#f5f1e8]/50">
                Open a problem and begin in seconds.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-[#d65a3a]">02</p>
              <h2 className="mb-2 font-semibold">Run on demand</h2>
              <p className="text-[#f5f1e8]/50">
                Execute code against Judge0 and see the result.
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-[#d65a3a]">03</p>
              <h2 className="mb-2 font-semibold">Keep learning</h2>
              <p className="text-[#f5f1e8]/50">
                Use each run to make the next idea sharper.
              </p>
            </div>
          </section>
        </SignedOut>
      </div>
    </main>
  );
}
