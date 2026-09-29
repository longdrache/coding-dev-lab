import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { AuthService, REFRESH_TTL_MS } from './auth.service.ts';
import { AuthGuard } from './auth.guard.ts';
import { readCookie } from './auth.cookies.ts';
import { GOOGLE_SCOPES, safeInternalPath } from './oauth-state.ts';
import { ACCESS_TTL_SECONDS, verifyAccessToken } from './tokens.ts';
import type { AuthenticatedRequest } from './auth.types.ts';

export const SESSION_COOKIE = 'session';
export const REFRESH_COOKIE = 'refresh';

/** Giống `admin.controller.ts`: chỉ khai phần `res` mà controller này dùng. */
type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'none' | 'lax';
  maxAge?: number;
  path?: string;
};

type CookieResponse = {
  cookie(name: string, value: string, options?: CookieOptions): unknown;
  clearCookie(name: string, options?: CookieOptions): unknown;
  /** Chỉ hai route OAuth dùng: chúng không trả JSON mà trả `302` để trình duyệt đi tiếp. */
  redirect(status: number, url: string): unknown;
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
 * `maxAge` tính bằng **mili giây**: cookie `session` sống `ACCESS_TTL_SECONDS * 1000`
 * (15 phút) và cookie `refresh` sống `REFRESH_TTL_MS` (30 ngày). Hạn thật của refresh
 * token nằm ở cột `expiresAt` ở DB, không phải ở cookie.
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
 * Một câu cho cả ba lý do từ chối (mã sai, đã hết hạn, đã dùng) — cùng logic với
 * `verify` ở trên, và cùng lý do: câu này không được phép phân biệt nguyên nhân
 * để không dò được mã nào còn sống.
 */
const RESET_DEAD = 'Mã đặt lại không hợp lệ hoặc đã hết hạn';

/**
 * `req.cookies` trước, header thô sau — đúng thứ tự `AuthGuard` dùng, và dùng chung
 * `readCookie` trong `auth.cookies.ts` nên hai route này không lệch với guard.
 */
function readRefresh(req: CookieRequest): string | undefined {
  return req.cookies?.[REFRESH_COOKIE] ?? readCookie(req.headers.cookie, REFRESH_COOKIE);
}

/** `user-agent` sai kiểu (mảng) thì bỏ trống chứ không truyền mảng xuống DB. */
function userAgent(req: AuthenticatedRequest): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

/** PKCE S256: base64url(sha256(verifier)). */
function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Đích đến sau khi đăng nhập Google luôn là **FE**, mà FE nằm ở domain khác
 * (xem docblock của `cookieOptions`: "trên production BE và FE nằm trên hai domain
 * Vercel khác nhau"). `Location: /sign-in` tương đối sẽ rơi vào domain API và
 * thành 404, nên phải ghép tuyệt đối từ `FRONTEND_URL` — cùng cách link trong mail.
 */
function frontendUrl(path: string): string {
  return `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}${path}`;
}

/**
 * Người gọi đang đăng nhập hay không, đọc **tùy chọn** từ cookie `session`.
 *
 * Không dùng `AuthGuard`: callback phải chạy được với cả khách (lần đầu bấm nút
 * Google thì chưa có cookie nào) lẫn người đã đăng nhập (để ghép Google vào đúng
 * tài khoản đó). `null` = không có phiên hoặc phiên không xác minh được — không
 * phải lỗi, vì thiếu phiên là chuyện bình thường ở route này.
 *
 * `req.cookies` trước, header thô sau: đúng thứ tự và đúng hàm `AuthGuard` dùng.
 */
async function signedInUserId(req: CookieRequest): Promise<number | null> {
  const token = req.cookies?.[SESSION_COOKIE] ?? readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  // `sub` do ta tự ký nên luôn là số nguyên dương, nhưng nó là **dữ liệu từ token**
  // nên vẫn kiểm — `Number('abc')` là `NaN` và `NaN` sẽ thành id `NaN` trong
  // truy vấn `findUnique`.
  const id = Number(claims.sub);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Số giới hạn tần suất dưới đây đều theo IP và đều **cao** có chủ ý: nền tảng cho
 * học sinh sinh viên ở Việt Nam, IP dùng chung (văn phòng, trường, tầng nhà) rất phổ
 * biến, nên chặn nhầm người thật tệ hơn là cho qua một lần spam. Chống spam thật sự
 * nằm ở xác minh email + bcrypt + giới hạn 10 phiên (`MAX_SESSIONS`), không nằm ở
 * con số này.
 */
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  /** Chỉ tạo tài khoản chưa xác minh và gửi mã, **không** cấp phiên. */
  @Post('register')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
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
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
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
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
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
  @Throttle({ default: { limit: 120, ttl: 60 * 1000 } })
  async refresh(@Req() req: CookieRequest, @Res({ passthrough: true }) res: CookieResponse) {
    const token = readRefresh(req);
    if (!token) {
      // 401 chứ không phải 200: "không có phiên" là thông tin đăng nhập sai, và
      // trả 200 sẽ khiến client coi như đã làm mới xong rồi hỏi lại mãi. Dọn cookie
      // để phiên cũ treo (access token đã hết hạn nhưng cookie vẫn còn) biến mất.
      clearSessionCookies(res);
      throw new UnauthorizedException('Không có phiên để làm mới');
    }
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

  /**
   * `forgot-password` chỉ chặn theo IP (`ThrottleGuard`); giới hạn theo chính tài
   * khoản nằm ở `AuthService.forgotPassword` vì IP dùng chung ở Việt Nam rất phổ
   * biến nên không chặn được chuyện bơm mail vào một hộp thư.
   *
   * Không `AuthGuard` và không đụng cookie: câu trả lời phải giống nhau cho mọi
   * email, còn cookie thì chỉ liên quan tới phiên đang có — mà ở đây người gọi
   * thường đã quên mật khẩu, tức không có phiên nào cả.
   */
  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  forgot(@Body() b: { email?: unknown }) {
    // Chuyển tiếp nguyên văn: mọi quyết định về việc có tồn tại hay không nằm ở
    // service, controller không được thêm hay bớt câu trả lời đó.
    return this.auth.forgotPassword(String(b?.email ?? ''));
  }

  /**
   * Nút "Gửi lại link" ở màn "kiểm tra hộp thư". Không `AuthGuard` và không đụng
   * cookie, y hệt `forgot-password`: người gọi đang ở giữa lúc đăng ký nên
   * chưa có phiên nào, và câu trả lời phải giống nhau cho mọi email.
   *
   * Trả **200 chứ không phải 409** như `register` là chủ ý: đây là hành động
   * đăng ký lại, mà `register` ném 409 vì email đã tồn tại — tức đúng cái nút bấm
   * để thoát khỏi trạng thái đó lại là nút chết.
   */
  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  resend(@Req() req: AuthenticatedRequest, @Body() b: { email?: unknown }) {
    return this.auth.resendVerification(
      String(b?.email ?? ''),
      userAgent(req),
    );
  }

  /**
   * Mã sai, hết hạn hoặc đã dùng trả 400 chứ không phải 200, đúng như route
   * `verify`: trả 200 khiến client tưởng đã đổi mật khẩu xong rồi hỏi lại mãi
   * với một mã đã chết. Không `AuthGuard` vì người dùng quên mật khẩu thì không
   * đăng nhập được, cũng không có cookie phiên nào để guard đọc.
   */
  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async reset(@Body() b: { token?: unknown; password?: unknown }) {
    const ok = await this.auth.resetPassword(String(b?.token ?? ''), String(b?.password ?? ''));
    if (!ok) throw new BadRequestException(RESET_DEAD);
    return { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' };
  }

  /**
   * Bắt đầu đăng nhập bằng Google: sinh `state` + PKCE verifier, ghi vào
   * `UserOAuthState`, rồi đẩy trình duyệt sang Google.
   *
   * **Không `AuthGuard`** — người bấm nút này thường chưa đăng nhập, nên chặn
   * cookie ở đây là khoá cửa trước mặt nút bấm và khiến tính năng chết đúng lúc
   * cần nhất. `ThrottleGuard` thì có: đây là cửa để bị dùng để spam Google.
   */
  @Get('oauth/google/start')
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async googleStart(@Query('redirect_to') redirectTo: unknown, @Res() res: CookieResponse) {
    // Chưa cấu hình thì đừng đẩy người dùng sang trang lỗi của Google với
    // `client_id` rỗng — cùng lý do `googleProfile` trả `null` thay vì ném:
    // đây là tình trạng triển khai, không phải lỗi của người dùng.
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
      return res.redirect(302, frontendUrl('/sign-in?oauth=failed'));
    }
    // Lần đầu trong hai lần kiểm `redirectTo`: lần thứ hai ở `callback`, lúc
    // đọc lại giá trị đã nằm trong DB.
    const safe = safeInternalPath(redirectTo);
    const { state, codeVerifier } = await this.auth.beginGoogleOAuth(safe);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', process.env.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    // KHÔNG dùng `prompt=select_account`: nó ép hiện danh sách tài khoản mỗi
    // lần bấm, đúng thứ không cần ở nút "Đăng nhập bằng Google".
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', pkceChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    res.redirect(302, url.toString());
    return undefined;
  }

  /**
   * Google trả kết quả về đây bằng `?code&state` (hoặc `?error` nếu người dùng
   * bấm Hủy).
   *
   * **Mọi nhánh đều trả `302` về FE, không nhánh nào ném ra ngoài** — nhưng
   * đây là điều *đã được bảo đảm*, không phải điều hiển nhiên: callback là trang
   * người dùng nhìn thấy trực tiếp, nên `500` ở đây nghĩa là màn trắng thay vì
   * một câu bảo thử lại. Ba lời gọi dưới đây đều đi tới DB nên đều **có thể
   * ném** (mất kết nối, hết thời gian chờ, `P2002`), và chỉ `googleProfile` là
   * được bọc `.catch()`; không có `try` bao quanh thì một lỗi DB hiếm gặp là
   * người dùng nhìn thấy màn trắng. `P2002` của nhánh tạo user thì bị bắt ngay
   * bên trong `linkOrCreateFromGoogle` và thành `needs-password` — tức đúng ranh
   * giới, không phải lỗi cần nuốt.
   *
   * Nhánh nào **không** cấp cookie phiên thì cũng phải nói rõ bằng mã trên URL
   * — `needs-password` và `conflict` không được gộp vào nhau.
   */
  @Get('oauth/google/callback')
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async googleCallback(
    @Req() req: CookieRequest,
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Query('error') err: unknown,
    @Res() res: CookieResponse,
  ) {
    if (err || !code) return res.redirect(302, frontendUrl('/sign-in?oauth=cancelled'));
    try {
      const consumed = await this.auth.takeGoogleState(String(state ?? ''));
      // State sai, hết hạn hoặc đã dùng: từ chối trước khi đụng tới Google.
      if (!consumed) return res.redirect(302, frontendUrl('/sign-in?oauth=expired'));
      // `googleProfile` trả `null` cho lỗi phía Google, nhưng `fetch` tới Google
      // có thể **ném** (mạng, DNS). Không bắt thì callback trả 500 và người dùng
      // thấy lỗi server thay vì câu "thử lại sau một lát".
      const profile = await this.auth
        .googleProfile(String(code), consumed.codeVerifier)
        .catch(() => null);
      if (!profile) return res.redirect(302, frontendUrl('/sign-in?oauth=failed'));

      const r = await this.auth.linkOrCreateFromGoogle(profile, await signedInUserId(req));
      if (r.kind === 'conflict') {
        return res.redirect(302, frontendUrl('/sign-in?oauth=conflict'));
      }
      if (r.kind === 'unverified') {
        return res.redirect(302, frontendUrl('/sign-in?oauth=unverified'));
      }
      if (r.kind === 'needs-password') {
        return res.redirect(
          302,
          frontendUrl(`/sign-in?oauth=exists&email=${encodeURIComponent(r.email)}`),
        );
      }
      const tokens = await this.auth.issueSessionForUserId(r.userId, userAgent(req));
      if (!tokens) return res.redirect(302, frontendUrl('/sign-in?oauth=failed'));
      setSessionCookies(res, tokens);
      // Lần thứ hai trong hai lần kiểm: giá trị này đã nằm trong DB, tức dữ liệu
      // bị sửa tay hay ghi bởi một bản cũ cũng bị chặn ở đây.
      return res.redirect(302, frontendUrl(safeInternalPath(consumed.redirectTo)));
    } catch {
      // Log lỗi **không kèm chi tiết người dùng**: đủ để biết DB/phiên hỏng ở
      // đâu mà không đổ PII lên log. Người dùng thì nhận `failed`, câu dành cho
      // cả lỗi tạm thời lẫn lỗi cấu hình, và vẫn có lối thoát bằng mật khẩu.
      this.logger.error('callback Google ném lỗi ngoài dự kiến — về /sign-in?oauth=failed');
      return res.redirect(302, frontendUrl('/sign-in?oauth=failed'));
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.auth.me(Number(req.user!.userId));
    return { user, expiresIn: ACCESS_TTL_SECONDS };
  }
}
