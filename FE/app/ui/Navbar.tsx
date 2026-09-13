"use client";
import { Menu, X, ArrowRight, ShieldAlert, Zap } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function NavBar() {
  const { isLoaded } = useAuth();
  return (
    <header className="sticky top-0 z-50 w-full  backdrop-blur-md border-b border-zinc-200/80">
      <div className="mx-auto px-10 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <button
            id="logo-button"
            className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 rounded-lg p-1"
          >
            <div className="w-7 h-7 rounded-md text-white flex items-center justify-center font-mono font-semibold text-xs tracking-tight">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full rounded-lg -rotate-6"
              >
                <path
                  d="M50 10 C55 8, 60 10, 62 15  L88 55C91 60, 90 66, 85 69
         L40 92
         C34 95, 27 92, 25 86
         L10 35
         C8 29, 12 23, 18 22
         Z"
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="font-semibold tracking-tight text-zinc-950 text-base flex items-center gap-2">
              GoCode
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
                v1.0
              </span>
            </span>
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-600">
            <button
              id="nav-tracks"
              className="hover:text-zinc-950 transition-colors py-1"
            >
              Lộ trình
            </button>
            <button
              id="nav-challenges"
              className="hover:text-zinc-950 transition-colors py-1"
            >
              Thử thách
            </button>
            <button
              id="nav-playground"
              className="hover:text-zinc-950 transition-colors py-1"
            >
              Sân luyện
            </button>
            <button
              id="nav-philosophy"
              className="hover:text-zinc-950 transition-colors py-1"
            >
              Kiến trúc
            </button>
          </nav>
        </div>
        {/* Right CTA / Quick Status */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 px-2.5 py-1 rounded-full bg-zinc-100/80 border border-zinc-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Engine &lt; 25ms</span>
          </div>

          <div
            className="flex min-h-10 min-w-32 items-center justify-end"
            aria-busy={!isLoaded}
          >
            {!isLoaded && (
              <div
                aria-label="Loading account"
                className="flex h-10 w-32 items-center justify-end gap-2"
              >
                <span className="h-10 w-16 animate-pulse border border-white/10 bg-white/10" />
                <span className="h-10 w-12 animate-pulse bg-[#d65a3a]/35" />
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
                    className="inline-flex items-center gap-1.5 px-5.5 py-2.5 rounded-lg bg-zinc-950  text-white hover:scale-105  text-xs font-medium hover:bg-zinc-800 active:scale-[0.98] transition-all"
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
        <div className="md:hidden flex items-center gap-2">
          <button
            className="p-2 rounded-lg text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors"
            aria-label="Toggle menu"
          ></button>
        </div>
      </div>
    </header>
  );
}
