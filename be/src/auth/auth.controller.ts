import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { AuthService, REFRESH_TTL_MS } from './auth.service.ts';
import { AuthGuard, readCookie } from './auth.guard.ts';
import { ACCESS_TTL_SECONDS } from './tokens.ts';
import type { AuthenticatedRequest } from './auth.types.ts';

export const SESSION_COOKIE = 'session';
export const REFRESH_COOKIE = 'refresh';

/** Giống `admin.controller.ts:21-32`: chỉ khai phần `res` mà controller này dùng. */
type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'none' | 'lax' | 'strict';
  maxAge?: number;
  path?: string;
};

type CookieResponse = {
  cookie(name: string, value: string, options?: CookieOptions): unknown;
  clearCookie(name: string, options?: CookieOptions): unknown;
};

/**
 * Cùng quy ước với `admin.controller.ts:55` và `admin.service.ts:94`: trên Vercel
 * `NODE_ENV` không phải lúc nào cũng được set, mà cookie cross-site mà không
 * `SameSite=None; Secure` thì browser nuốt mất, tức mọi người bị đăng xuất.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

function cookieOptions(maxAgeMs: number) {
  const prod = isProduction();
  return {
    httpOnly: true,
    sameSite: (prod ? 'none' : 'lax') as 'none' | 'lax',
    secure: prod,
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * `httpOnly` để JS không đọc được token khi XSS; `path: '/'` vì FE và BE khác domain
 * nhưng dùng chung một đường gốc. Ở production BE và FE nằm trên hai domain Vercel
 * khác nhau nên cookie là cross-site: buộc phải `SameSite=None; Secure`, nếu không
 * browser sẽ không gửi cookie nào.
 *
 * `maxAge` của cookie `session` là `ACCESS_TTL_SECONDS` và của `refresh` là
 * `REFRESH_TTL_MS`; hạn thật của refresh token nằm ở cột `expiresAt` ở DB.
 */
function setSessionCookies(res: CookieResponse, tokens: { accessToken: string; refreshToken: string }): void {
  res.cookie(SESSION_COOKIE, tokens.accessToken, cookieOptions(ACCESS_TTL_SECONDS * 1000));
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_TTL_MS));
}

/**
 * Chỉ `path` là đủ để xoá: theo RFC 6265 §5.3 trình duyệt khớp cookie cần xoá theo
 * `name` + `domain` + `path`, các thuộc tính còn lại của `Set-Cookie` bị bỏ qua.
 * Thiếu `path` thì `Set-Cookie` ghi đè cookie cũ ở path khác và người dùng vẫn
 * đăng nhập được — đúng cái lỗi "bấm đăng xuất mà vẫn còn phiên".
 */
function clearSessionCookies(res: CookieResponse): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

type CookieRequest = AuthenticatedRequest & { cookies?: Record<string, string> };

/**
 * `req.cookies` trước, header thô sau — đúng thứ tự `AuthGuard` dùng, và dùng chung
 * `readCookie` nên hai route này không lệch với guard (xem `auth.guard.ts:23`).
 */
function readRefresh(req: CookieRequest): string | undefined {
  return req.cookies?.[REFRESH_COOKIE] ?? readCookie(req.headers.cookie, REFRESH_COOKIE);
}

/** `user-agent` sai kiểu (mảng) thì bỏ trống chứ không truyền mảng xuống DB. */
function userAgent(req: AuthenticatedRequest): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Chỉ tạo tài khoản chưa xác minh và gửi mã, **không** cấp phiên. */
  @Post('register')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  register(@Req() req: AuthenticatedRequest, @Body() b: { email?: unknown; password?: unknown }) {
    return this.auth.register(
      String(b?.email ?? ''),
      String(b?.password ?? ''),
      userAgent(req),
    );
  }

  /**
   * `@Query` chứ không phải `@Param`: hợp đồng là `GET /api/auth/verify?token=`
   * (spec mục "Hợp đồng API") vì link trong mail trỏ tới `${FRONTEND_URL}/sign-up?token=`.
   * `@Param` chỉ đọc path param nên với route `verify` không có `/:token` thì nó
   * luôn ra `undefined` và không mã xác nhận nào xác minh được.
   */
  @Get('verify')
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  async verify(
    @Query('token') token: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const r = await this.auth.verifyEmail(String(token ?? ''), userAgent(req));
    // Mã sai, hết hạn hoặc đã dùng: 400 (dữ liệu sai) chứ không phải 200 — nếu 200
    // thì client không phân biệt được "xác minh xong" với "link chết".
    if (!r) throw new BadRequestException('Mã xác nhận không hợp lệ hoặc đã hết hạn');
    setSessionCookies(res, r);
    return { user: r.user, expiresIn: ACCESS_TTL_SECONDS };
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  async login(
    @Req() req: AuthenticatedRequest,
    @Body() b: { email?: unknown; password?: unknown },
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const r = await this.auth.login(
      String(b?.email ?? ''),
      String(b?.password ?? ''),
      userAgent(req),
    );
    setSessionCookies(res, r);
    return { user: r.user, expiresIn: ACCESS_TTL_SECONDS };
  }

  /**
   * Không dùng `AuthGuard`: access token hết hạn sau 15 phút mà người dùng vẫn phải
   * làm mới được phiên 30 ngày, nên chỉ cần cookie `refresh`.
   */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  async refresh(@Req() req: CookieRequest, @Res({ passthrough: true }) res: CookieResponse) {
    const token = readRefresh(req);
    if (!token) return { message: 'Không có phiên để làm mới.' };
    const r = await this.auth.refresh(token, userAgent(req));
    // Token không dùng được nữa (thu hồi, hết hạn, xoay vòng quá đệm 30 giây) thì
    // dọn cookie để client khỏi gửi lại một token chết mãi.
    if (!r) {
      clearSessionCookies(res);
      return { message: 'Phiên đã hết hạn, vui lòng đăng nhập lại.' };
    }
    setSessionCookies(res, r);
    return { user: r.user, expiresIn: ACCESS_TTL_SECONDS };
  }

  /**
   * Cũng không dùng `AuthGuard`, vì lý do của nó (`req.refreshToken` chỉ được guard
   * gán) chính là thứ ta cần: đăng xuất phải xoá được dòng phiên trong DB. Nếu chỉ
   * tin `req.refreshToken` mà không đọc cookie, mọi lần đăng xuất đều là no-op và
   * token vẫn sống tới hạn 30 ngày.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: CookieRequest, @Res({ passthrough: true }) res: CookieResponse) {
    const token = req.refreshToken ?? readRefresh(req);
    if (token) await this.auth.logout(token);
    clearSessionCookies(res);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logoutAll(@Req() req: AuthenticatedRequest) {
    // `AuthenticatedUser.userId` là **chuỗi** còn `logoutAll` nhận `number`.
    await this.auth.logoutAll(Number(req.user!.userId));
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.auth.me(Number(req.user!.userId));
    return { user, expiresIn: ACCESS_TTL_SECONDS };
  }
}
