import AuthForm from "@/app/ui/AuthForm";
import AuthShell from "@/app/ui/AuthShell";
import { oauthMessage, safeRedirect } from "@/lib/auth-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập GoCode để lưu streak, lịch sử nộp bài và huy hiệu.",
  openGraph: { title: "Đăng nhập | GoCode" },
};

/**
 * `?redirect_url=` là nơi người dùng định tới trước khi bị chặn — ví dụ mở
 * `/problem/two-sum` thì `app/problem/page.tsx` đẩy sang
 * `/sign-in?redirect_url=/problem/two-sum`. Trước đó tham số này được **gửi đi
 * nhưng không ai đọc**, nên đăng xong mất luôn bài đang định làm.
 *
 * Đọc ở server component rồi truyền xuống, **không** dùng `useSearchParams`:
 * Next 16 yêu cầu bọc `useSearchParams` trong `Suspense` khi build, sẽ làm
 * `next build` hỏng. `safeRedirect` loại URL ngoài (open redirect).
 *
 * `?oauth=` đọc y hệt, và cùng lý do: khi vòng Google hỏng, BE `302` về đây
 * kèm mã lỗi (`auth.controller.ts:386,390,397,401,404,409,413,423`). Đọc thẳng
 * `window.location.search` trong `AuthForm` như một bản brief Task 5 gợi ý
 * sẽ sinh **hydration mismatch**: server render ra form không có dòng cảnh
 * báo, client lại thêm vào — React ghi cảnh báo lệch DOM trong console. Đọc
 * ở đây thì câu đó có mặt ngay trong HTML do server gửi, hiện ra trước cả khi
 * JS chưa kịp chạy.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[]; oauth?: string | string[] }>;
}) {
  const { redirect_url, oauth } = await searchParams;
  const redirectTo = safeRedirect(Array.isArray(redirect_url) ? redirect_url[0] : redirect_url);
  // `oauth` có thể là mảng khi người dùng gõ `?oauth=a&oauth=b`; `oauthMessage`
  // trả `null` cho mọi thứ không phải mã BE biết, nên mã lạ chỉ bị bỏ qua chứ
  // không in `undefined` ra thẻ.
  const oauthNotice = oauthMessage(Array.isArray(oauth) ? oauth[0] : oauth);

  return (
    <AuthShell title="Chào mừng trở lại sân luyện.">
      <AuthForm mode="signin" redirectTo={redirectTo} oauthNotice={oauthNotice} />
    </AuthShell>
  );
}
