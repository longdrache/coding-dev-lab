"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Problem = {
  id?: string;
  slug: string;
  title: string;
  difficulty: string;
  topic: string;
  createdAt?: string;
};

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch("/api/admin/problems")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message || `Failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.problems ?? data?.data ?? [];
        setProblems(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Problems</h1>
          <Link href="/problems/new" className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            + New Problem
          </Link>
        </div>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!problems) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Problems</h1>
          <Link href="/problems/new" className="rounded bg-black px-4 py-2 text-sm font-medium text-white">
            + New Problem
          </Link>
        </div>
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950">Problems</h1>
        <Link href="/problems/new" className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-bold text-white shadow hover:bg-black">
          + New Problem
        </Link>
      </div>

      {problems.length === 0 ? (
        <p className="text-sm font-medium text-zinc-600">No problems yet.</p>
      ) : (
        <Card className="border-zinc-300 bg-white shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-100 hover:bg-zinc-100 border-b border-zinc-300">
                  <TableHead className="font-bold text-zinc-900">Slug</TableHead>
                  <TableHead className="font-bold text-zinc-900">Title</TableHead>
                  <TableHead className="font-bold text-zinc-900">Difficulty</TableHead>
                  <TableHead className="font-bold text-zinc-900">Topic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((p) => (
                  <TableRow key={p.slug} className="hover:bg-zinc-50 border-zinc-200">
                    <TableCell className="font-mono font-medium text-zinc-900">{p.slug}</TableCell>
                    <TableCell className="font-semibold text-zinc-900">{p.title}</TableCell>
                    <TableCell>
                      <Badge variant={p.difficulty === "Khó" ? "destructive" : p.difficulty === "Trung bình" ? "secondary" : "outline"} className="font-semibold">
                        {p.difficulty}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-zinc-700">{p.topic}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
