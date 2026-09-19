"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton, useAuth, useUser } from "@clerk/nextjs";
import NavBar from "@/app/ui/Navbar";
import { ArrowRight, Terminal, Crown } from "lucide-react";
import { useState, useEffect } from "react";
import { codeLines } from "@/app/data/code";
import { recordLogin } from "@/app/problem/activity";
import FeatureCard from "./ui/FeatureCard";
import OnlineCounter from "./ui/OnlineCounter";
import Reveal from "./ui/Reveal";
import TopicCard from "./ui/TopicCard";
import Logo from "./ui/Logo";
import StatsStrip from "./ui/StatsStrip";
import FaqTeaser from "./ui/FaqTeaser";
import FinalCta from "./ui/FinalCta";
import { topics } from "@/app/data/topics";
import SectionLink from "./ui/SectionLink";
import StreakDashboard from "./ui/StreakDashboard";
export default function Home() {
  const { user, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (isSignedIn) recordLogin(getToken);
  }, [isSignedIn, getToken]);
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
                <div className="ml-auto flex items-center gap-3">
                  <OnlineCounter />
                  {user?.publicMetadata?.role === "vip" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm shadow-amber-500/20">
                      <Crown className="size-3.5 fill-white text-white" />
                      VIP
                    </span>
                  ) : null}
                  <span className="hidden text-xs text-zinc-400 md:inline">
                    Xin chào, {user?.firstName ?? "Coder"}!
                  </span>
                  <div className="relative">
                    <div className={user?.publicMetadata?.role === "vip" ? "rounded-full p-[2px] bg-gradient-to-r from-amber-400 to-orange-500 shadow-sm" : ""}>
                      <UserButton
                        appearance={{
                          elements: {
                            avatarBox: user?.publicMetadata?.role === "vip" ? "ring-2 ring-white" : "",
                          },
                        }}
                      />
                    </div>
                    {user?.publicMetadata?.role === "vip" && (
                      <span className="pointer-events-none absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow ring-2 ring-white">
                        <Crown className="size-3 fill-white" />
                      </span>
                    )}
                  </div>
                </div>
              </nav>

              <div className="py-6">
                <StreakDashboard />
              </div>
            </div>
          </section>
        </SignedIn>
      </div>
    </main>
  );
}
