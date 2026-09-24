"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import OnlineCounter from "./OnlineCounter";
import SectionLink from "./SectionLink";
import Logo from "./Logo";

const LINKS = [
  { id: "nav-problems", label: "Bài tập", href: "/problem" as const },
  { id: "nav-qna", label: "Hỏi đáp", href: "/qna" as const },
];

export default function NavBar() {
  const { isLoaded } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const linkClass = (href: string) =>
    `transition-colors py-1 ${
      pathname === href || pathname.startsWith(`${href}/`)
        ? "font-semibold text-zinc-950"
        : "text-zinc-600 hover:text-zinc-950"
    }`;

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md border-b border-zinc-200/80 bg-white/80">
      <div className="mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo withVersion />

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm">
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
              className="text-zinc-600 hover:text-zinc-950 transition-colors py-1"
            >
              Dạng bài
            </SectionLink>
            <Link
              id="nav-premium"
              href="/premium"
              className={`font-medium transition-colors py-1 ${
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
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 px-2.5 py-1 rounded-full bg-zinc-100/80 border border-zinc-200/60">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </span>
            <span>Engine &lt; 25ms</span>
          </div>
          <OnlineCounter />

          <div
            className="flex min-h-10 min-w-32 items-center justify-end"
            aria-busy={!isLoaded}
          >
            {!isLoaded && (
              <div
                aria-label="Loading account"
                className="flex h-10 w-32 items-center justify-end gap-2"
              >
                <span className="h-9 w-16 animate-pulse rounded-lg bg-zinc-100" />
                <span className="h-9 w-20 animate-pulse rounded-lg bg-zinc-200" />
              </div>
            )}
            {isLoaded && (
              <div className="flex items-center gap-2">
                <SignInButton mode="modal">
                  <button
                    id="nav-btn-login"
                    className="px-5 py-2.5 rounded-lg text-zinc-700 hover:text-zinc-950 hover:scale-105 hover:bg-zinc-100 text-xs font-medium transition-colors"
                  >
                    Đăng nhập
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button
                    id="nav-btn-register"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-zinc-950  text-white hover:scale-105  text-xs font-medium hover:bg-zinc-800 active:scale-[0.98] transition-all"
                  >
                    <span>Đăng ký</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </SignUpButton>
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
            <div className="mt-2 flex gap-2 border-t border-zinc-100 pt-3 sm:hidden">
              <SignInButton mode="modal">
                <button className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-xs font-medium text-zinc-700">
                  Đăng nhập
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="flex-1 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-medium text-white">
                  Đăng ký
                </button>
              </SignUpButton>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
