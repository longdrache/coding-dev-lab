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
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
      <Card className="w-full max-w-sm border-zinc-800 bg-white shadow-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-bold tracking-tight text-zinc-950">Admin Đăng nhập</CardTitle>
          <CardDescription className="text-sm font-medium text-zinc-600">
            Mặc định: <span className="font-mono font-bold text-zinc-900">admin / admin</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-zinc-900">Tài khoản</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="admin"
                required
                autoComplete="username"
                className="border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 focus-visible:ring-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-zinc-900">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                placeholder="admin"
                required
                autoComplete="current-password"
                className="border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 focus-visible:ring-zinc-900"
              />
            </div>
            {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-zinc-950 font-semibold text-white hover:bg-black">
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
