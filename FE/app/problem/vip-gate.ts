/**
 * Quyết định hiển thị phía FE cho bài VIP.
 *
 * File này **không** chứa JSX và không import gì từ React: toàn bộ quyết định
 * "ai được mở bài VIP / ai thấy dấu khoá / lỗi nào là màn khoá" nằm ở đây để
 * test được bằng `vitest` ở môi trường node (`vitest.config.ts` không bật
 * jsdom, component thì không test được). Component chỉ gọi vào đây.
 *
 * **Nguồn sự thật của quyền là BE, không phải file này.** `canOpenVipProblem`
 * chỉ dùng để *hiển thị*; BE vẫn chặn ở mọi endpoint, nên sửa sai ở đây chỉ làm
 * UI lệch chứ không mở được đề bài.
 */

/** Phải khớp `PROBLEM_VIP_ONLY_CODE` ở `be/src/problems/vip-problem.policy.ts`. */
export const PROBLEM_VIP_ONLY_CODE = "problem_vip_only";

/** Đúng bộ `PublicUser["role"]` của BE, cộng thêm `null`/`undefined` cho lúc chưa có phiên. */
export type ViewerRole = "user" | "vip" | "admin" | null | undefined;

export function canOpenVipProblem(role: ViewerRole): boolean {
  return role === "vip" || role === "admin";
}

/** Bài này có bị khoá với người đang xem không. */
export function isVipProblem(isVip: boolean, role: ViewerRole): boolean {
  return isVip && !canOpenVipProblem(role);
}

/**
 * Dấu hiệu VIP nào hiển thị trên card bài và trên trang bài.
 *
 * Một hàm duy nhất cho cả hai chỗ, vì trước đây danh sách gọi
 * `shouldShowVipLock` còn trang bài thì không hiện gì cả — hai nơi một luật là hai
 * nơi sẽ lệch nhau, và người VIP thấy danh sách sạch bóng rồi bước vào bài mới
 * biết nó là bài Premium.
 *
 * - `none` — bài thường, không hiện gì.
 * - `locked` — bài VIP mà người đang xem **không** mở được: hiện dấu khoá, kèm
 *   lối nâng cấp. Chỉ ở danh sách và ở trang bài; BE vẫn là nơi chặn thật.
 * - `owned` — bài VIP mà người đang xem **mở được**: hiện dấu hiệu tương ứng
 *   (vàng, không có khoá) để phân biệt với bài thường mà không giả vờ chặn ai.
 */
export type VipBadge = "none" | "locked" | "owned";

export function vipBadge(isVip: boolean, role: ViewerRole): VipBadge {
  if (!isVip) return "none";
  return canOpenVipProblem(role) ? "owned" : "locked";
}

/** Danh sách có hiện dấu khoá cạnh tiêu đề bài VIP không. */
export function shouldShowVipLock(isVip: boolean, role: ViewerRole): boolean {
  return vipBadge(isVip, role) === "locked";
}

/**
 * Lỗi từ BE này là "bài VIP" chứ không phải "lỗi tải".
 *
 * Phải so **cả** status lẫn mã: chỉ so status thì mọi 403 khác cũng rơi vào màn
 * khoá và người dùng bị đưa tới trả tiền cho một lỗi quyền không liên quan.
 */
export function isVipLockedError(status: number | null, code: string | null): boolean {
  return status === 403 && code === PROBLEM_VIP_ONLY_CODE;
}

/**
 * Link nút nâng cấp. Hằng số, **không** nhét slug của bài vào.
 *
 * Slug do người dùng kiểm soát; ghép nó vào link mà không mã hoá là mở đường
 * cho link giả dạng nút chính thức. Mà cần quay lại bài sau khi nâng cấp thì
 * `returnTo` phải là đường dẫn nội bộ đã kiểm tra, không phải slug thô.
 */
export function vipLockHref(slug: string): string {
  void slug;
  return "/premium";
}
