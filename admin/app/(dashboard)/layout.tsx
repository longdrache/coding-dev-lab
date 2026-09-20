"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/problems", label: "Problems" },
  { href: "/qna", label: "QNA" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await adminFetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 flex">
      <aside className="w-64 bg-zinc-950 text-white p-6 flex flex-col border-r border-zinc-800">
        <h2 className="font-bold text-lg tracking-tight">GoCode Admin</h2>
        <nav className="mt-6 flex flex-col gap-1 flex-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-2 text-sm transition ${
                  active ? "bg-white text-black font-medium" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="mt-4 w-full rounded border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white hover:text-black transition"
        >
          Logout
        </button>
      </aside>
      <main className="flex-1 p-8 overflow-auto bg-zinc-100">{children}</main>
    </div>
  );
}
