"use client";

import useSWR from "swr";
import type { Problem } from "@/app/data/problems";
import { API_URL, ApiError, swrFetcher } from "@/lib/swr";

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
  const { data, error, isLoading, mutate } = useSWR<Problem>(
    slug ? `${API_URL}/api/problems/${encodeURIComponent(slug)}` : null,
    swrFetcher,
    { revalidateIfStale: true },
  );
  // Chỉ coi là "không tồn tại" khi BE **thật sự** trả 404. Mọi thứ khác — mạng
  // chết, CORS, 500 — là lỗi tải, và báo thành "không tìm thấy" khiến một bài có
  // thật bị hiện thành trang 404, không có nút thử lại.
  const status = error instanceof ApiError ? error.status : null;
  // Tên `notFound` sẽ che mất hàm `notFound()` của `next/navigation` trong trang
  // bài, nên gọi là `missing`.
  const missing = status === 404;
  return {
    problem: data ?? null,
    loading: isLoading,
    retry: mutate,
    missing,
    error: error
      ? missing
        ? "Không tìm thấy bài toán"
        : "Không tải được bài toán. Kiểm tra mạng rồi thử lại."
      : null,
  };
}
