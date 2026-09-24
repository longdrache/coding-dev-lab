"use client";

import useSWR from "swr";
import type { Problem } from "@/app/data/problems";
import { API_URL, swrFetcher } from "@/lib/swr";

export function useProblems(fallbackData?: Problem[]) {
  // stale-while-revalidate: hiện cache/SSR ngay, đồng thời fetch nền
  // để tự lành khi data cũ (xóa cache trình duyệt không xóa localStorage).
  const { data, error, isLoading } = useSWR<Problem[]>(
    `${API_URL}/api/problems`,
    swrFetcher,
    fallbackData === undefined
      ? { revalidateIfStale: true }
      : { fallbackData, revalidateIfStale: true },
  );
  return { problems: data ?? null, loading: isLoading, error };
}

export function useProblem(slug: string) {
  const { data, error, isLoading } = useSWR<Problem>(
    slug ? `${API_URL}/api/problems/${encodeURIComponent(slug)}` : null,
    swrFetcher,
    { revalidateIfStale: true },
  );
  return {
    problem: data ?? null,
    loading: isLoading,
    error: error ? "Không tìm thấy bài toán" : null,
  };
}
