"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import {
  RETRY_DELAY_MS,
  commitSession,
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
 * Nguồn sự thật về phiên của FE, thay provider của nhà cung cấp danh tính cũ.
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

  // Phải nằm trong `<SWRConfig>` của app, nếu không `mutate` gọi vào đây là
  // no-op và xoá cache là xoá nhầm chỗ khác. `providers.tsx` là nơi đặt nó.
  const { mutate } = useSWRConfig();
  /** User áp dụng lần trước, để so `id` xem có phải đổi tài khoản không. */
  const lastUserRef = useRef<PublicUser | null>(null);

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

  /**
   * Đặt user, và xoá cache SWR nếu đây là lần chuyển sang tài khoản khác.
   *
   * Mọi lần đổi `user` đều phải đi qua đây — bỏ sót một chỗ là lỗ hổng rò dữ
   * liệu chéo tài khoản quay lại. Quyết định *có xoá không* và thứ tự *xoá trước
   * rồi commit* nằm trong `commitSession` vì chỗ đó test được; dòng
   * `mutate(...)` ở dưới là nối vào cache thật, và nó là dòng mà test không bảo
   * vệ được — nên nó phải là dòng duy nhất, không nhân bản.
   */
  const applyUser = useCallback(
    (next: PublicUser | null) => {
      commitSession(
        lastUserRef.current,
        next,
        () => {
          // `revalidate: false` — chỉ xoá key, không gọi lại network.
          void mutate(() => true, undefined, { revalidate: false });
        },
        (u) => {
          lastUserRef.current = u;
          setUser(u);
        },
      );
    },
    [mutate],
  );

  /** Đọc `/me`: đồng bộ user và lên lịch lần tới từ `expiresIn` vừa nhận. */
  const loadSession = useCallback(async () => {
    try {
      const session = await currentSession();
      signedInRef.current = session !== null;
      // Đọc được phiên là dấu hiệu phiên chết trước đó đã được thay bằng phiên mới
      // (đăng nhập lại) — mở lại vòng lặp làm mới.
      if (session) deadRef.current = false;
      applyUser(session?.user ?? null);
      if (session) {
        const delay = refreshPlan(session.expiresIn);
        if (delay !== null) armRef.current?.(delay);
      }
    } catch {
      // `currentSession` chỉ trả `null` khi HTTP không OK (phiên thật sự hết).
      // Tới đây là `fetch` **ném** — mạng chết, CORS, tab bị đóng giữa chừng. Xoá
      // user ở đây là đăng xuất oan: người dùng bấm F5 vài lần là rớt phiên, rồi
      // bị guard đá về trang chủ, dù mật khẩu vẫn đúng và cookie vẫn còn.
      // Giữ nguyên user đang có, chỉ ngừng báo "đang tải"; lần refresh/401 sau sẽ
      // tự đồng bộ lại. Cùng nguyên tắc với `RefreshResult` kind `'retry'`.
      // `loadSession` lúc mount thì `user` còn `null` nên hiện khách — đúng, vì
      // lúc đó chưa có gì để giữ.
    } finally {
      setLoading(false);
    }
  }, [applyUser]);

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
      applyUser(null);
      return;
    }
    signedInRef.current = true;
    // Cùng `id` sau mỗi lần làm mới token thì `shouldClearCache` trả false, nên
    // cache giữ nguyên — không mất dữ liệu đang tải mỗi 15 phút.
    applyUser(r.session.user);
    setLoading(false);
    const delay = refreshPlan(r.session.expiresIn);
    if (delay !== null) armRef.current?.(delay);
  }, [applyUser]);

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

    // Không cần `eslint-disable` cho `react-hooks/set-state-in-effect` ở đây:
    // `setUser` giờ nằm sau `commitSession` — một hàm thuần ở `@/lib/api` — nên
    // rule không còn báo nhầm nữa. Lúc đầu `setUser` nằm trực tiếp trong
    // `loadSession` và phải tắt rule có lý do, y hệt `useServerSolvedSlugs`.
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
