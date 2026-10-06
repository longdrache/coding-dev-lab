import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '../common/throttle.guard.ts';
import { ProblemsService } from './problems.service.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { canAccessVipProblems } from './vip-problem.policy.ts';

type ResponseWithHeaders = { setHeader(name: string, value: string): unknown };

/** Bài thường: không phụ thuộc người gọi nên cache chung (CDN) vẫn an toàn. */
const PUBLIC_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
/**
 * Danh sách: cùng nguyên tắc với {@link PUBLIC_CACHE} nhưng TTL ngắn hơn, vì
 * danh sách đổi thường xuyên hơn chi tiết (bài mới publish).
 */
const PUBLIC_LIST_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
/**
 * Bài VIP: nội dung phụ thuộc role nên **không** được vào cache chung. Nếu để
 * `s-maxage` thì response trả cho một người VIP sẽ nằm trong CDN và CDN phục vụ
 * nó cho khách — tức chính chỗ khoá nội dung lại thành đường rò.
 *
 * Cùng lý do áp cho **danh sách** ở người có VIP: xem `list()` bên dưới.
 */
const PRIVATE_CACHE = 'private, no-store';

@Controller('api/problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  /**
   * Danh sách bài — payload **phụ thuộc người gọi**: người có VIP nhận mô tả đầy
   * đủ của bài VIP (đúng như `GET /:slug`), người khác chỉ nhận tiêu đề + cờ
   * khoá, tuyệt đối không có mô tả.
   *
   * Nhánh nào có mô tả thì **không** được đi vào cache dùng chung — CDN giữ
   * response đầy đủ rồi phục vụ nó cho khách là đúng lỗi rò nội dung VIP. Nên
   * `@Header` tĩnh không dùng được ở đây, phải set tay theo người gọi.
   *
   * Tiêu chí chọn header là `canAccessVipProblems(role)` — **cùng đúng cái**
   * mà `findAll` dùng để quyết định cắt. Một tiêu chí duy nhất cho cả hai quyết
   * định nên chúng không thể lệch nhau: có mô tả ⇔ `private, no-store`. Chọn
   * fail-closed — kể cả lúc DB còn chưa có bài VIP nào thì vẫn `private`, đánh
   * đổi mất lợi ích CDN chứ không đánh đổi an toàn.
   *
   * Header set **trước** khi đọc service, nên lỗi 500 giữa chừng cũng mang header
   * đúng của nhánh đó. `OptionalAuthGuard` để lấy role từ claim trong access
   * token; khách không token vẫn qua với 200 như cũ. Không cần `Vary: Cookie`:
   * nhánh có mô tả vốn đã không nằm trong cache chung.
   */
  @Get()
  @UseGuards(OptionalAuthGuard)
  async list(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseWithHeaders,
  ) {
    const role = request.user?.role;
    res.setHeader('Cache-Control', canAccessVipProblems(role) ? PRIVATE_CACHE : PUBLIC_LIST_CACHE);
    return this.problems.findAll(role);
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
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 100, ttl: 60_000 } })
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
