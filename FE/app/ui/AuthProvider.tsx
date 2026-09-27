"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { publicUser, type PublicUser } from "@/lib/api";

export type { PublicUser };

type Session = {
  user: PublicUser | null;
  /** Chưa xác minh xong `/me` thì `true`. Riêng trạng thái "chưa đăng nhập" không phải là loading. */
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session>({
  user: null,
  loading: true,
  refresh: async () => {},
});

/**
 * Nguồn sự thật về phiên của FE, thay `ClerkProvider`.
 *
 * Gọi `/api/auth/me` **một lần** lúc khởi động. Cookie phiên là httpOnly nên JS
 * không đọc được token: không có gì để refresh bằng tay, chỉ có cookie để dựa
 * vào. `publicUser()` trả `null` khi `/me` trả 401 — đó là khách chưa đăng nhập,
 * không phải lỗi, nên không có gì hiện ra cho họ xem cả.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await publicUser());
    } catch {
      // Mất mạng/CORS hỏng nghĩa là không xác minh được phiên. Hiện "khách" vẫn
      // hơn là chặn cả trang, và không sinh thông báo đỏ giả cho một lỗi mạng.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // `refresh` định nghĩa ngoài effect và setState của nó nằm sau `await
    // publicUser()` — tức là không phải setState đồng bộ trong thân effect, không
    // có cascading render. Rule không phân giải được qua ranh giới useCallback
    // nên báo nhầm; tắt có lý do, cùng cách `useServerSolvedSlugs` và
    // `useFavorites` đã làm.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ user, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
