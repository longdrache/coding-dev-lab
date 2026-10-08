import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from '../auth/auth.types.ts';

/**
 * Mã lỗi **ổn định** cho "bài này là bài VIP". FE so đúng chuỗi này để dựng màn
 * khoá + nút nâng cấp, nên đổi câu thì phải đổi cả hai bên cùng lúc — và không
 * được đổi chỉ một phía. `message` dưới đây là câu cho người đọc, còn `code` mới
 * là thứ máy đọc.
 */
export const PROBLEM_VIP_ONLY_CODE = 'problem_vip_only';

const PROBLEM_VIP_ONLY_MESSAGE =
  'Bài này dành cho tài khoản GoCode Premium. Nâng cấp để mở đề bài và test ẩn.';

/**
 * Đúng những trường được trả cho **bài VIP** ở payload danh sách.
 *
 * Danh sách là catalogue: đủ để vẽ hàng, tìm kiếm, lọc theo chủ đề — và không
 * đủ để làm bài. Mọi thứ khác (`description`, `examples`, `constraints`, `tests`,
 * `hiddenTests`, `starterCodes`, `timeLimit`…) đều là nội dung bài và tuyệt đối
 * không được đi cùng slug của một bài VIP.
 */
export const VIP_LIST_FIELDS = ['slug', 'title', 'difficulty', 'topic', 'isVip'] as const;

/**
 * Cột duy nhất quyết định quyền mở bài VIP: **role đã ký trong access token**
 * (`AuthGuard` / `OptionalAuthGuard` chép từ claim `role`).
 *
 * Cố ý **không** đọc `user.vipExpiresAt` ở đây. Lý do là lỗi đã từng phải sửa:
 * hạ VIP trong DB nhưng token cũ vẫn mang `role: 'vip'` và vẫn sống tới hết
 * 15 phút, còn nếu check hạn bằng tay ở controller thì mỗi controller trở thành
 * một chỗ có thể quên `roleForToken` — và chỗ quên là chỗ lọt. Đường duy nhất
 * được phép cấp quyền là `AuthService.signFor` → `roleForToken`
 * (`premium.checkAndDowngradeIfExpired`), tức role trong token luôn đúng tại
 * thời điểm phát hành.
 *
 * `admin` xem được mọi bài: admin là người duyệt nội dung, chặn họ thì admin
 * không kiểm tra được bài mình vừa publish.
 */
export function canAccessVipProblems(role: UserRole | null | undefined): boolean {
  return role === 'vip' || role === 'admin';
}

/** Bài này có bị khoá với người đang xem không. */
export function isVipProblemLocked(
  isVip: boolean | null | undefined,
  role: UserRole | null | undefined,
): boolean {
  return isVip === true && !canAccessVipProblems(role);
}

/**
 * Đọc cột `isVip` từ dữ liệu thô mà không cần ép kiểu.
 *
 * `=== true` chứ không phải truthy: cột là boolean, nhưng hàm này còn nhận dữ liệu
 * từ cache và từ db giả trong test, nơi trường có thể là chuỗi `"false"` — và
 * chuỗi đó truthy, tức một bài thường bị coi là bài VIP. Fail-closed mà không
 * cần ép `Boolean(...)` ở mọi chỗ gọi.
 */
export function readIsVipFlag(value: unknown): boolean {
  return value === true;
}

/** Ném 403 kèm mã ổn định. `never` để chỗ gọi phải `return`/`throw` hết nhánh. */
export function denyVipProblem(): never {
  throw new ForbiddenException({
    code: PROBLEM_VIP_ONLY_CODE,
    message: PROBLEM_VIP_ONLY_MESSAGE,
  });
}
export function assertVipProblemAllowed(
  isVip: boolean | null | undefined,
  role: UserRole | null | undefined,
): void {
  if (isVipProblemLocked(isVip, role)) denyVipProblem();
}

/**
 * Cắt một dòng bài VIP còn đúng allowlist ở trên.
 *
 * Dựng bằng **allowlist** chứ không phải bằng danh sách field cần xoá: bài mới
 * thêm cột (mà `hiddenTests` hôm nay chỉ là một ví dụ) thì danh sách xoá không
 * tự đi theo, còn allowlist thì mặc định là chặn.
 */
export function redactVipListRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of VIP_LIST_FIELDS) out[field] = row[field] ?? null;
  return out;
}
