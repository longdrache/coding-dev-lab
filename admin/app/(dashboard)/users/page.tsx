"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Users } from "lucide-react";

type ClerkUser = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl: string;
  createdAt: number | string;
  lastSignInAt: number | string | null;
  publicMetadata: Record<string, unknown>;
  role: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { setPage(0); }, [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const offset = page * limit;
    const url = `/api/admin/users?limit=${limit}&offset=${offset}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ""}`;
    adminFetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message || `Failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setUsers(Array.isArray(data.users) ? data.users : []);
        setTotal(typeof data.totalCount === "number" ? data.totalCount : data.users?.length ?? 0);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, debouncedQuery]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(500px_circle_at_0%_0%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white text-zinc-900 shadow"><Users className="size-5" /></div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Users</h1>
            <p className="text-sm font-medium text-zinc-400">Danh sách user từ Clerk • {total} user</p>
          </div>
        </div>
      </div>

      <Card className="border-zinc-300 bg-white shadow-sm">
        <CardContent className="p-3">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 size-4 text-zinc-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo email, tên, ID..." className="pl-9 border-zinc-300 placeholder:text-zinc-400" />
          </label>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      ) : loading ? (
        <p className="text-sm font-medium text-zinc-600">Loading...</p>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm font-medium text-zinc-600">Không tìm thấy user</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200 bg-zinc-50 hover:bg-zinc-50">
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Người dùng</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Username</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Email</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Vai trò</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Lần đăng nhập cuối</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-bold tracking-wide text-zinc-700">Ngày tham gia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="border-zinc-100 hover:bg-zinc-50/70">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <img src={u.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.email || u.id)}`} alt="" className="size-8 rounded-full border border-zinc-200 bg-white object-cover" />
                        <div>
                          <p className="text-sm font-semibold tracking-tight text-zinc-900">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "—"}</p>
                          <p className="font-mono text-xs text-zinc-500">{u.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium text-zinc-700">{u.username || "—"}</TableCell>
                    <TableCell className="text-sm font-medium text-zinc-700">{u.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`px-2 py-0.5 text-xs font-bold border ${u.role === "admin" ? "bg-violet-50 text-violet-700 border-violet-200" : u.role === "vip" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-zinc-50 text-zinc-700 border-zinc-200"}`}>{u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-zinc-600">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("vi-VN") : "—"}</TableCell>
                    <TableCell className="text-sm font-medium text-zinc-600">{u.createdAt ? new Date(u.createdAt).toLocaleString("vi-VN") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600">Trang {page + 1}/{totalPages} • {total} user</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="border-zinc-300">Trước</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-zinc-300">Sau</Button>
        </div>
      </div>
    </div>
  );
}
