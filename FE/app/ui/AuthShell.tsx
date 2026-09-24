import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import type { ReactNode } from "react";
import Logo from "./Logo";

const POINTS = [
  "56 bài từ Dễ đến Khó, 8 ngôn ngữ",
  "Chấm batch tức thì, streak mỗi ngày",
  "Miễn phí 100%, không thẻ tín dụng",
];

// Khung brand cho sign-in/up: trái pitch, phải form Clerk.
export default function AuthShell({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-wash">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(0 0 0 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-6 py-12 lg:grid-cols-[1fr_auto]">
        <div>
          <Logo />
          <p className="mt-8 font-mono text-xs font-medium text-emerald-600">{kicker}</p>
          <h1 className="mt-3 max-w-md text-3xl font-bold leading-tight tracking-tight text-zinc-950 sm:text-4xl">
            {title}
          </h1>
          <ul className="mt-6 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-zinc-600">
                <span className="mt-0.5 rounded-full bg-emerald-100 p-0.5 text-emerald-600">
                  <Check className="size-3.5" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-zinc-800"
          >
            <ArrowLeft className="size-4" />
            Trang chủ
          </Link>
        </div>
        <div className="justify-self-center">{children}</div>
      </div>
    </div>
  );
}
