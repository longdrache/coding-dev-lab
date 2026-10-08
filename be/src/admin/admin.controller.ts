import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  Get,
  Req,
  Delete,
  Param,
  Put,
  Patch,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminService, ADMIN_ACCESS_TTL, ADMIN_REFRESH_TTL } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import { ViewsService } from '../views/views.service.ts';
import { Throttle } from '../common/throttle.guard.ts';
import { CreateProblemDto } from './dto/create-problem.dto.ts';
import { SetProblemVipDto } from './dto/set-problem-vip.dto.ts';

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  maxAge?: number;
  path?: string;
};

type CookieResponse = {
  cookie(name: string, value: string, options?: CookieOptions): unknown;
  clearCookie(name: string, options?: CookieOptions): unknown;
};

type QueryRequest = {
  url?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * `req.cookies` trước, header thô sau — cùng thứ tự và cùng lý do với
 * `readRefresh` ở `auth.controller.ts`: không chắc `cookie-parser` đã được mount
 * ở mọi đường vào, và route này phải chạy được khi access token đã hết hạn.
 */
function readRawCookie(header: string | string[] | undefined, name: string): string | undefined {
  if (typeof header !== 'string') return undefined;
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

type CookieRequest = QueryRequest;

@Controller('api/admin')
export class AdminController {
  constructor(
    private svc: AdminService,
    private views: ViewsService,
  ) {}

  /**
   * Thuộc tính cookie cho **cả hai** token.
   *
   * `maxAge` theo hạn thật của từng token chứ không phải một con số chung: cookie
   * `admin_token` sống lâu hơn JWT 30 phút là cookie mà trình duyệt còn giữ sau
   * khi token đã chết — mọi request sau đó 401 và admin tưởng ứng dụng hỏng.
   */
  private cookieOpts(maxAgeMs: number) {
    // Admin (admin-*.vercel.app) và BE (be-*.vercel.app) khác site nhau nên
    // production phải SameSite=None + Secure, ngược lại browser nuốt cookie.
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    return { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', maxAge: maxAgeMs, path: '/' } as const;
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() b: { email: string; password: string }, @Res({ passthrough: true }) res: CookieResponse) {
    const { token, refreshToken } = await this.svc.login(b.email, b.password);
    // Trả token trong body để admin proxy (khác domain BE) tự set cookie
    // trên domain admin; giữ Set-Cookie cho client cùng-site/local.
    res.cookie('admin_token', token, this.cookieOpts(ADMIN_ACCESS_TTL * 1000));
    res.cookie('admin_refresh', refreshToken, this.cookieOpts(ADMIN_REFRESH_TTL * 1000));
    return { ok: true, token, refreshToken, expiresIn: ADMIN_ACCESS_TTL };
  }

  /**
   * Làm mới access token từ cookie `admin_refresh`.
   *
   * **Không** `AdminGuard`, y hệt `POST /api/auth/refresh` của app chính: access
   * token hết hạn sau 30 phút là đúng lúc route này phải chạy được.
   *
   * Trả `401` (không phải `200` + `{ message }`) khi refresh token không dùng
   * được: client cần phân biệt "đăng nhập lại" với "thử lại sau", và `200` kèm
   * message sẽ khiến client coi như xong rồi hỏi lại mãi.
   */
  @Post('refresh')
  @Throttle({ default: { limit: 100, ttl: 60_000 } })
  async refresh(@Req() req: CookieRequest, @Res({ passthrough: true }) res: CookieResponse) {
    const token = req.cookies?.admin_refresh ?? readRawCookie(req.headers?.cookie, 'admin_refresh');
    const r = token ? await this.svc.refresh(token) : null;
    if (!r) {
      res.clearCookie('admin_token', { path: '/' });
      res.clearCookie('admin_refresh', { path: '/' });
      throw new UnauthorizedException('Phiên admin đã hết hạn, vui lòng đăng nhập lại');
    }
    res.cookie('admin_token', r.token, this.cookieOpts(ADMIN_ACCESS_TTL * 1000));
    res.cookie('admin_refresh', r.refreshToken, this.cookieOpts(ADMIN_REFRESH_TTL * 1000));
    return { ok: true, token: r.token, refreshToken: r.refreshToken, expiresIn: ADMIN_ACCESS_TTL };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: CookieResponse) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const attrs = { path: '/', httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' } as const;
    res.clearCookie('admin_token', attrs);
    // Xoá cookie làm mới nữa: bỏ nó thì phiên 7 ngày vẫn sống sau khi admin bấm
    // "Đăng xuất", tức đăng xuất chỉ có tác dụng trong 30 phút.
    res.clearCookie('admin_refresh', attrs);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: QueryRequest) {
    return (req as any).admin;
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  getStats() {
    return this.svc.getStats();
  }

  @Get('analytics/views')
  @UseGuards(AdminGuard)
  getViewsAnalytics() {
    return this.views.getAnalytics();
  }

  @Get('analytics/views/recent')
  @UseGuards(AdminGuard)
  getViewsRecent() {
    return this.views.getRecent();
  }

  @Get('analytics/logins')
  @UseGuards(AdminGuard)
  getLoginsAnalytics() {
    return this.svc.getLoginAnalytics();
  }

  @Get('qna')
  @UseGuards(AdminGuard)
  listQna() {
    return this.svc.listQna();
  }

  @Delete('qna/:id')
  @UseGuards(AdminGuard)
  deleteQna(@Param('id') id: string) {
    return this.svc.deleteQna(id);
  }

  @Post('qna/:id/reply')
  @UseGuards(AdminGuard)
  replyQna(@Param('id') id: string, @Body() body: { message: string }) {
    return this.svc.replyQna(id, String(body?.message ?? ''));
  }

  @Get('users')
  @UseGuards(AdminGuard)
  listUsers(@Req() req: QueryRequest) {
    const url = new URL(req.url ?? "", `http://${req.headers?.host ?? "localhost"}`);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? undefined;
    return this.svc.listUsers({ limit, offset, query: q });
  }

  @Get('submissions')
  @UseGuards(AdminGuard)
  listSubmissions(@Req() req: QueryRequest) {
    const url = new URL(req.url ?? "", `http://${req.headers?.host ?? "localhost"}`);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const problemSlug = url.searchParams.get("problemSlug") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;
    return this.svc.listSubmissions({ limit, offset, problemSlug, query: q });
  }

  @Get('problems')
  @UseGuards(AdminGuard)
  listProblems() {
    return this.svc.listProblems();
  }

  @Get('problems/:slug')
  @UseGuards(AdminGuard)
  getProblem(@Param('slug') slug: string) {
    return this.svc.getProblem(slug);
  }

  @Post('problems')
  @UseGuards(AdminGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  createProblem(@Body() dto: CreateProblemDto) {
    return this.svc.createProblem(dto);
  }

  @Delete('problems/:slug')
  @UseGuards(AdminGuard)
  deleteProblem(@Param('slug') slug: string) {
    return this.svc.deleteProblem(slug);
  }

  @Put('problems/:slug')
  @UseGuards(AdminGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  updateProblem(@Param('slug') slug: string, @Body() dto: CreateProblemDto) {
    return this.svc.updateProblem(slug, dto);
  }

  @Post('problems/:slug/approve')
  @UseGuards(AdminGuard)
  approveProblem(@Param('slug') slug: string) {
    return this.svc.approveProblem(slug);
  }

  @Post('problems/:slug/unpublish')
  @UseGuards(AdminGuard)
  unpublishProblem(@Param('slug') slug: string) {
    return this.svc.unpublishProblem(slug);
  }

  /**
   * Bật/tắt cờ VIP của một bài. `PATCH` chứ không phải `PUT` vì thân request là
   * **một phần** của bài: `PUT problems/:slug` đã chiếm chỗ "thay toàn bộ bài" và
   * nó không đụng tới `isVip`.
   *
   * `forbidNonWhitelisted: true` — khác hẳn hai route kia (cùng dùng
   * `ValidationPipe` nhưng để `false`). Ở đây body đúng **một** trường nên
   * trường lạ là dấu hiệu gọi sai chỗ, và từ chối thành 400 còn sạch hơn là im
   * lặng bỏ qua.
   */
  @Patch('problems/:slug/vip')
  @UseGuards(AdminGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  setProblemVip(@Param('slug') slug: string, @Body() dto: SetProblemVipDto) {
    return this.svc.setProblemVip(slug, dto?.isVip);
  }
}
