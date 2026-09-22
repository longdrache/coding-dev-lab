"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch } from "@/lib/api";
import {
  LayoutDashboard,
  FileText,
  ScrollText,
  MessageSquare,
  Users,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/problems", label: "Bài tập", icon: FileText },
  { href: "/submissions", label: "Bài nộp", icon: ScrollText },
  { href: "/qna", label: "Hỏi đáp", icon: MessageSquare },
  { href: "/users", label: "Học viên", icon: Users },
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
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <aside className="w-64 shrink-0 bg-white text-slate-900 p-5 flex flex-col border-r border-slate-200">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 font-display text-sm font-bold text-white">
            G
          </div>
          <div>
            <p className="font-display text-sm font-bold tracking-tight text-slate-900">GoCode Admin</p>
            <p className="text-[11px] text-slate-500">Không gian quản trị</p>
          </div>
        </div>
        <nav className="mt-8 flex flex-col gap-1 flex-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-emerald-50 font-semibold text-emerald-700"
                    : "font-normal text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
                {active && <span className="ml-auto size-1.5 rounded-full bg-emerald-400" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500">Administrator</p>
          <p className="text-[11px] text-slate-400">GoCode · Codelab</p>
        </div>
        <button
          onClick={handleLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </button>
      </aside>
      <main className="min-w-0 flex-1 p-6 overflow-auto lg:p-8">{children}</main>
    </div>
  );
}
