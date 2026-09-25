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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import { ViewsService } from '../views/views.service.ts';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { CreateProblemDto } from './dto/create-problem.dto.ts';

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
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('api/admin')
export class AdminController {
  constructor(
    private svc: AdminService,
    private views: ViewsService,
  ) {}

  @Post('login')
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() b: { email: string; password: string }, @Res({ passthrough: true }) res: CookieResponse) {
    const token = await this.svc.login(b.email, b.password);
    // Trả token trong body để admin proxy (khác domain BE) tự set cookie
    // trên domain admin; giữ Set-Cookie cho client cùng-site/local.
    // Admin (admin-*.vercel.app) và BE (be-*.vercel.app) khác site nhau nên
    // production phải SameSite=None + Secure, ngược lại browser nuốt cookie.
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 60 * 1000,
      path: '/',
    });
    return { ok: true, token };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: CookieResponse) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    res.clearCookie('admin_token', {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    });
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
}
