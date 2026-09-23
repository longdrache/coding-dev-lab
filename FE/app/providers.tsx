"use client";

import { SWRConfig, type Cache } from "swr";

const CACHE_KEY = "gocode-swr-cache-v1";
const TTL_MS = 24 * 60 * 60 * 1000; // cache dùng trong 1 ngày

type StoredEntry = { data: unknown; ts: number };

// Chỉ persist API public (danh sách/chi tiết bài) — data theo tài khoản
// (dashboard, history, solved...) không lưu để tránh lệch user và cũ.
function persistable(key: string): boolean {
  return key.includes("/api/problems");
}

function loadCache(): Map<string, unknown> {
  const map = new Map<string, unknown>();
  try {
    if (typeof window === "undefined") return map;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return map;
    const now = Date.now();
    const entries = JSON.parse(raw) as Array<[string, StoredEntry]>;
    for (const [k, v] of entries) {
      if (typeof k !== "string" || !persistable(k)) continue;
      if (v && typeof v.ts === "number" && now - v.ts < TTL_MS) {
        map.set(k, { data: v.data, error: undefined, isValidating: false });
      }
    }
  } catch {
    // storage đầy/bị chặn thì chạy memory cache thường
  }
  return map;
}

function persistCache(map: Map<string, unknown>) {
  try {
    const now = Date.now();
    const entries: Array<[string, StoredEntry]> = [];
    for (const [k, v] of map.entries()) {
      // SWR v2 lưu key là URL trần (không prefix) — chỉ giữ string key
      if (typeof k !== "string" || !persistable(k)) continue;
      const state = v as { data?: unknown };
      if (state?.data === undefined) continue;
      entries.push([k, { data: state.data, ts: now }]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // quota đầy thì bỏ qua
  }
}

// Singleton: StrictMode/HMR có thể gọi provider() nhiều lần —
// phải dùng chung 1 Map, nếu không listener của Map rỗng sẽ ghi đè
// localStorage bằng "[]" lúc thoát trang.
let sharedMap: Map<string, unknown> | null = null;

function cacheProvider(): Cache {
  if (typeof window === "undefined") return new Map() as Cache;
  if (sharedMap) return sharedMap as Cache;
  const map = loadCache();
  const persist = () => persistCache(map);
  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });
  sharedMap = map;
  return map as Cache;
}

// Cache chung: có cache thì dùng luôn, không fetch lại khi mount lại
// (rời trang quay về hiện ngay, refresh trong 1 ngày cũng hiện ngay).
// Data mới vẫn về qua mutate() sau run/submit/toggle.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: cacheProvider,
        revalidateIfStale: false,
        dedupingInterval: 10_000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
