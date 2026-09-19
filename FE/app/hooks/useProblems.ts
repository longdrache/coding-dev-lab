"use client";

import { useEffect, useState } from "react";
import type { Problem } from "@/app/data/problems";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function useProblems() {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/problems`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Problem[];
        if (!cancelled) setProblems(data);
      } catch {
        // fallback to empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  return { problems, loading };
}

export function useProblem(slug: string) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/problems/${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error("Không tìm thấy bài toán");
        const data = (await res.json()) as Problem;
        if (!cancelled) setProblem(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Lỗi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return { problem, loading, error };
}
