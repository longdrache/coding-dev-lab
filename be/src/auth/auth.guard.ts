import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types.ts';
import { verifyAccessToken } from './tokens.ts';

/**
 * Đọc một cookie từ header `Cookie` thô. Dự án không cài `cookie-parser`
 * (xem `admin.guard.ts:18-28`) nên phải tự tách, và phải tách **giống hệt**
 * cookie-parser: cắt theo `;`, cắt ở dấu `=` đầu tiên, trim hai đầu, rồi mới
 * `decodeURIComponent` — nếu không, cùng một request mà có `req.cookies` thì
 * lọt, không có thì không.
 *
 * Tên cookie so sánh nguyên văn sau khi tách, không dựng `RegExp` động từ tên
 * cookie và không dùng `includes`, nên `mysession` hay `session_id` không bao
 * giờ bị nhận nhầm là `session`. `decodeURIComponent` ném `URIError` với chuỗi
 * `%` hỏng, nên bắt lại và trả giá trị thô: để `verifyAccessToken` từ chối,
 * thay vì làm sập cả request thành 500.
 */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (typeof header !== 'string') return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

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
