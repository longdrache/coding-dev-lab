"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
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
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-tight text-slate-900">Học viên</h1>
        <p className="mt-1 text-sm text-slate-500">Danh sách user từ Clerk • {total} học viên</p>
      </div>

      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 size-4 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo email, tên, ID..." className="h-[42px] border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-900 focus-visible:ring-[3px] focus-visible:ring-slate-900/10" />
      </div>

      {error ? (
        <p className="rounded-lg border-2 border-red-500 bg-white px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : users.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Không tìm thấy học viên</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 bg-white hover:bg-white">
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Người dùng</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Username</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Email</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Vai trò</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Lần đăng nhập cuối</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium uppercase tracking-[0.5px] text-slate-500">Ngày tham gia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="h-12 border-slate-100 hover:bg-slate-50">
                    <TableCell className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <img src={u.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.email || u.id)}`} alt="" className="size-8 rounded-full border border-slate-200 bg-white object-cover" />
                        <div>
                          <p className="text-sm font-normal text-slate-900">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "—"}</p>
                          <p className="font-mono text-xs text-slate-500">{u.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 font-mono text-sm text-slate-900">{u.username || "—"}</TableCell>
                    <TableCell className="px-4 py-2 text-sm text-slate-500">{u.email || "—"}</TableCell>
                    <TableCell className="px-4 py-2">
                      <Badge className={`rounded border-0 px-3 py-1 text-xs font-medium uppercase tracking-[0.5px] ${u.role === "admin" ? "bg-slate-900 text-white" : u.role === "vip" ? "bg-yellow-500/10 text-yellow-700" : "bg-slate-100 text-slate-500"}`}>{u.role}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-2 font-mono text-xs tabular-nums text-slate-500">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("vi-VN") : "—"}</TableCell>
                    <TableCell className="px-4 py-2 font-mono text-xs tabular-nums text-slate-500">{u.createdAt ? new Date(u.createdAt).toLocaleString("vi-VN") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Trang {page + 1}/{totalPages} • {total} học viên</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-8 rounded-lg border-slate-200 bg-white">Trước</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-lg border-slate-200 bg-white">Sau</Button>
        </div>
      </div>
    </div>
  );
}
