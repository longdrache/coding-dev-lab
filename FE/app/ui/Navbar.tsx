"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { useSession } from "./AuthProvider";
import OnlineCounter from "./OnlineCounter";
import SectionLink from "./SectionLink";
import Logo from "./Logo";

const LINKS = [
  { id: "nav-problems", label: "Bài tập", href: "/problem" as const },
  { id: "nav-qna", label: "Hỏi đáp", href: "/qna" as const },
];

export default function NavBar() {
  // Chưa đọc xong `/me` thì chưa biết là khách hay đã đăng nhập — hiện skeleton
  // thay vì đoán, để không nháy nút "Đăng nhập" lên nút tài khoản rồi lại nháy về.
  const { loading } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /*
   * `whitespace-nowrap` ở mọi link của header: tiếng Việt có dấu nên "Đăng nhập",
   * "Bài tập", "Dạng bài" rất dễ bị bẻ dòng đúng lúc header bị bóp còn thiếu chỗ,
   * và một nút bị bẻ dòng trông hỏng hơn cả việc ẩn nó đi.
   */
  const linkClass = (href: string) =>
    `whitespace-nowrap transition-colors py-1 ${
      pathname === href || pathname.startsWith(`${href}/`)
        ? "font-semibold text-zinc-950"
        : "text-zinc-600 hover:text-zinc-950"
    }`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/95">
      <div className="mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <div className="flex shrink-0 items-center gap-8">
          <Logo withVersion />

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex shrink-0 items-center gap-6 text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.id}
                id={link.id}
                href={link.href}
                className={linkClass(link.href)}
              >
                {link.label}
              </Link>
            ))}
            <SectionLink
              id="nav-topics"
              targetId="topics"
              className="whitespace-nowrap text-zinc-600 hover:text-zinc-950 transition-colors py-1"
            >
              Dạng bài
            </SectionLink>
            <Link
              id="nav-premium"
              href="/premium"
              className={`whitespace-nowrap font-medium transition-colors py-1 ${
                pathname.startsWith("/premium")
                  ? "font-semibold text-amber-600"
                  : "text-amber-600/80 hover:text-amber-600"
              }`}
            >
              Premium
            </Link>
          </nav>
        </div>
        {/* Right CTA / Quick Status */}
        <div className="hidden sm:flex items-center gap-4">
          {/*
           * Hai badge trạng thái là thông tin phụ, và chúng là hai khối rộng nhất
           * trong header (~130px mỗi cái): đo thật thì chúng đẩy tổng bề rộng cần
           * lên ~920px, đủ làm nút "Đăng ký" bị bóp và bẻ chữ thành hai dòng ở
           * mọi bề rộng hẹp hơn. Nên:
           *
           * - "n đang online" từ `lg`: nó mang thông tin sống, ưu tiên hơn, và vẫn
           *   còn chỗ trống ở 1024.
           * - "Engine < 25ms" từ `xl`: chỉ là câu quảng bá tĩnh, đẩy nó xuống
           *   1280 giữ được 160px dư địa ở mọi bề rộng khác.
           *
           * Dưới `md` badge online nằm trong menu mobile, nên điện thoại không
           * mất thông tin này (xem khối "Mobile panel" bên dưới).
           */}
          <div className="hidden shrink-0 whitespace-nowrap xl:flex items-center gap-2 text-xs font-mono text-zinc-500 px-2.5 py-1 rounded-full bg-zinc-100/80 border border-zinc-200/60">
          
         
          </div>
          <div className="hidden shrink-0 whitespace-nowrap lg:flex">
            <OnlineCounter />
          </div>

          <div
            className="flex min-h-10 min-w-32 shrink-0 items-center justify-end"
            aria-busy={loading}
          >
            {loading && (
              <div
                aria-label="Đang tải trạng thái đăng nhập"
                className="flex h-10 w-32 items-center justify-end gap-2"
              >
                <span className="h-9 w-16 animate-pulse rounded-lg bg-zinc-100" />
                <span className="h-9 w-20 animate-pulse rounded-lg bg-zinc-200" />
              </div>
            )}
            {!loading && (
              <div className="flex items-center gap-2">
                <Link
                  id="nav-btn-login"
                  href="/sign-in"
                  className="px-5 py-2.5 rounded-lg text-zinc-700 hover:text-zinc-950 hover:scale-105 hover:bg-zinc-100 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                >
                  Đăng nhập
                </Link>
                <Link
                  id="nav-btn-register"
                  href="/sign-up"
                  className="inline-flex shrink-0 items-center gap-1.5 px-5 py-2.5 rounded-lg bg-zinc-950  text-white hover:scale-105  text-xs font-medium whitespace-nowrap hover:bg-zinc-800 active:scale-[0.98] transition-all"
                >
                  <span>Đăng ký</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </Link>
              </div>
            )}
          </div>
        </div>
        {/* Mobile menu trigger */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Mở menu"
            className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {open && (
        <nav className="border-t border-zinc-200/80 bg-white px-6 py-4 md:hidden">
          <div className="flex flex-col gap-1 text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50 ${linkClass(link.href)}`}
              >
                {link.label}
              </Link>
            ))}
            <SectionLink
              targetId="topics"
              className="rounded-lg px-3 py-2.5 text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
            >
              <span onClick={() => setOpen(false)}>Dạng bài</span>
            </SectionLink>
            <Link
              href="/premium"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 font-medium text-amber-600 transition-colors hover:bg-amber-50"
            >
              Premium
            </Link>
            <div className="mt-2 flex items-center gap-2 whitespace-nowrap border-t border-zinc-100 pt-3">
              <OnlineCounter />
            </div>
            <div className="mt-2 flex gap-2 border-t border-zinc-100 pt-3 sm:hidden">
              <Link
                href="/sign-in"
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-zinc-700"
              >
                Đăng nhập
              </Link>
              <Link
                href="/sign-up"
                className="flex-1 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-white"
              >
                Đăng ký
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
