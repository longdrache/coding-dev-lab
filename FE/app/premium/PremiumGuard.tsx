"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Lock } from "lucide-react";
import { useSession } from "@/app/ui/AuthProvider";
import { vipLockHref } from "@/app/problem/vip-gate";

export default function PremiumGuard() {
  // `role` nằm thẳng trong `/me` (`PublicUser`) — trước đây nó nằm trong
  // `publicMetadata` của nhà cung cấp danh tính cũ.
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.role === "vip") {
      router.replace("/");
    }
  }, [loading, user, router]);

  return null;
}

/**
 * Màn khoá bài VIP — **màn khoá duy nhất** trong FE.
 *
 * Cố ý đặt ở cùng file với `PremiumGuard` thay vì dựng component thứ hai: cả hai
 * đều là "cửa Premium" và phải nói cùng một câu, cùng một nút. Hai màn khoá
 * trở thành hai bản chỗ sai phải sửa, và sẽ lệch nhau ngay lần đổi giá đầu tiên.
 *
 * `PremiumGuard` bản thân **không** dùng lại được: nó `return null` và đẩy người
 * có VIP ra khỏi trang bảng giá — chiều ngược lại, và không có nút nâng cấp.
 * Dùng lại nó ở đây sẽ tự đẩy người đọc bài VIP ra khỏi chính bài họ.
 *
 * Chỉ hiện, không quyết định: BE đã chặn ở mọi endpoint, nên đây là lớp UX, đổi
 * sai ở đây không mở được đề bài. Link nút lấy từ `vipLockHref` — hằng số, không
 * nhét slug của bài vào.
 */
export function VipLockedNotice({ title }: { title?: string }) {
  return (
    <main className="min-h-screen bg-white px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-xl py-16 text-center">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 ring-1 ring-amber-200">
          <Lock className="size-6" />
        </span>
        <h1 className="font-display text-xl font-bold text-zinc-950 sm:text-2xl">
          {title ? `${title} là bài GoCode Premium` : "Đây là bài GoCode Premium"}
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">
          Bài này nằm trong bộ 20 bài nâng cao của GoCode. Nâng cấp để xem đề bài
          đầy đủ, chạy test mẫu và nộp bài chấm trên test ẩn.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={vipLockHref("")}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            <Crown className="size-4" />
            Nâng cấp lên Premium
          </Link>
          <Link
            href="/problem"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            ← Về danh sách bài
          </Link>
        </div>
      </div>
    </main>
  );
}
