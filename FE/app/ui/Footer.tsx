"use client";
import Link from "next/link";
import SectionLink from "./SectionLink";
export default function Footer() {
  return (
    <footer className="bg-white border-t border-zinc-200/80">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-zinc-100">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md  text-white flex items-center justify-center font-mono font-semibold text-xs shadow-xs">
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
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight text-zinc-950 text-base">
                GoCode
              </span>
              <span className="text-zinc-300">/</span>
              <span className="text-xs text-zinc-500 font-normal">
                Luyện thuật toán tối giản
              </span>
            </div>
          </div>

          {/* Essential Navigation */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-zinc-600">
            <Link
              href="/problem"
              className="hover:text-zinc-950 transition-colors"
            >
              Bài tập
            </Link>
            <SectionLink
              targetId="topics"
              className="hover:text-zinc-950 transition-colors"
            >
              Dạng bài
            </SectionLink>
            <Link href="/qna" className="hover:text-zinc-950 transition-colors">
              Hỏi đáp
            </Link>
          </nav>
        </div>

        {/* Bottom copyright and legal */}
        <div className="pt-6  flex flex-col sm:flex-row items-center justify-center gap-3 text-[12px] text-zinc-400 font-mono">
          <p>© 2026 GoCode. Tối giản, thuần khiết &amp; tức thì.</p>
        </div>
      </div>
    </footer>
  );
}
