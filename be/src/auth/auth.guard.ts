import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types.ts';
import { readCookie } from './auth.cookies.ts';
import { verifyAccessToken } from './tokens.ts';

/**
 * Đọc cookie `session` (và đọc kèm cookie `refresh` thô cho `logout`) bằng
 * `readCookie` trong `auth.cookies.ts` — cùng hàm `AuthController` dùng cho cookie
 * `refresh`. Hai bản parse lệch nhau nghĩa là cookie guard đọc được thì `refresh`
 * lại không, tức người dùng bị kẹt không làm mới được phiên.
 */
@Injectable()
export class AuthGuard implements CanActivate {
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

    // Thứ tự là hợp đồng: cookie `session` httpOnly là nguồn sự thật cho trình
    // duyệt, header `Cookie` thô là đường dự phòng, `Bearer` dành cho client
    // API. Không cookie nào thì mới tới Bearer.
    const token = req.cookies?.session ?? readCookie(header, 'session') ?? bearer;
    if (!token) throw new UnauthorizedException('Thiếu phiên đăng nhập');

    const claims = await verifyAccessToken(token);
    if (!claims) throw new UnauthorizedException('Phiên không hợp lệ hoặc đã hết hạn');

    // `roles` phải chứa `role`: `RolesGuard` đọc `request.user?.roles`, còn
    // `premium.controller.ts` đọc `request.user?.role`.
    const role = claims.role;
    req.user = { userId: claims.sub, role, roles: [role] };

    // `logout` cần refresh token thô của chính thiết bị này để xoá đúng dòng
    // phiên; access token không mang id phiên nên không lấy được từ chỗ khác.
    const refresh = req.cookies?.refresh ?? readCookie(header, 'refresh');
    if (refresh) req.refreshToken = refresh;

    return true;
  }
}
