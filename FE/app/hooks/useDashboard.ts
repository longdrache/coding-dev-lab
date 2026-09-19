"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type DashboardData = {
  activityMap: Record<string, number>;
  streak: number;
  solved: { total: number; byDifficulty: Record<string, number>; slugs: string[] };
  badges: { total: number; unlocked: number; list: Array<{ id: string; name: string; desc: string; icon: string; color: string; unlocked: boolean }> };
  heatmap: Array<{ date: string; count: number; active: boolean }>;
  todayKey: string;
};

export function useDashboard() {
  const { getToken, isSignedIn } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/progress/dashboard`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as DashboardData;
        if (!cancelled) setData(json);
      } catch {
        // giữ data cũ
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const handler = () => load();
    window.addEventListener("gocode-activity-changed", handler);
    window.addEventListener("focus", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("gocode-activity-changed", handler);
      window.removeEventListener("focus", handler);
    };
  }, [getToken, isSignedIn]);

  return { data, loading };
}
