"use client";

import { SWRConfig, type Cache } from "swr";
import ViewTracker from "./ui/ViewTracker";
import { AuthProvider } from "./ui/AuthProvider";

/**
 * Cache SWR chỉ sống trong RAM: **không** persist xuống `localStorage` nữa.
 *
 * Trước đây danh sách bài được persist (`gocode-swr-cache-v2`, 24h) với lý do
 * đúng: BE cắt bài VIP còn slug/tiêu đề/độ khó/chủ đề/cờ khoá cho **mọi** role,
 * nên payload không phụ thuộc người xem và ghi ra đĩa là vô hại. Danh sách nay
 * **có** phụ thuộc người xem — người có VIP nhận mô tả đầy đủ của bài VIP — nên
 * bản ghi lại từ tài khoản VIP sẽ hiện lại cho người kế tiếp mở app trên cùng
 * trình duyệt: đăng xuất chỉ xoá cache trong RAM qua `mutate` chứ không xoá
 * `localStorage`, còn hạ VIP giữa chừng không phải đổi tài khoản nên
 * `commitSession` không kịp xoá. Chi tiết bài vốn đã không persist vì đúng lý
 * do này; giờ danh sách rơi vào cùng nhóm đó.
 *
 * Xoá hẳn cơ chế persist thay vì để một nhánh chết: đoạn code ghi `localStorage`
 * mà không bao giờ ghi được gì là chỗ dễ bị "sửa cho chạy" lại về sau, và lần
 * sửa đó sẽ mở đúng lỗ rò này.
 *
 * Hệ quả được chấp nhận: refresh trang thì SWR refetch thay vì hiện ngay từ đĩa.
 * `/problem` vẫn server-render sẵn danh sách và truyền làm `fallbackData` nên
 * lần paint đầu vẫn có dữ liệu, không chớp skeleton.
 */
// Singleton: StrictMode/HMR có thể gọi provider() nhiều lần — phải dùng chung
// một Map thì các lần mount sau gặp đúng cache, không tự dựng Map rỗng mới.
let sharedMap: Cache | null = null;

function cacheProvider(): Cache {
  if (typeof window === "undefined") return new Map() as Cache;
  if (sharedMap) return sharedMap as Cache;
  sharedMap = new Map() as Cache;
  return sharedMap as Cache;
}

// Cache chung: có cache thì dùng luôn, không fetch lại khi mount lại
// (rời trang quay về hiện ngay).
// Data mới vẫn về qua mutate() sau run/submit/toggle.
//
// `AuthProvider` nằm trong `<SWRConfig>` (và bao cả `ViewTracker`) vì hai lý do,
// cùng bắt buộc với nhau:
//  1. Nó phải dùng `useSWRConfig()` **của app** để xoá cache khi đổi tài khoản.
//     Nếu nằm ngoài `<SWRConfig>` thì `useSWRConfig()` trả config mặc định, và
//     `mutate` gọi vào đó là no-op — xoá cache là xoá nhầm chỗ khác.
//  2. `ViewTracker` cần `useSession()`, nên nó phải nằm trong `AuthProvider`.
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
      <AuthProvider>
        {children}
        <ViewTracker />
      </AuthProvider>
    </SWRConfig>
  );
}
