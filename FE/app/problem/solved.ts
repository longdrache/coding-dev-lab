import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";

const STORAGE_KEY = "gocode-solved";
const EVENT_NAME = "gocode-solved-changed";
const EMPTY: string[] = [];
let cache: string[] = EMPTY;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function readSolved(): string[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string",
    );
  } catch {
    return [];
  }
}

function snapshot(): string[] {
  const fresh = readSolved();
  if (
    fresh.length !== cache.length ||
    fresh.some((slug, i) => slug !== cache[i])
  ) {
    cache = fresh;
  }
  return cache;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT_NAME, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT_NAME, callback);
  };
}

export function markSolved(slug: string): void {
  try {
    const current = new Set(readSolved());
    if (current.has(slug)) return;
    current.add(slug);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // localStorage đầy hoặc bị chặn thì bỏ qua, không vỡ app
  }
}

/** Danh sách slug bài đã giải (Accepted), đồng bộ qua các tab. */
export function useSolvedSlugs(): string[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** Slug đã giải trên server (SolvedProblem) — thấy được dù đổi trình duyệt. */
export function useServerSolvedSlugs(): string[] {
  const { getToken, isSignedIn } = useAuth();
  const [slugs, setSlugs] = useState<string[]>(EMPTY);

  useEffect(() => {
    if (!isSignedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset khi logout, cố ý đồng bộ 1 lần
      setSlugs(EMPTY);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/progress/solved`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.slugs)) {
          setSlugs(data.slugs.filter((s: unknown): s is string => typeof s === "string"));
        }
      } catch {
        // BE offline thì giữ localStorage, không vỡ app
      }
    }
    load();
    // markSolved() cũng bắn event này sau mỗi lần Accepted
    window.addEventListener(EVENT_NAME, load);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT_NAME, load);
      window.removeEventListener("focus", load);
    };
  }, [getToken, isSignedIn]);

  return slugs;
}
