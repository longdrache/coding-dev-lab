"use client";
import Link from "next/link";
import SectionLink from "./SectionLink";
import Logo from "./Logo";

const COLUMNS: Array<{
  title: string;
  links: Array<{ label: string; href: string } | { label: string; topic: true }>;
}> = [
  {
    title: "Luyện tập",
    links: [
      { label: "Bài tập", href: "/problem" },
      { label: "Dạng bài", topic: true },
    ],
  },
  {
    title: "Nền tảng",
    links: [
      { label: "Premium", href: "/premium" },
      { label: "Hỏi đáp", href: "/qna" },
      { label: "Đăng nhập", href: "/sign-in" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200/80 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          {/* Brand + status */}
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-zinc-500">
              Luyện thuật toán tối giản — 56 bài, 8 ngôn ngữ, chấm tức thì.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-mono text-[11px] text-zinc-600">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Engine &lt; 25ms • Mọi hệ thống bình thường
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) =>
                  "topic" in link ? (
                    <li key={link.label}>
                      <SectionLink
                        targetId="topics"
                        className="text-[13px] font-medium text-zinc-600 transition-colors hover:text-zinc-950"
                      >
                        {link.label}
                      </SectionLink>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] font-medium text-zinc-600 transition-colors hover:text-zinc-950"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom copyright and legal */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-zinc-100 pt-6 font-mono text-[12px] text-zinc-400 sm:flex-row">
          <p>© 2026 GoCode. Tối giản, thuần khiết &amp; tức thì.</p>
          <p className="flex items-center gap-1.5">
            <span className="text-zinc-300">/</span> learn • build • solve
          </p>
        </div>
      </div>
    </footer>
  );
}
