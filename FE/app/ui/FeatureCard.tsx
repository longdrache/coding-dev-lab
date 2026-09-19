"use client";

import { useCallback, type MouseEvent } from "react";
import { Brain, Code2, Trophy } from "lucide-react";

type Accent = "emerald" | "violet" | "amber";

const ACCENT_STYLES: Record<
  Accent,
  {
    bar: string;
    tile: string;
    tileShadow: string;
    wash: string;
    spot: string;
    hoverBorder: string;
    hoverShadow: string;
    link: string;
    number: string;
  }
> = {
  emerald: {
    bar: "from-emerald-400 via-teal-400 to-emerald-500",
    tile: "from-emerald-400 to-teal-600",
    tileShadow: "shadow-emerald-500/30",
    wash: "from-emerald-50/80",
    spot: "rgba(16, 185, 129, 0.10)",
    hoverBorder: "hover:border-emerald-200",
    hoverShadow: "hover:shadow-emerald-500/[0.08]",
    link: "text-emerald-600",
    number: "text-emerald-950/[0.07]",
  },
  violet: {
    bar: "from-violet-400 via-fuchsia-400 to-violet-500",
    tile: "from-violet-400 to-purple-600",
    tileShadow: "shadow-violet-500/30",
    wash: "from-violet-50/80",
    spot: "rgba(139, 92, 246, 0.10)",
    hoverBorder: "hover:border-violet-200",
    hoverShadow: "hover:shadow-violet-500/[0.08]",
    link: "text-violet-600",
    number: "text-violet-950/[0.07]",
  },
  amber: {
    bar: "from-amber-300 via-orange-400 to-amber-500",
    tile: "from-amber-400 to-orange-600",
    tileShadow: "shadow-amber-500/30",
    wash: "from-amber-50/80",
    spot: "rgba(245, 158, 11, 0.12)",
    hoverBorder: "hover:border-amber-200",
    hoverShadow: "hover:shadow-amber-500/[0.08]",
    link: "text-amber-600",
    number: "text-amber-950/[0.07]",
  },
};

function CardIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "Brain":
      return <Brain className={className} />;
    case "Trophy":
      return <Trophy className={className} />;
    case "Code2":
    default:
      return <Code2 className={className} />;
  }
}

export default function FeatureCard({
  icon,
  title,
  description,
  accent = "emerald",
  index,
}: {
  icon: string;
  title: string;
  description: string;
  accent?: Accent;
  index?: string;
}) {
  const a = ACCENT_STYLES[accent];

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`group relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_45px_-18px_rgba(16,24,40,0.18)] ${a.hoverBorder} ${a.hoverShadow}`}
    >
      {/* Vạch gradient trên cùng */}
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${a.bar}`}
      />

      {/* Lớp phủ màu wash nhẹ */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100 ${a.wash}`}
      />

      {/* Spotlight chạy theo chuột */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 0%), ${a.spot}, transparent 70%)`,
        }}
      />

      {/* Số thứ tự watermark */}
      {index && (
        <span
          className={`pointer-events-none absolute right-5 top-6 font-mono text-5xl font-bold tabular-nums ${a.number}`}
        >
          {index}
        </span>
      )}

      {/* Icon gradient */}
      <div className="relative">
        <div
          className={`flex size-13 items-center justify-center rounded-2xl bg-gradient-to-br p-3 shadow-lg ring-1 ring-white/30 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110 ${a.tile} ${a.tileShadow}`}
        >
          <CardIcon name={icon} className="size-6 text-white" />
        </div>
      </div>

      <h3 className="relative mt-6 text-[17px] font-semibold tracking-tight text-zinc-900">
        {title}
      </h3>
      <p className="relative mt-2 text-[15px] leading-relaxed text-zinc-500">
        {description}
      </p>
    </div>
  );
}
