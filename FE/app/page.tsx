"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton, useUser } from "@clerk/nextjs";
import NavBar from "@/app/ui/Navbar";
import { ArrowRight, Code2, Flame, MessagesSquare, Terminal, Trophy } from "lucide-react";
import { useState, useEffect } from "react";
import { codeLines } from "@/app/data/code";
import FeatureCard from "./ui/FeatureCard";
import OnlineCounter from "./ui/OnlineCounter";
import Reveal from "./ui/Reveal";
import TopicCard from "./ui/TopicCard";
import Logo from "./ui/Logo";
import StatsStrip from "./ui/StatsStrip";
import FaqTeaser from "./ui/FaqTeaser";
import FinalCta from "./ui/FinalCta";
import { topics } from "@/app/data/topics";
import { problems } from "@/app/data/problems";
import { discussions } from "@/app/data/discussions";
import {
  CONTEST_CADENCE_LABEL,
  upcomingContest,
} from "@/app/data/contests";
import SectionLink from "./ui/SectionLink";
export default function Home() {
  const { user } = useUser();
  const [visibleLines, setVisibleLines] = useState(0);
  useEffect(() => {
    if (visibleLines < codeLines.length) {
      const timer = setTimeout(() => {
        setVisibleLines((prev) => prev + 1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visibleLines]);

  useEffect(() => {
    // Tự cuộn tới anchor khi vào thẳng URL có hash (ví dụ bấm "Dạng bài"
    // từ Footer ở trang khác). Trì hoãn một tick để nội dung SignedOut
    // kịp hydrate rồi mới cuộn.
    if (typeof window === "undefined" || !window.location.hash) return;
    const selector = window.location.hash;
    const timer = window.setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
    }, 150);
    return () => window.clearTimeout(timer);
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
                    TypeScript 3.7 • Python 3.8 • Go 1.23 • Swift 5.2 • C++ (GCC
                    9.2.0)
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
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/sign-up"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] sm:w-auto"
                  >
                    Bắt đầu miễn phí
                    <ArrowRight className="size-4" />
                  </Link>
                  <SectionLink
                    id="topics-button"
                    targetId="topics"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] sm:w-auto"
                  >
                    Xem dạng bài
                  </SectionLink>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 font-mono text-[12px] text-zinc-500">
                  <span>Miễn phí 100%</span>
                  <span className="size-1 rounded-full bg-zinc-300" />
                  <span>Mới ra mắt</span>
                  <span className="size-1 rounded-full bg-zinc-300" />
                  <span>Cập nhật liên tục</span>
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full rounded-md bg-black max-w-md lg:justify-self-end">
              {/* Right: Code terminal */}

              <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-backwards">
                <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-zinc-950/25 ring-1 ring-white/10">
                  {/* Terminal header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.03]">
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
                        className="flex animate-in fade-in duration-300"
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
                    <div className="border-t border-white/5 bg-white/[0.03] px-5 py-3 animate-in fade-in duration-500 delay-500 fill-mode-backwards">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Output</span>
                        <span className="text-accent-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
                          24 — Test passed
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
          <StatsStrip />
          <section
            id="features"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16"
          >
            <Reveal className="text-center mb-12">
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
                Tại sao GoCode?
              </h2>
              <p className="mt-3 text-zinc-500">
                Mọi thứ bạn cần để rèn luyện kỹ năng lập trình
              </p>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Reveal delay={0}>
                <FeatureCard
                  icon="Code2"
                  accent="emerald"
                  index="01"
                  title="Trình soạn thảo tích hợp"
                  description="Viết code ngay trên trình duyệt với editor hỗ trợ tô sáng cú pháp, đánh số dòng, tự động thụt lề và phím tắt."
                />
              </Reveal>
              <Reveal delay={120}>
                <FeatureCard
                  icon="Brain"
                  accent="violet"
                  index="02"
                  title="Kiểm thử tự động"
                  description="Chạy code và nhận kết quả ngay lập tức. So sánh output kỳ vọng với kết quả thực tế từng test case, kèm thời gian chạy."
                />
              </Reveal>
              <Reveal delay={240}>
                <FeatureCard
                  icon="Trophy"
                  accent="amber"
                  index="03"
                  title="Theo dõi tiến độ"
                  description="Tích lũy điểm số, mở khóa thành tựu, và theo dõi tiến độ qua biểu đồ trực quan theo độ khó và chủ đề."
                />
              </Reveal>
            </div>
          </section>
          <section
            id="topics"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 scroll-mt-20"
          >
            <Reveal className="text-center mb-10">
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
                Các dạng bài luyện tập
              </h2>
              <p className="mt-3 text-zinc-500">
                Chọn một chủ đề và bắt đầu giải ngay trong sân luyện
              </p>
            </Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {topics.map((topic, i) => (
                <Reveal key={topic.slug} delay={(i % 4) * 90}>
                  <TopicCard topic={topic} />
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8 text-center" delay={100}>
              <Link
                href="/problem"
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Vào sân luyện ngay
                <span aria-hidden>→</span>
              </Link>
            </Reveal>
          </section>
          <FaqTeaser />
          <FinalCta />
        </SignedOut>

        <SignedIn>
          <section className="pb-16 text-zinc-900">
            <div className="mx-auto max-w-6xl">
              <nav className="flex items-center gap-7 border-b border-zinc-200/80 py-4 text-sm text-zinc-600">
                <Logo />
                <Link href="/problem" className="transition hover:text-zinc-950">
                  Bài tập
                </Link>
                <Link
                  href="/contest"
                  className="hidden transition hover:text-zinc-950 sm:inline"
                >
                  Cuộc thi
                </Link>
                <Link
                  href="/discuss"
                  className="hidden transition hover:text-zinc-950 sm:inline"
                >
                  Thảo luận
                </Link>
                <Link
                  href="/qna"
                  className="hidden transition hover:text-zinc-950 sm:inline"
                >
                  Hỏi đáp
                </Link>
                {user?.publicMetadata?.role !== "vip" && (
                  <Link
                    href="/premium"
                    className="font-medium text-amber-600 transition hover:text-amber-700"
                  >
                    Premium
                  </Link>
                )}
                {user?.publicMetadata?.role === "vip" && (
                  <Link
                    href="/vip"
                    className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                  >
                    VIP
                  </Link>
                )}
                <div className="ml-auto flex items-center gap-4">
                  <OnlineCounter />
                  <span className="hidden text-xs text-zinc-400 md:inline">
                    {user?.firstName ?? "Coder"}&apos;s feed
                  </span>
                  <UserButton />
                </div>
              </nav>

              <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50 p-6">
                    <p className="text-xs text-zinc-500">
                      Chào mừng trở lại{user?.firstName ? `, ${user.firstName}` : ""}!
                    </p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950">
                      Hôm nay giải thêm một bài nhé.
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                      Mở problem lab, chọn một dạng bài hợp trình độ và biến
                      ý tưởng thành chương trình chạy được.
                    </p>
                    <Link
                      href="/problem"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
                    >
                      Tiếp tục luyện tập
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                      <p className="text-xl font-bold text-zinc-950 tabular-nums">
                        {problems.length}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">Bài tập</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                      <p className="text-xl font-bold text-zinc-950 tabular-nums">
                        {topics.length}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">Dạng bài</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                      <p className="text-xl font-bold text-zinc-950 tabular-nums">
                        5
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">Ngôn ngữ</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                      <p className="text-xl font-bold text-zinc-950 tabular-nums">
                        {discussions.length}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">Thảo luận</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-zinc-900">
                        Gợi ý cho bạn
                      </h3>
                      <Link
                        href="/problem"
                        className="text-xs text-zinc-500 transition hover:text-zinc-900"
                      >
                        Xem tất cả →
                      </Link>
                    </div>
                    <div className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                      {problems
                        .filter((problem) => problem.difficulty === "Dễ")
                        .slice(0, 3)
                        .map((problem) => (
                          <Link
                            key={problem.slug}
                            href={`/problem/${problem.slug}`}
                            className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-zinc-50"
                          >
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              {problem.difficulty}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">
                              {problem.title}
                            </span>
                            <ArrowRight className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                          </Link>
                        ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-zinc-900">
                        Đang bàn luận
                      </h3>
                      <Link
                        href="/discuss"
                        className="text-xs text-zinc-500 transition hover:text-zinc-900"
                      >
                        Vào thảo luận →
                      </Link>
                    </div>
                    <div className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                      {discussions.slice(0, 3).map((thread) => (
                        <Link
                          key={thread.id}
                          href="/discuss"
                          className="group block px-4 py-3.5 transition hover:bg-zinc-50"
                        >
                          <p className="truncate text-sm text-zinc-900">
                            {thread.title}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-zinc-400">
                            {thread.category} • {thread.replies} trả lời •{" "}
                            {thread.timeAgo}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-5 text-white shadow-lg shadow-emerald-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/25">
                    <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-white/15 blur-2xl" />
                    <div className="relative flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                      <Flame className="size-5" />
                    </div>
                    <p className="relative mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
                      Thói quen
                    </p>
                    <p className="relative mt-1 text-lg font-bold leading-snug">
                      Mỗi ngày một bài.
                    </p>
                    <p className="relative mt-1.5 text-[13px] leading-relaxed text-white/75">
                      Chuỗi luyện tập đều đặn giúp tiến bộ nhanh nhất.
                    </p>
                    <Link
                      href="/problem"
                      className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-xs font-bold ring-1 ring-white/25 transition hover:bg-white/25"
                    >
                      Giải bài hôm nay
                      <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 p-5 text-white shadow-lg shadow-violet-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/25">
                    <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-white/15 blur-2xl" />
                    <div className="relative flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                      <Code2 className="size-5" />
                    </div>
                    <p className="relative mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
                      Problem Lab
                    </p>
                    <p className="relative mt-1 text-lg font-bold leading-snug">
                      {problems.length} bài chấm tự động.
                    </p>
                    <p className="relative mt-1.5 text-[13px] leading-relaxed text-white/75">
                      Từ Dễ đến Trung bình, chạy code và xem kết quả ngay.
                    </p>
                    <Link
                      href="/problem"
                      className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-xs font-bold ring-1 ring-white/25 transition hover:bg-white/25"
                    >
                      Bắt đầu giải
                      <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-lg shadow-amber-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/25">
                    <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-white/15 blur-2xl" />
                    <div className="relative flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                      <Trophy className="size-5" />
                    </div>
                    <p className="relative mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
                      {upcomingContest.title}
                    </p>
                    <p className="relative mt-1 text-lg font-bold leading-snug">
                      Thi đấu mỗi Chủ nhật.
                    </p>
                    <p className="relative mt-1.5 text-[13px] leading-relaxed text-white/75">
                      {CONTEST_CADENCE_LABEL} • {upcomingContest.durationLabel}.
                    </p>
                    <Link
                      href="/contest"
                      className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-xs font-bold ring-1 ring-white/25 transition hover:bg-white/25"
                    >
                      Xem cuộc thi
                      <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 p-5 text-white shadow-lg shadow-sky-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-sky-500/25">
                    <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-white/15 blur-2xl" />
                    <div className="relative flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                      <MessagesSquare className="size-5" />
                    </div>
                    <p className="relative mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
                      Cộng đồng
                    </p>
                    <p className="relative mt-1 text-lg font-bold leading-snug">
                      Cùng nhau gỡ bí.
                    </p>
                    <p className="relative mt-1.5 text-[13px] leading-relaxed text-white/75">
                      Hỏi cách tiếp cận, chia sẻ kinh nghiệm cùng mọi người.
                    </p>
                    <Link
                      href="/discuss"
                      className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-xs font-bold ring-1 ring-white/25 transition hover:bg-white/25"
                    >
                      Vào thảo luận
                      <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </SignedIn>
      </div>
    </main>
  );
}
