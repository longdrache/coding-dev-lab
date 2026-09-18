import { useSyncExternalStore } from "react";

const STORAGE_KEY = "gocode-solved";
const EVENT_NAME = "gocode-solved-changed";
const EMPTY: string[] = [];
let cache: string[] = EMPTY;

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
