import { createCache, type Cache } from 'cache-manager';

/**
 * Một chỗ duy nhất khai báo **TTL** và **namespace** của mọi cache nội dung.
 *
 * Trước đây mỗi service tự hằng số TTL trong file của nó (`LIST_TTL_MS` ở
 * `problems.service.ts`, `200` rời rạc ở `progress.service.ts`). Rải vậy thì
 * không ai trả lời được "cache này để bao lâu" mà không mở đúng file service,
 * và không ai đảm bảo hai cache không tình cờ trùng key. Tập trung ở đây để
 * `app.module.ts` (TTL mặc định) và các service (TTL riêng) dùng chung một
 * nguồn sự thật.
 *
 * **TTL tính bằng mili-giây** — đây là đơn vị của `cache-manager` v6+ và cũng
 * là đơn vị `TtlCache` từng dùng, nên con số không đổi khi chuyển. Kiểm chứng
 * bằng `cache.config.spec.ts` (advance 59_999ms thì còn hit, thêm 1ms thì miss).
 */

/**
 * TTL mặc định cho `CacheModule`, áp cho **key nào không truyền TTL riêng**.
 *
 * Chọn bằng TTL **ngắn nhất** trong ba cache nội dung (60s, xem `PROBLEM_LIST_TTL_MS`)
 * chứ không phải giá trị lớn nhất. Lý do: khi có key quên truyền TTL, hậu quả
 * mong muốn là dữ liệu cũ **ít** hơn, không phải nhiều hơn — 60s là biên an toàn
 * vì không TTL nào ở đây dài hơn 60s mà lại dùng để gom lời gọi (ngoại trừ
 * `DASHBOARD_TTL_MS` = 200ms, vốn phải truyền tường minh và luôn được truyền).
 *
 * Ghi chú: `namespace` của `CacheModuleOptions` **không** có tác dụng với store
 * in-memory mặc định — Nest chỉ truyền `namespace` xuống `Keyv` khi `stores` được
 * khai báo tường minh (xem `cache.providers.js`). Nên namespace thật của cache ở
 * đây là **tiền tố trong key**, dùng qua các hàm dưới; nó không phụ thuộc store và
 * vẫn đúng khi đổi sang Redis.
 */
export const DEFAULT_CACHE_TTL_MS = 60_000;

/**
 * Danh sách bài đã publish. Đổi thường xuyên hơn (bài mới publish) nên TTL ngắn.
 * `Cache-Control` phía HTTP cũng dùng 60s cho danh sách — xem
 * `PUBLIC_LIST_CACHE` trong `problems.controller.ts`.
 */
export const PROBLEM_LIST_TTL_MS = 60_000;

/**
 * Chi tiết một bài — gần như bất biến nên để lâu hơn danh sách. Nhưng TTL **không
 * phải** lưới an toàn cho cờ VIP: `slugCache` giữ nguyên cột `isVip` và
 * `findBySlug` chấn chấn bằng đúng bản cache đó, nên admin khoá bài phải xoá cache
 * ngay (xem `ProblemsService.invalidateProblemCache`). TTL dài ở đây chỉ là biện
 * pháp tạm thời cho dữ liệu gần như bất biến.
 */
export const PROBLEM_SLUG_TTL_MS = 300_000;

/**
 * Dashboard rất ngắn, chỉ để gom các lần gọi sát nhau. Sau `POST /solve` có thể
 * hiện dữ liệu cũ tối đa 200ms — không người dùng nào nhận ra. Rút ngắn thêm thì
 * mất hết tác dụng, dài thêm thì hiện dữ liệu cũ sau khi vừa giải xong.
 */
export const DASHBOARD_TTL_MS = 200;

/**
 * Tiền tố key của từng nhóm cache. Tách theo service để một service không bao giờ
 * đụng key của service khác kể cả khi trùng tên (ví dụ slug `list` của bài không
 * được đè lên key danh sách).
 */
export const CACHE_NS = {
  problems: 'gocode:problems',
  progress: 'gocode:progress',
} as const;

/** Key danh sách bài. Một key duy nhất — danh sách không khoá theo role (xem `findAll`). */
export const problemListKey = (): string => `${CACHE_NS.problems}:list`;

/** Key chi tiết một bài. Khoá theo slug. */
export const problemSlugKey = (slug: string): string => `${CACHE_NS.problems}:slug:${slug}`;

/**
 * Key dashboard. Khoá theo `userId` — dashboard là dữ liệu riêng của từng người,
 * dùng chung một key là lộ dữ liệu chéo.
 */
export const dashboardKey = (userId: number): string =>
  `${CACHE_NS.progress}:dashboard:${userId}`;

/**
 * Đổi **TTL đã tuyên bố** thành TTL truyền cho `cache.set`.
 *
 * Lý do có hàm này thay vì truyền thẳng con số: `keyv` (lõi của cache-manager v6+)
 * đánh dấu hết hạn khi `Date.now() > expires`, với `expires = thờiĐiểmGhi + ttl`.
 * Nghĩa là entry **còn sống** tới đúng mili-giây thứ `ttl`. `TtlCache` từng dùng
 * `Date.now() >= expiresAt`, tức chết **ngay tại** mốc `ttl`. Lệch đúng 1ms.
 *
 * 1ms thì vô hại ở production (đồng hồ thật, không ai đo tới 1ms), nhưng **không**
 * vô hại ở test: các test TTL dừng **đúng** tại mốc và đòi phải miss, nên trừ 1 ở
 * đây cho khớp — thay vì nới lỏng test để cho vừa.
 *
 * Vì phép so sánh nằm trong **Keyv core** chứ không nằm trong store
 * (`keyv/dist/index.js`, hàm `get`), nên phép bù này vẫn đúng khi đổi sang
 * Vercel KV/Redis — không phải sửa lại lần nữa.
 */
export const cacheStoreTtl = (ttlMs: number): number => ttlMs - 1;

/**
 * Cache dựng tay cho trường hợp service **không** có `CACHE_MANAGER` do Nest inject
 * (test cũ dựng service bằng `new ProblemsService(db, judge0)`). Cùng store
 * in-memory mặc định, cùng TTL mặc định — nên hành vi cache không đổi.
 */
export function createLocalCache(): Cache {
  return createCache({ ttl: cacheStoreTtl(DEFAULT_CACHE_TTL_MS) });
}