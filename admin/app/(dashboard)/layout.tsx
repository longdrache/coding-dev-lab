"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { adminFetch } from "@/lib/api";
import { swrFetcher } from "@/lib/swr";
import {
  LayoutDashboard,
  FileText,
  ScrollText,
  MessageSquare,
  Users,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/problems", label: "Bài tập", icon: FileText },
  { href: "/submissions", label: "Bài nộp", icon: ScrollText },
  { href: "/qna", label: "Hỏi đáp", icon: MessageSquare },
  { href: "/users", label: "Học viên", icon: Users },
];

function SystemStatus() {
  const { data, error } = useSWR<{ ok: boolean }>(
    "/api/admin/health",
    async (key: string) => {
      const t = Date.now();
      const res = await swrFetcher<{ ok: boolean }>(key);
      return { ...res, ms: Date.now() - t } as { ok: boolean; ms?: number };
    },
    { refreshInterval: 60000, dedupingInterval: 30000 },
  );
  const online = !error && data?.ok;
  const ms = (data as { ms?: number } | undefined)?.ms;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span className="relative flex size-2">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${online ? "bg-emerald-400" : "bg-rose-400"}`} />
          <span className={`relative inline-flex size-2 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
        </span>
        {online ? "Backend trực tuyến" : "Backend ngoại tuyến"}
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
        {online ? `độ trễ ${ms ?? "—"} ms` : "kiểm tra kết nối BE"}
      </p>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await adminFetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  const nav = (
    <>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-emerald-50 font-semibold text-emerald-700"
                  : "font-normal text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-emerald-500" />
              )}
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 space-y-3">
        <SystemStatus />
        <button
          onClick={handleLogout}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5 text-slate-900 lg:flex">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 font-display text-sm font-bold text-white">
            G
          </div>
          <div>
            <p className="font-display text-sm font-bold tracking-tight text-slate-900">GoCode Admin</p>
            <p className="font-mono text-[11px] text-slate-500">control plane</p>
          </div>
        </div>
        <div className="mt-8 flex flex-1 flex-col">{nav}</div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Topbar mobile */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 font-display text-xs font-bold text-white">
              G
            </div>
            <p className="font-display text-sm font-bold text-slate-900">GoCode Admin</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Mở menu"
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Drawer mobile */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white p-5 shadow-2xl">
              <div className="flex items-center gap-2.5 px-1">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 font-display text-sm font-bold text-white">
                  G
                </div>
                <p className="font-display text-sm font-bold text-slate-900">GoCode Admin</p>
              </div>
              <div className="mt-8 flex flex-1 flex-col">{nav}</div>
            </aside>
          </div>
        )}

        <main className="min-w-0 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
