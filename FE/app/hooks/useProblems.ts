"use client";

import useSWR from "swr";
import type { Problem } from "@/app/data/problems";
import { API_URL, ApiError, authedFetcher } from "@/lib/swr";
import { isVipLockedError } from "@/app/problem/vip-gate";

export function useProblems(fallbackData?: Problem[]) {
  // stale-while-revalidate: hiện cache/SSR ngay, đồng thời fetch nền
  // để tự lành khi data cũ.
  //
  // `authedFetcher` chứ không phải `swrFetcher`: danh sách **có** phụ thuộc người
  // xem — người có VIP nhận mô tả đầy đủ của bài VIP, người khác chỉ nhận
  // tiêu đề. Dùng fetcher công khai thì BE không biết ai đang hỏi, mọi người bị
  // coi là khách, và đúng cái lỗi người dùng báo ("vip thay chi thay tieu de
  // thoi") là quay lại. BE tự đổi header cache theo nhánh này
  // (`private, no-store` khi có mô tả) — xem `be/src/problems/problems.controller.ts`.
  const { data, error, isLoading, mutate } = useSWR<Problem[]>(
    `${API_URL}/api/problems`,
    authedFetcher,
    fallbackData === undefined
      ? { revalidateIfStale: true }
      : { fallbackData, revalidateIfStale: true },
  );
  return { problems: data ?? null, loading: isLoading, error, retry: mutate };
}

export function useProblem(slug: string) {
  // `authedFetcher` chứ không phải `swrFetcher`: chi tiết bài có phụ thuộc người
  // xem (bài VIP thì BE trả 403 cho người không VIP), nên phải gửi kèm cookie
  // phiên. Dùng fetcher công khai thì BE không biết ai đang hỏi và **mọi** người
  // đều bị coi là khách — tức chính người có VIP cũng không mở được bài của mình.
  const { data, error, isLoading, mutate } = useSWR<Problem>(
    slug ? `${API_URL}/api/problems/${encodeURIComponent(slug)}` : null,
    authedFetcher,
    {
      revalidateIfStale: false,
      // Không tự động retry khi lỗi: chỉ hiện lỗi một lần, người dùng bấm
      // nút "Thử lại" trên màn hình nếu muốn kết nối lại.
      // 404 (bài không tồn tại), 401 (hết phiên — authedFetcher đã xử lý refresh),
      // 403 (VIP khoá) không retry vì sẽ không thay đổi kết quả.
      errorRetryCount: 0,
    }
  );
  console.log("useProblem", slug, data, error, isLoading);
  // Chỉ coi là "không tồn tại" khi BE **thật sự** trả 404. Mọi thứ khác — mạng
  // chết, CORS, 500 — là lỗi tải, và báo thành "không tìm thấy" khiến một bài có
  // thật bị hiện thành trang 404, không có nút thử lại.
  const status = error instanceof ApiError ? error.status : null;
  // Tên `notFound` sẽ che mất hàm `notFound()` của `next/navigation` trong trang
  // bài, nên gọi là `missing`.
  const missing = status === 404;
  // Trạng thái thứ ba, tách khỏi `missing`: bài tồn tại nhưng là bài VIP và người
  // xem không đủ quyền. Gộp vào "lỗi tải" thì người dùng thấy nút "Thử lại" vô
  // nghĩa; gộp vào `notFound()` thì bài biến mất khỏi trang. Phải là màn riêng
  // kèm nút nâng cấp.
  const vipLocked = isVipLockedError(status, error instanceof ApiError ? error.code : null);
  return {
    problem: data ?? null,
    loading: isLoading,
    retry: mutate,
    missing,
    vipLocked,
    error: error
      ? missing
        ? "Không tìm thấy bài toán"
        : "Không tải được bài toán. Kiểm tra mạng rồi thử lại."
      : null,
  };
}
