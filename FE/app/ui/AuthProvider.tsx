"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  RETRY_DELAY_MS,
  currentSession,
  refreshPlan,
  refreshSession,
  type PublicUser,
} from "@/lib/api";

export type { PublicUser };

type SessionState = {
  user: PublicUser | null;
  /** Chưa xác minh xong `/me` thì `true`. Riêng trạng thái "chưa đăng nhập" không phải là loading. */
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionState>({
  user: null,
  loading: true,
  refresh: async () => {},
});

/**
 * Nguồn sự thật về phiên của FE, thay `ClerkProvider`.
 *
 * Access token sống 15 phút, refresh token sống 30 ngày, nên phải **lên lịch làm
 * mới chủ động**: chờ `/me` báo 401 thì tới lúc đó người dùng đã bị coi là khách
 * dù phiên vẫn còn trong DB. `expiresIn` BE trả kèm chính là để việc này.
 *
 * Mọi quyết định (gọi endpoint nào, chờ bao lâu, 401 hay dữ liệu rác) nằm ở
 * `@/lib/api` và đã có test; file này chỉ nối timer với state.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hẹn giờ làm mới. Gán trong effect nên `loadSession`/`renew` gọi được mà không phụ thuộc render. */
  const armRef = useRef<((delayMs: number) => void) | null>(null);
  const signedInRef = useRef(false);
  /** Phiên đã chết: dừng vòng lặp cho tới lần đăng nhập/đọc phiên thành công kế tiếp. */
  const deadRef = useRef(false);
  /**
   * Số thế hệ của effect. StrictMode gọi mount → cleanup → mount trên *cùng* một
   * instance nên ref không được reset giữa hai lần; tăng số thế hệ mỗi lần mount
   * để lời gọi đang bay về biết mình đã lỗi thời và không hẹn lại timer.
   */
  const genRef = useRef(0);

  /** Đọc `/me`: đồng bộ user và lên lịch lần tới từ `expiresIn` vừa nhận. */
  const loadSession = useCallback(async () => {
    try {
      const session = await currentSession();
      signedInRef.current = session !== null;
      // Đọc được phiên là dấu hiệu phiên chết trước đó đã được thay bằng phiên mới
      // (đăng nhập lại) — mở lại vòng lặp làm mới.
      if (session) deadRef.current = false;
      setUser(session?.user ?? null);
      if (session) {
        const delay = refreshPlan(session.expiresIn);
        if (delay !== null) armRef.current?.(delay);
      }
    } catch {
      // Mất mạng/CORS hỏng nghĩa là không xác minh được phiên. Hiện "khách" vẫn
      // hơn là chặn cả trang, và không sinh thông báo đỏ giả cho một lỗi mạng.
      signedInRef.current = false;
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Làm mới bằng cookie `refresh`, rồi lên lịch lần kế tiếp. */
  const renew = useCallback(async () => {
    if (deadRef.current) return;
    const r = await refreshSession();
    if (r.kind === "retry") {
      // Lỗi tạm (mạng, 5xx) — thử lại sau, tuyệt đối không đăng xuất nhầm.
      armRef.current?.(RETRY_DELAY_MS);
      return;
    }
    if (r.kind === "expired") {
      // Phiên chết thật: dừng hẳn, không quay vòng lặp nữa — nếu không thì timer
      // sẽ thử lại mãi một phiên đã hỏng. `loadSession` sẽ mở lại khi đăng nhập.
      deadRef.current = true;
      signedInRef.current = false;
      setUser(null);
      return;
    }
    signedInRef.current = true;
    setUser(r.session.user);
    setLoading(false);
    const delay = refreshPlan(r.session.expiresIn);
    if (delay !== null) armRef.current?.(delay);
  }, []);

  useEffect(() => {
    const gen = ++genRef.current;
    const isCurrent = () => genRef.current === gen;

    const arm = (delayMs: number) => {
      if (!isCurrent()) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (isCurrent()) void renew();
      }, delayMs);
    };
    armRef.current = arm;

    // `loadSession` định nghĩa ngoài effect và setState của nó nằm sau
    // `await currentSession()` — tức là không phải setState đồng bộ trong thân
    // effect, không có cascading render. Rule không phân giải được qua ranh giới
    // `useCallback` nên báo nhầm; tắt có lý do, cùng cách `useServerSolvedSlugs`
    // và `useFavorites` đã làm.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession();

    // Tab ẩn thì trình duyệt throttle timer, nên lịch có thể trôi qua lúc ta không
    // thấy. Khi tab quay lại: bỏ lịch cũ và gọi lại `/me` để xác minh từ đầu —
    // `/me` rẻ, **không** xoay vòng refresh token, và trả `expiresIn` mới để lên
    // lịch lại cho đúng. Không gọi `/refresh` ở đây: như vậy mỗi lần chuyển tab
    // lại sẽ đốt một refresh token dù chẳng cần làm mới gì.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!signedInRef.current || deadRef.current) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      void loadSession();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
      if (armRef.current === arm) armRef.current = null;
    };
  }, [loadSession, renew]);

  return <Ctx.Provider value={{ user, loading, refresh: loadSession }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
