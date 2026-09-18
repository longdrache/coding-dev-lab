import Link from "next/link";
import {
  ArrowRight,
  ArrowUpDown,
  Hash,
  Layers,
  LayoutList,
  Link as LinkIcon,
  Network,
  LayoutGrid,
  Type,
} from "lucide-react";
import type { Topic, TopicAccent, TopicIconName } from "@/app/data/topics";

const ACCENT_STYLES: Record<
  TopicAccent,
  {
    tile: string;
    tileShadow: string;
    hoverBorder: string;
    hoverShadow: string;
    link: string;
    levelDot: string;
  }
> = {
  emerald: {
    tile: "from-emerald-400 to-teal-600",
    tileShadow: "shadow-emerald-500/30",
    hoverBorder: "hover:border-emerald-200",
    hoverShadow: "hover:shadow-emerald-500/[0.08]",
    link: "text-emerald-600",
    levelDot: "bg-emerald-500",
  },
  sky: {
    tile: "from-sky-400 to-blue-600",
    tileShadow: "shadow-sky-500/30",
    hoverBorder: "hover:border-sky-200",
    hoverShadow: "hover:shadow-sky-500/[0.08]",
    link: "text-sky-600",
    levelDot: "bg-sky-500",
  },
  violet: {
    tile: "from-violet-400 to-purple-600",
    tileShadow: "shadow-violet-500/30",
    hoverBorder: "hover:border-violet-200",
    hoverShadow: "hover:shadow-violet-500/[0.08]",
    link: "text-violet-600",
    levelDot: "bg-violet-500",
  },
  amber: {
    tile: "from-amber-400 to-orange-600",
    tileShadow: "shadow-amber-500/30",
    hoverBorder: "hover:border-amber-200",
    hoverShadow: "hover:shadow-amber-500/[0.08]",
    link: "text-amber-600",
    levelDot: "bg-amber-500",
  },
  rose: {
    tile: "from-rose-400 to-pink-600",
    tileShadow: "shadow-rose-500/30",
    hoverBorder: "hover:border-rose-200",
    hoverShadow: "hover:shadow-rose-500/[0.08]",
    link: "text-rose-600",
    levelDot: "bg-rose-500",
  },
  orange: {
    tile: "from-orange-400 to-red-500",
    tileShadow: "shadow-orange-500/30",
    hoverBorder: "hover:border-orange-200",
    hoverShadow: "hover:shadow-orange-500/[0.08]",
    link: "text-orange-600",
    levelDot: "bg-orange-500",
  },
};

function TopicIcon({
  name,
  className,
}: {
  name: TopicIconName;
  className?: string;
}) {
  switch (name) {
    case "string":
      return <Type className={className} />;
    case "linked-list":
      return <LinkIcon className={className} />;
    case "stack-queue":
      return <Layers className={className} />;
    case "tree-graph":
      return <Network className={className} />;
    case "dp":
      return <LayoutGrid className={className} />;
    case "sorting-searching":
      return <ArrowUpDown className={className} />;
    case "hashing":
      return <Hash className={className} />;
    case "array":
    default:
      return <LayoutList className={className} />;
  }
}

export default function TopicCard({ topic }: { topic: Topic }) {
  const a = ACCENT_STYLES[topic.accent];

  return (
    <Link
      href={`/problem?topic=${topic.slug}`}
      className={`group flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_35px_-16px_rgba(16,24,40,0.2)] ${a.hoverBorder} ${a.hoverShadow}`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-md ring-1 ring-white/30 transition-transform duration-300 group-hover:scale-110 ${a.tile} ${a.tileShadow}`}
        >
          <TopicIcon name={topic.icon} className="size-5 text-white" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-500">
          <span className={`size-1.5 rounded-full ${a.levelDot}`} />
          {topic.level}
        </span>
      </div>

      <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-zinc-900">
        {topic.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-500">
        {topic.description}
      </p>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="font-mono text-[11px] text-zinc-400">
          {topic.count} bài tập
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[13px] font-medium ${a.link}`}
        >
          Luyện tập
          <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
