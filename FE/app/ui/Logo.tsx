import Link from "next/link";

export default function Logo({
  theme = "light",
  withVersion = false,
  className = "",
}: {
  theme?: "light" | "dark";
  withVersion?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="GoCode - Về trang chủ"
      className={`inline-flex items-center gap-2.5 ${className}`}
    >
      <span className="block size-7">
        <svg viewBox="0 0 100 100" className="size-full -rotate-6">
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
      </span>
      <span
        className={`font-semibold tracking-tight text-base ${
          theme === "dark" ? "text-white" : "text-zinc-950"
        }`}
      >
        GoCode
      </span>
      {withVersion && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
          v1.0
        </span>
      )}
    </Link>
  );
}
