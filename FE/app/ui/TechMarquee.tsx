"use client";

const STACK = [
  { name: "Next.js", slug: "nextdotjs" },
  { name: "TypeScript", slug: "typescript" },
  { name: "Tailwind CSS", slug: "tailwindcss" },
  { name: "NestJS", slug: "nestjs" },
  { name: "Prisma", slug: "prisma" },
  { name: "PostgreSQL", slug: "postgresql" },
  { name: "Stripe", slug: "stripe" },
  { name: "Vercel", slug: "vercel" },
  { name: "Clerk", slug: "clerk" },
];

function hideBroken(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

// Dải logo công nghệ chạy marquee vô hạn: nhân đôi list để loop liền mạch,
// mask mờ 2 đầu, dừng khi hover, tắt khi reduced-motion.
export default function TechMarquee() {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {STACK.map((tech) => (
        <span
          key={`${hidden}-${tech.slug}`}
          className="flex items-center gap-2.5 whitespace-nowrap px-7"
        >
          <img
            src={`https://cdn.simpleicons.org/${tech.slug}`}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            onError={hideBroken}
            className="size-[22px] object-contain"
          />
          <span className="font-mono text-[18px] font-semibold tracking-wide text-zinc-700">
            {tech.name}
          </span>
          <span className="ml-7 size-1 shrink-0 rounded-full bg-zinc-300" />
        </span>
      ))}
    </div>
  );

  return (
    <section aria-label="Công nghệ sử dụng" className="relative py-2">
      <p className="mb-4 text-center font-mono text-[11px] tracking-[0.25em] text-zinc-400">
        Công nghệ sử dụng 
      </p>
      <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="animate-marquee flex w-max hover:[animation-play-state:paused] motion-reduce:animate-none">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}
