"use client";

import useSWR from "swr";
import type { Problem } from "@/app/data/problems";
import { API_URL, swrFetcher } from "@/lib/swr";

export function useProblems() {
  const { data, error, isLoading } = useSWR<Problem[]>(
    `${API_URL}/api/problems`,
    swrFetcher,
  );
  return { problems: data ?? null, loading: isLoading, error };
}

export function useProblem(slug: string) {
  const { data, error, isLoading } = useSWR<Problem>(
    slug ? `${API_URL}/api/problems/${encodeURIComponent(slug)}` : null,
    swrFetcher,
  );
  return {
    problem: data ?? null,
    loading: isLoading,
    error: error ? "Không tìm thấy bài toán" : null,
  };
}
