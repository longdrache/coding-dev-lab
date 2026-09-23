"use client";

import { useEffect, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAuth } from "@clerk/nextjs";
import { API_URL, authedFetcher } from "@/lib/swr";

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
  const { getToken, isSignedIn } = useAuth();
  const { mutate } = useSWRConfig();
  const fetcher = useMemo(() => authedFetcher(getToken), [getToken]);
  const { data, isLoading } = useSWR<DashboardData>(
    isSignedIn ? DASHBOARD_KEY : null,
    fetcher,
  );

  // Tải lại khi có hoạt động mới (run/submit xong)
  useEffect(() => {
    const handler = () => mutate(DASHBOARD_KEY);
    window.addEventListener("gocode-activity-changed", handler);
    return () => window.removeEventListener("gocode-activity-changed", handler);
  }, [mutate]);

  if (isSignedIn === false) {
    return { data: null, loading: false } as const;
  }
  return { data: data ?? null, loading: isLoading };
}
