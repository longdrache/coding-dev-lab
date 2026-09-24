import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = {
  label: string;
  href?: string;
};

// Breadcrumb dùng chung mọi trang: Trang chủ / … / Trang hiện tại.
// tone="dark" cho các trang nền tối (premium, thank-you).
export default function Breadcrumbs({
  items,
  tone = "light",
  className = "",
}: {
  items: Crumb[];
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight
                  aria-hidden
                  className={`size-3.5 ${dark ? "text-white/25" : "text-zinc-300"}`}
                />
              )}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className={`transition ${
                    dark
                      ? "text-white/50 hover:text-white"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={`font-semibold ${dark ? "text-white" : "text-zinc-900"}`}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
