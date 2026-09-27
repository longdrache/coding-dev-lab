import { API_URL } from "./swr";

/**
 * User ở dạng công khai — đúng những gì BE trả ở `/api/auth/login`, `/me` và
 * `/refresh`. Không có trường nào của DB lọt ra ngoài, nên FE đưa thẳng vào UI
 * được mà không cần che gì thêm.
 */
export type PublicUser = {
  id: number;
  email: string;
  name: string | null;
  role: "user" | "vip" | "admin";
};

export const ME_URL = `${API_URL}/api/auth/me`;

/**
 * Đọc phiên hiện tại từ cookie httpOnly.
 *
 * **401 là trạng thái bình thường của khách**, không phải lỗi: người dùng chưa
 * đăng nhập thì `/me` trả 401 và đó là câu trả lời đúng. Vì vậy chỉ `2xx` mới
 * được coi là "có phiên", còn lại trả `null` chứ không ném — nếu ném thì mọi
 * khách đều thấy một lỗi đỏ giả tưởng là hỏng.
 */
export async function publicUser(): Promise<PublicUser | null> {
  const res = await fetch(ME_URL, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: PublicUser };
  return data.user ?? null;
}
