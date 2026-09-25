"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || "Sai tài khoản hoặc mật khẩu");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen font-sans lg:grid-cols-2">
      {/* Panel brand (desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-10 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(255 255 255 / 0.8) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.8) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 70% 60% at 30% 30%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 30% 30%, black, transparent)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-emerald-500/20 blur-[100px]"
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500 font-display text-base font-bold text-slate-950">
            G
          </div>
          <p className="font-display text-lg font-bold tracking-tight">GoCode Admin</p>
        </div>
        <div className="relative">
          <p className="font-mono text-xs tracking-[0.25em] text-emerald-400">CONTROL_PLANE // v3.7</p>
          <p className="mt-4 max-w-md font-display text-3xl font-bold leading-tight tracking-tight">
            Cửa ngõ duy nhất vào hệ thống chấm bài.
          </p>
          <ul className="mt-6 space-y-2.5 font-mono text-[13px] text-slate-400">
            <li><span className="text-emerald-400">✓</span> Duyệt & xuất bản đề thi</li>
            <li><span className="text-emerald-400">✓</span> Giám sát submissions realtime</li>
            <li><span className="text-emerald-400">✓</span> Trả lời học viên qua mail</li>
          </ul>
        </div>
        <p className="relative font-mono text-[11px] text-slate-500">JWT RS256 • httpOnly cookie • audit mọi thao tác</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2.5 lg:hidden">
          <div className="flex size-10 items-center justify-center rounded-lg bg-slate-900 font-display text-base font-bold text-white">
            G
          </div>
          <p className="font-display text-lg font-bold tracking-tight text-slate-900">GoCode Admin</p>
        </div>
        <Card className="border-slate-200 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.05)]">
          <CardHeader className="space-y-1">
            <CardTitle className="font-display text-xl font-bold tracking-tight text-slate-900">Đăng nhập quản trị</CardTitle>
            <CardDescription className="text-sm text-slate-500">
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-slate-900">Tài khoản</Label>
                <Input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="admin"
                  required
                  autoComplete="username"
                  className="h-[42px] border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-[3px] focus-visible:ring-slate-900/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-slate-900">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="h-[42px] border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-[3px] focus-visible:ring-slate-900/10"
                />
              </div>
              {error && <p className="rounded-lg border-2 border-red-500 bg-white px-3.5 py-2.5 text-sm text-red-600 shadow-[0_3px_0_rgba(239,68,68,0.1)]">{error}</p>}
              <Button type="submit" disabled={loading} className="h-[42px] w-full bg-slate-900 text-sm font-semibold text-white hover:bg-slate-950 disabled:opacity-40">
                {loading ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-slate-500">Khu vực quản trị · GoCode</p>
      </div>
      </div>
    </main>
  );
}
