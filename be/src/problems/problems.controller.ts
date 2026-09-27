import { Body, Controller, Get, Header, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { ProblemsService } from './problems.service.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';

@Controller('api/problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  // max-age=0: trình duyệt không giữ (SWR phía FE lo phần này), s-maxage để
  // CDN giữ. Hai response này không phụ thuộc user và đã bỏ hiddenTests nên
  // đưa vào cache chung là an toàn.
  // Lưu ý: Nest ghi header TRƯỚC khi gọi handler, nên 404 của :slug cũng
  // mang header này — CDN sẽ giữ 404 tới hết TTL. Đánh đổi đã chấp nhận:
  // bài vừa publish thấy ở route chi tiết sau tối đa 300s.
  @Get()
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  async list() {
    return this.problems.findAll();
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600')
  async get(@Param('slug') slug: string) {
    const p = await this.problems.findBySlug(slug);
    if (!p) throw new NotFoundException('Không tìm thấy bài toán');
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
    return this.problems.submit(slug, userId, languageId, sourceCode);
  }
}
