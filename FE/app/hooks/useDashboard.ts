"use client";

import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { API_URL, authedFetcher } from "@/lib/swr";
import { useSession } from "@/app/ui/AuthProvider";

export type DashboardData = {
  activityMap: Record<string, number>;
  streak: number;
  solved: { total: number; byDifficulty: Record<string, number>; slugs: string[] };
  badges: { total: number; unlocked: number; list: Array<{ id: string; name: string; desc: string; icon: string; color: string; unlocked: boolean }> };
  heatmap: Array<{ date: string; count: number; active: boolean }>;
  todayKey: string;
};

const DASHBOARD_KEY = `${API_URL}/api/progress/dashboard`;

export function useDashboard() {
  const { user, loading: sessionLoading } = useSession();
  const { mutate } = useSWRConfig();
  // Chưa đọc xong `/me` thì `user` còn `null`: key chưa bật, không gọi endpoint
  // của tài khoản trước khi biết mình là ai. Đọc xong mới bật.
  const { data, isLoading } = useSWR<DashboardData>(user ? DASHBOARD_KEY : null, authedFetcher);

  // Tải lại khi có hoạt động mới (run/submit xong)
  useEffect(() => {
    const handler = () => mutate(DASHBOARD_KEY);
    window.addEventListener("gocode-activity-changed", handler);
    return () => window.removeEventListener("gocode-activity-changed", handler);
  }, [mutate]);

  if (user === null) {
    // Còn đang đọc phiên thì `loading` phải là `true` — trả `false` sẽ khiến
    // `StreakDashboard` hiện trạng thái rỗng "chưa có gì" rồi nhảy lên dữ liệu,
    // tức nói dối người dùng về tài khoản của họ.
    return { data: null, loading: sessionLoading } as const;
  }
  return { data: data ?? null, loading: isLoading };
}
