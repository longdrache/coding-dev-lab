import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types.ts';
import { readCookie } from './auth.cookies.ts';
import { verifyAccessToken } from './tokens.ts';

/**
 * Bản "đăng nhập nếu có" của `AuthGuard`: có token hợp lệ thì gắn `req.user`,
 * không có thì coi như khách và **vẫn cho qua**.
 *
 * Vì sao cần: `GET /api/problems/:slug` phải phân biệt ba trạng thái — bài
 * thường thì khách đọc được (hành vi cũ, có test e2e ghim), bài VIP thì chỉ
 * `vip`/`admin` mới đọc được. `AuthGuard` chỉ biết trả lời có/không nên nó ném
 * 401 và màn bài VIP của khách hoá thành "chưa đăng nhập" — mất đúng thông tin
 * cần hiện (nút nâng cấp).
 *
 * **Không** phải chỗ để tra hạn VIP: `role` chỉ đọc từ claim đã ký, nên hạ VIP
 * trong DB thì token cũ vẫn sống tới hết 15 phút — đúng như mọi route khác. Xem
 * `vip-problem.policy.ts`.
 *
 * Thứ tự đọc token phải **giống hệt** `AuthGuard` (cookie `session` đã parse →
 * header `Cookie` thô → `Bearer`); lệch một chỗ thì cùng một người sẽ được coi là
 * khách ở endpoint này và là thành viên ở endpoint kia.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest & {
      cookies?: Record<string, string>;
    }>();
    const header = req.headers.cookie;
    const authorization = req.headers.authorization;
    const bearer =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : undefined;

    const token = req.cookies?.session ?? readCookie(header, 'session') ?? bearer;
    const refresh = req.cookies?.refresh ?? readCookie(header, 'refresh');
    if (refresh) req.refreshToken = refresh;

    // Không token, token rác, token sai khoá, cookie hỏng dấu phần trăm: tất cả
    // đều là "khách". Ném ở đây là biến lỗi cookie hỏng thành 401 cho cả bài
    // thường — tức một lần trình duyệt gửi cookie bẩn là mất sạch danh sách bài
    // công khai. Chặn bài VIP không cần guard này: nó do chính sách
    // `problem_vip_only` lo, và chính sách đó **fail-closed** vì không có
    // `req.user` nghĩa là không phải vip.
    if (!token) return true;
    const claims = await verifyAccessToken(token);
    if (!claims) return true;

    req.user = { userId: claims.sub, role: claims.role, roles: [claims.role] };
    return true;
  }
}
