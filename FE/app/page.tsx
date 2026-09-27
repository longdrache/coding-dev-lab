"use client";

import Link from "next/link";
import NavBar from "@/app/ui/Navbar";
import { ArrowRight, Terminal, Crown, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { codeLines } from "@/app/data/code";
import { recordLogin } from "@/app/problem/activity";
import { signOut } from "@/lib/api";
import { useSession } from "./ui/AuthProvider";
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
import HeroScene from "./ui/HeroScene";
import PageLoader from "./ui/PageLoader";
import HeroScrollFx from "./ui/HeroScrollFx";
import TechMarquee from "./ui/TechMarquee";
import { motion, type Variants, useMotionValue, useSpring } from "framer-motion";

const copyContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const copyItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};
export default function Home() {
  const { user, loading: sessionLoading, refresh } = useSession();
  const isSignedIn = user !== null;
  const [signOutError, setSignOutError] = useState("");
  const [visibleLines, setVisibleLines] = useState(0);
  const [mounted, setMounted] = useState(false);
  // Giữ loader tối thiểu 1.5s để nhìn thấy màn boot + % chạy xong
  const [minTime, setMinTime] = useState(false);
  // Defer Canvas 3D: tạo WebGL context + compile shader ngay lúc mount
  // là nguyên nhân chính gây khựng khi mới load (tranh main thread với
  // entrance animation). Chờ main thread rảnh mới gắn scene, fade-in sau đó.
  const [showScene, setShowScene] = useState(false);
  // Nghiêng terminal theo chuột (spring mượt, transform-only nên rẻ)
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const tiltRX = useSpring(tiltX, { stiffness: 150, damping: 20 });
  const tiltRY = useSpring(tiltY, { stiffness: 150, damping: 20 });

  function handleTilt(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 10);
    tiltX.set(-((e.clientY - r.top) / r.height - 0.5) * 10);
  }
  function resetTilt() {
    tiltX.set(0);
    tiltY.set(0);
  }

  /**
   * Đăng xuất: xoá dòng phiên ở BE rồi đọc lại `/me`.
   *
   * Bước `refresh()` là bắt buộc, không phải cho đẹp: nó mới là chỗ xoá cache
   * SWR và hạ user về `null` (`AuthProvider.applyUser`). Bỏ nó thì UI vẫn hiện
   * tài khoản cũ tới lần làm mới kế tiếp (tối đa 15 phút), và dữ liệu của tài
   * khoản đó vẫn nằm lại trong cache — đăng nhập tài khoản khác trong cùng tab
   * là nhìn thấy dữ liệu người trước.
   */
  async function onSignOut() {
    setSignOutError("");
    const r = await signOut();
    if (r === "retry") {
      setSignOutError("Chưa đăng xuất được. Kiểm tra mạng rồi thử lại.");
      return;
    }
    await refresh();
  }

  useEffect(() => {
    // Hydration guard — cố ý cascading 1 lần để lần render đầu của client khớp
    // hệt server. Trạng thái đăng nhập chỉ biết được ở client (`/me` là fetch),
    // nên phải chờ `mounted` mới phân nhánh khách / đã đăng nhập.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const timer = window.setTimeout(() => setMinTime(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Bật scene 3D khi main thread rảnh (sau entrance), tránh khựng lúc mới load
    if (!mounted) return;
    const done = () => setShowScene(true);
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(done, { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(done, 700);
    return () => window.clearTimeout(timer);
  }, [mounted]);

  useEffect(() => {
    // `recordLogin` tự đi kèm cookie phiên (`credentials: "include"`), nên
    // không còn tham số token nữa.
    if (mounted && isSignedIn) recordLogin();
  }, [mounted, isSignedIn]);
  useEffect(() => {
    if (visibleLines < codeLines.length) {
      const timer = setTimeout(() => {
        setVisibleLines((prev) => prev + 1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visibleLines]);

  useEffect(() => {
    // Chạy sau khi loader xong (trang đã đủ chiều cao): có hash thì tới
    // anchor, không thì về đầu trang. Tránh browser restore vị trí cũ
    // lúc trang còn ngắn (loader) rồi kẹt ở cuối khi nội dung bung ra.
    if (!minTime || typeof window === "undefined") return;
    if (window.location.hash) {
      const selector = window.location.hash;
      const timer = window.setTimeout(() => {
        document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return () => window.clearTimeout(timer);
    }
    window.scrollTo(0, 0);
  }, [minTime]);

  // Guard hydration: server và lần render đầu của client phải giống nhau.
  // `/me` là fetch nên chỉ biết trạng thái đăng nhập ở client — chờ `mounted` và
  // `sessionLoading` trước khi phân nhánh, tránh render "khách" lúc thật ra đã
  // đăng nhập rồi nhảy sang nhánh kia giữa chừng.
  const showSignedIn = mounted && !sessionLoading && isSignedIn;

  return (
    <main className="relative min-h-screen overflow-hidden" suppressHydrationWarning>
      {/* Nền xuyên suốt cả trang: gradient dọc + lưới mờ + glow neo theo chiều dài */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#fafaf9_22%,#f4f4f5_50%,#fafaf9_78%,#ffffff_100%)]" />
        <div
          className="absolute inset-0 opacity-60 [mask-image:linear-gradient(180deg,transparent,black_12%,black_88%,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(0 0 0 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 0.04) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        {/* Glow neo theo chiều dài trang — dùng radial-gradient thay vì
            blur filter để browser không phải repaint vùng mờ khổng lồ khi cuộn */}
        <div className="absolute left-1/2 top-[28%] h-[480px] w-[720px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(167,243,208,0.35),transparent)]" />
        <div className="absolute -left-40 top-[55%] h-[420px] w-[420px] bg-[radial-gradient(closest-side,rgba(221,214,254,0.4),transparent)]" />
        <div className="absolute -right-40 top-[80%] h-[420px] w-[420px] bg-[radial-gradient(closest-side,rgba(153,246,228,0.35),transparent)]" />
      </div>
      <div className="relative mx-auto  px-6 pb-7 sm:px-6 lg:px-8">
        {!showSignedIn && (
          /* Navbar chỉ hiện với khách. Ở nhánh đã đăng nhập có một nav riêng, có
             nút đăng xuất, nên đây chỉ là hai thanh điều hướng chồng lên nhau. */
          <NavBar />
        )}

        {!showSignedIn && (
          <>
            <section id="hero" className="relative grid min-h-[72vh] items-center gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <HeroScrollFx />
            {/* Nền 3D R3F: khối trôi + hạt + parallax chuột, sau nội dung */}
            <div id="hero-3d" className="pointer-events-none absolute inset-0" aria-hidden>
              {showScene && (
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1.2 }}
                >
                  <HeroScene className="h-full w-full" />
                </motion.div>
              )}
              {/* Phủ trắng nhẹ bên trái để chữ luôn đọc được */}
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0.25)_40%,rgba(255,255,255,0)_65%)]" />
            </div>
            <div id="hero-copy" className="relative z-10 max-w-3xl">
              <motion.div variants={copyContainer} initial="hidden" animate="show">
              {/* Minimalist Top Eyebrow Tag */}
              <motion.div variants={copyItem} className="flex justify-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-zinc-300 text-[11px] font-mono font-medium text-zinc-700 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Local Native Engine</span>
                  <span className="text-zinc-300">/</span>
                  <span>
                    TypeScript 3.7 • Python 3.8 • Go 1.23 • Swift 5.2 • C++ (GCC
                    9.2.0)
                  </span>
                </div>
              </motion.div>
              <motion.div variants={copyItem} className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
                <motion.h1 variants={copyItem} className="font-display text-4xl sm:text-5xl md:text-6xl  tracking-tight text-zinc-950 leading-[1.12] mb-6">
                  Rèn tư duy giải thuật.{" "}
                  <span className="block   font-normal text-zinc-500 text-3xl sm:text-4xl md:text-5xl mt-1">
                    Tối giản, thuần khiết &amp; tức thì.
                  </span>
                </motion.h1>
                <motion.p variants={copyItem} className="text-base sm:text-lg text-zinc-700 leading-relaxed max-w-2xl mx-auto font-medium">
                  Hệ thống chấm mã nguồn độc lập chạy trực tiếp trong vài
                  mili-giây. Tuyển chọn bài toán cấu trúc dữ liệu và giải thuật
                  cốt lõi, không rườm rà, tập trung 100% vào năng lực kỹ thuật.
                </motion.p>
                <motion.div variants={copyItem} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="inline-flex w-full sm:w-auto">
                  <Link
                    href="/sign-up"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] sm:w-auto"
                  >
                    Bắt đầu miễn phí
                    <ArrowRight className="size-4" />
                  </Link>
                  </motion.span>
                  <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="inline-flex w-full sm:w-auto">
                  <SectionLink
                    id="topics-button"
                    targetId="topics"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] sm:w-auto"
                  >
                    Xem dạng bài
                  </SectionLink>
                  </motion.span>
                </motion.div>
                <motion.div variants={copyItem} className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 font-mono text-[12px] font-medium text-zinc-600">
                  <span>Miễn phí 100%</span>
                  <span className="size-1 rounded-full bg-zinc-300" />
                  <span>Mới ra mắt</span>
                  <span className="size-1 rounded-full bg-zinc-300" />
                  <span>Cập nhật liên tục</span>
                </motion.div>
              </motion.div>
              </motion.div>
            </div>

            <div id="hero-terminal" className="relative z-10 mx-auto w-full max-w-md lg:justify-self-end" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
              {/* Chips code bay quanh terminal (desktop) */}
              <motion.span aria-hidden className="pointer-events-none absolute -left-10 top-6 hidden rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1 font-mono text-xs font-bold text-emerald-600 shadow-sm backdrop-blur lg:block"
                animate={{ y: [0, -12, 0], rotate: [0, -4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
                {"{ ... }"}
              </motion.span>
              <motion.span aria-hidden className="pointer-events-none absolute -right-8 top-1/3 hidden rounded-lg border border-zinc-200 bg-white/90 px-2.5 py-1 font-mono text-xs font-bold text-zinc-700 shadow-sm backdrop-blur lg:block"
                animate={{ y: [0, 10, 0], rotate: [0, 5, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}>
                {"=>"}
              </motion.span>
              <motion.span aria-hidden className="pointer-events-none absolute -left-6 bottom-10 hidden rounded-lg border border-zinc-200 bg-zinc-950 px-2.5 py-1 font-mono text-xs font-bold text-emerald-400 shadow-lg lg:block"
                animate={{ y: [0, -9, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}>
                {"$ run"}
              </motion.span>
              <motion.span aria-hidden className="pointer-events-none absolute -right-6 -top-4 hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-700 shadow-sm lg:block"
                animate={{ y: [0, 8, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 2.2 }}>
                {"✓ 0 errors"}
              </motion.span>
              {/* Right: Code terminal */}
              <motion.div style={{ rotateX: tiltRX, rotateY: tiltRY, transformPerspective: 900 }}>

              <motion.div
                initial={{ opacity: 0, x: 48, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
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
                    <div className="ml-auto text-xs font-mono">
                      {visibleLines >= codeLines.length ? (
                        <span className="text-emerald-400">✓ Hoàn tất</span>
                      ) : (
                        <span className="text-accent-400 animate-pulse">● Đang chạy</span>
                      )}
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
                    {/* Con trỏ nhấp nháy bám cuối code đang gõ */}
                    <div className="flex">
                      <span className="w-8 shrink-0" />
                      <span className="mt-1 inline-block h-4 w-2 animate-pulse bg-emerald-400" />
                    </div>
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
                  {/* Status bar kiểu VS Code — luôn hiện cho "chất" dev */}
                  <div className="flex items-center gap-3 border-t border-white/5 bg-white/[0.02] px-5 py-1.5 font-mono text-[10px] text-zinc-500">
                    <span className="text-emerald-400">main*</span>
                    <span className="ml-auto">Ln {Math.min(visibleLines + 1, codeLines.length)}, Col 18</span>
                    <span className="hidden sm:inline">Spaces: 2</span>
                    <span className="hidden sm:inline">UTF-8</span>
                    <span className="text-zinc-300">JavaScript</span>
                  </div>
                </div>
              </motion.div>
              </motion.div>
            </div>
          </section>
          <TechMarquee />
          {/* <StatsStrip /> */}
          <section
            id="features"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16"
          >
            <Reveal className="text-center mb-12">
              <h2 className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
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
              <h2 className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
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
          </>
        )}

        {showSignedIn && (
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
                {user?.role !== "vip" && (
                  <Link
                    href="/premium"
                    className="font-medium text-amber-600 transition hover:text-amber-700"
                  >
                    Premium
                  </Link>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <OnlineCounter />
                  {user?.role === "vip" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm shadow-amber-500/20">
                      <Crown className="size-3.5 fill-white text-white" />
                      VIP
                    </span>
                  ) : null}
                  <span className="hidden text-xs text-zinc-600 md:inline">
                    Xin chào, {user?.name ?? user?.email ?? "Coder"}!
                  </span>
                  {/* Avatar + nút đăng xuất. Trước đây đây là widget của nhà
                      cung cấp danh tính cũ: bỏ nó đi mà không thay bằng gì thì
                      ứng dụng **không còn cách đăng xuất** — nên phải thay, không
                      phải xoá. */}
                  <div className="relative flex items-center gap-2">
                    <span
                      aria-hidden
                      className={
                        user?.role === "vip"
                          ? "flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-sm font-bold text-white ring-2 ring-white"
                          : "flex size-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-bold text-zinc-700"
                      }
                    >
                      {(user?.name ?? user?.email ?? "C").trim().charAt(0).toUpperCase()}
                    </span>
                    {user?.role === "vip" && (
                      <span className="pointer-events-none absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow ring-2 ring-white">
                        <Crown className="size-3 fill-white" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void onSignOut()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2"
                    >
                      <LogOut aria-hidden className="size-3.5" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </nav>

              {signOutError && (
                // `role="alert"` để screen reader đọc ngay khi câu xuất hiện.
                <p role="alert" className="mt-3 text-sm text-rose-600">
                  {signOutError}
                </p>
              )}

              <div className="py-6">
                <StreakDashboard />
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
