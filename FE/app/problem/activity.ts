import { useEffect, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAuth } from "@clerk/nextjs";
import { authedFetcher } from "@/lib/swr";

export type DayActivity = {
  key: string;
  label: string;
  count: number;
  active: boolean;
  isToday: boolean;
  isFuture: boolean;
};

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const EMPTY_MAP: Record<string, number> = {};
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const EVENT_NAME = "gocode-activity-changed";

export function dateKey(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function parseKey(key: string): Date {
  const [day, month, year] = key.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day));
}

async function authedFetch(
  path: string,
  getToken: () => Promise<string | null>,
  init?: RequestInit,
) {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Activity API ${res.status}`);
  return res.json() as Promise<{ map: Record<string, number> }>;
}

/** Ghi nhận 1 lượt hoạt động cho hôm nay (gọi khi chạy/nộp xong). */
export async function recordActivity(
  getToken: () => Promise<string | null>,
): Promise<Record<string, number> | null> {
  try {
    const data = await authedFetch("/api/activity/run", getToken, {
      method: "POST",
    });
    window.dispatchEvent(new Event(EVENT_NAME));
    return data.map;
  } catch {
    return null;
  }
}

/** Đăng nhập trong ngày là tính streak, không cần làm bài. */
export async function recordLogin(
  getToken: () => Promise<string | null>,
): Promise<Record<string, number> | null> {
  try {
    const data = await authedFetch("/api/activity/login", getToken, {
      method: "POST",
    });
    window.dispatchEvent(new Event(EVENT_NAME));
    return data.map;
  } catch {
    return null;
  }
}

/** Số ngày liên tiếp có hoạt động (đăng nhập là tính, không cần chạy). */
export function calcStreak(map: Record<string, number>): number {
  let streak = 0;
  const cursor = new Date();
  if (!(dateKey(cursor) in map)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dateKey(cursor) in map) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 7 ngày T2–CN của tuần cần xem (offset 0 = tuần này, -1 = tuần trước...). */
export function buildWeek(
  map: Record<string, number>,
  offset = 0,
): DayActivity[] {
  const now = new Date();
  const todayKey = dateKey(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const key = dateKey(date);
    return {
      key,
      label: DAY_LABELS[i],
      count: map[key] ?? 0,
      active: key in map,
      isToday: key === todayKey,
      isFuture: parseKey(key) > parseKey(todayKey),
    };
  });
}

/** Map ngày → lượt chạy, đồng bộ qua DB Neon, an toàn hydration. */
export function useActivityMap(): Record<string, number> {
  const { getToken, isSignedIn } = useAuth();
  const { mutate } = useSWRConfig();
  const fetcher = useMemo(() => authedFetcher(getToken), [getToken]);
  const key = isSignedIn ? `${API_URL}/api/activity/me` : null;
  const { data } = useSWR<{ map: Record<string, number> }>(key, fetcher);

  useEffect(() => {
    const handler = () => {
      if (key) mutate(key);
    };
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("focus", handler);
    };
  }, [key, mutate]);

  if (isSignedIn === false) return EMPTY_MAP;
  return data?.map ?? EMPTY_MAP;
}
