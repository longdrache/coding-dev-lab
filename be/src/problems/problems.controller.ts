import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { ProblemsService } from './problems.service.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';

type ResponseWithHeaders = { setHeader(name: string, value: string): unknown };

/** Bài thường: không phụ thuộc người gọi nên cache chung (CDN) vẫn an toàn. */
const PUBLIC_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
/**
 * Bài VIP: nội dung phụ thuộc role nên **không** được vào cache chung. Nếu để
 * `s-maxage` thì response trả cho một người VIP sẽ nằm trong CDN và CDN phục vụ
 * nó cho khách — tức chính chỗ khoá nội dung lại thành đường rò.
 */
const PRIVATE_CACHE = 'private, no-store';

@Controller('api/problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  // max-age=0: trình duyệt không giữ (SWR phía FE lo phần này), s-maxage để
  // CDN giữ. Danh sách **không phụ thuộc người gọi** — bài VIP bị cắt còn
  // slug/tiêu đề/cờ khoá cho mọi role — nên đưa vào cache chung là an toàn, và
  // không cần `Vary: Cookie`.
  // Lưu ý: Nest ghi header TRƯỚC khi gọi handler, nên 404 của :slug cũng
  // mang header này — CDN sẽ giữ 404 tới hết TTL. Đánh đổi đã chấp nhận:
  // bài vừa publish thấy ở route chi tiết sau tối đa 300s.
  @Get()
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  async list() {
    return this.problems.findAll();
  }

  /**
   * Chi tiết một bài.
   *
   * `OptionalAuthGuard` chứ không phải `AuthGuard`: bài thường phải mở được với
   * khách (hành vi cũ, có test e2e ghim), còn bài VIP thì chặn ở chính sách
   * `problem_vip_only`. Dùng `AuthGuard` sẽ biến "bài này cần VIP" thành "chưa
   * đăng nhập" — mất đúng thông tin để hiện nút nâng cấp.
   *
   * Header cache đặt **thủ công** vì giá trị phụ thuộc `isVip` của bài vừa tìm
   * được, không phải của route. Vẫn set header cho cả nhánh 404 để giữ nguyên
   * hành vi cũ (Nest ghi header trước khi gọi handler).
   */
  @Get(':slug')
  @UseGuards(OptionalAuthGuard)
  async get(
    @Param('slug') slug: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseWithHeaders,
  ) {
    const role = request.user?.role;
    const p = await this.problems.findBySlug(slug, role);
    if (!p) {
      res.setHeader('Cache-Control', PUBLIC_CACHE);
      throw new NotFoundException('Không tìm thấy bài toán');
    }
    // Ra được khỏi `findBySlug` nghĩa là đã qua chính sách VIP, nên nếu đây là
    // bài VIP thì response này **là** nội dung bài VIP và tuyệt đối không được
    // để vào cache dùng chung.
    res.setHeader('Cache-Control', p['isVip'] === true ? PRIVATE_CACHE : PUBLIC_CACHE);
    return p;
  }

  @Post(':slug/submit')
  @UseGuards(AuthGuard, ThrottleGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async submit(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { languageId: number; sourceCode: string },
  ) {
    const userId = Number(req.user!.userId);
    const languageId = Number(body?.languageId);
    const sourceCode = String(body?.sourceCode ?? '');
    if (!languageId || !sourceCode) throw new NotFoundException('Thiếu languageId/sourceCode');
    return this.problems.submit(slug, userId, languageId, sourceCode, req.user!.role);
  }
}
