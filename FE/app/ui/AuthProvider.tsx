"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import {
  RETRY_DELAY_MS,
  commitSession,
  refreshPlan,
  refreshSessionOnce,
  resolveSession,
  sessionEndedNotice,
  type PublicUser,
} from "@/lib/api";

export type { PublicUser };

type SessionState = {
  user: PublicUser | null;
  /** Chưa xác minh xong `/me` thì `true`. Riêng trạng thái "chưa đăng nhập" không phải là loading. */
  loading: boolean;
  /**
   * Đọc lại phiên. `deliberate` = người dùng vừa bấm đăng xuất, dùng để không
   * báo "phiên đã kết thúc" cho chính hành động của họ.
   */
  refresh: (opts?: { deliberate?: boolean }) => Promise<void>;
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
  /** Câu báo cho biết phiên vừa kết thúc giữa chừng (khác đăng xuất cố ý). */
  const [notice, setNotice] = useState("");

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
  const loadSession = useCallback(
    async (opts?: { deliberate?: boolean }) => {
      // `resolveSession` tự làm mới một lần khi `/me` trả 401 — đó là chỗ sửa
      // "hết 15 phút là bị đăng xuất". Ở đây chỉ còn nối kết quả với state.
      const r = await resolveSession();
      if (r.kind === "ok") {
        signedInRef.current = true;
        // Đọc được phiên là dấu hiệu phiên chết trước đó đã được thay bằng phiên mới
        // (đăng nhập lại, hoặc chính lần tự làm mới vừa thành công) — mở lại vòng
        // lặp làm mới.
        deadRef.current = false;
        setNotice("");
        applyUser(r.session.user);
        const delay = refreshPlan(r.session.expiresIn);
        if (delay !== null) armRef.current?.(delay);
      } else if (r.kind === "expired") {
        signedInRef.current = false;
        deadRef.current = true;
        // Chỉ nói khi phiên chết **giữa chừng** và không phải do chính người dùng
        // bấm đăng xuất — quyết định này thuộc `sessionEndedNotice` để test được.
        setNotice(sessionEndedNotice(user, r.kind, opts?.deliberate === true) ?? "");
        applyUser(null);
      }
      // `retry`: lỗi mạng hoặc 5xx. `resolveSession` đã không ném, nên tới đây
      // ta **giữ nguyên** user đang có và chỉ ngừng báo "đang tải"; lần refresh/401
      // sau sẽ tự đồng bộ lại. Xoá user ở nhánh này là đăng xuất oan: người dùng
      // bấm F5 vài lần là rớt phiên, rồi bị guard đá về trang chủ, dù mật khẩu vẫn
      // đúng và cookie vẫn còn.
      setLoading(false);
    },
    [applyUser, user],
  );

  /** Làm mới bằng cookie `refresh`, rồi lên lịch lần kế tiếp. */
  const renew = useCallback(async () => {
    if (deadRef.current) return;
    // `refreshSessionOnce`: nếu đúng lúc này `loadSession` đang bay thì hai
    // chỗ dùng chung **một** request refresh, không phải hai.
    const r = await refreshSessionOnce();
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
      setNotice(sessionEndedNotice(user, r.kind) ?? "");
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
  }, [applyUser, user]);

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
    // `/me` rẻ, và trả `expiresIn` mới để lên lịch lại cho đúng.
    //
    // Gọi `/me` chứ không gọi thẳng `/refresh` là chủ ý: **hầu hết** lần quay lại
    // tab thì access token còn hạn, và mỗi lần `/refresh` là một lần xoay vòng
    // token vô ích. Nhưng nếu tab bị treo quá mốc 15 phút thì `/me` trả 401, và
    // `resolveSession` sẽ tự làm mới **một lần** — đúng một lần, không hơn.
    // Trước đây nhánh này gọi `/me` rồi coi 401 là hết phiên, tức đóng app hơn
    // 15 phút rồi quay lại là bị đá ra khỏi tài khoản dù cookie `refresh` còn hạn.
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

  return (
    <Ctx.Provider value={{ user, loading, refresh: loadSession }}>
      {/*Chỉ hiện khi phiên chết giữa chừng (hết 30 ngày / bị gỡ phiên), không
        hiện lúc hết 15 phút — ca đó `resolveSession` đã tự làm mới nên người
        dùng không hề thấy gì. Không hiện lúc đăng xuất cố ý, vì câu do
        `AccountMenu` báo đã đủ. */}
      {notice && (
        <p
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
        >
          {notice}
        </p>
      )}
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
