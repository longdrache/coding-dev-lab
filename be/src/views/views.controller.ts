import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { clientIp } from '../common/geo.ts';
import { Throttle } from '../common/throttle.guard.ts';
import { ViewsService } from './views.service.ts';

type TrackRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

// Public — FE bắn mỗi lần vào trang (fire-and-forget), throttle chống spam
@ApiTags('views')
@Controller('api/views')
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  @Post('track')
  @ApiOperation({ summary: 'Ghi lượt xem trang (fire-and-forget, IP được băm trước khi lưu)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', example: '/premium', description: 'Không phải chuỗi thì ghi `/`.' },
        userId: { type: 'number', nullable: true, example: 7, description: 'Chỉ nhận số; chuỗi thì ghi null.' },
        visitorId: { type: 'string', example: 'v-1', description: 'Dồn khách chưa đăng nhập; không phải chuỗi thì bỏ.' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '`{ ok: true }` luôn — không bao giờ ném, kể cả body rỗng.' })
  @ApiResponse({ status: 429, description: 'Quá 30 req/phút/IP.' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async track(
    @Req() req: TrackRequest,
    @Body() body: { path?: unknown; userId?: unknown; visitorId?: unknown },
  ) {
    const ip = clientIp(req.headers, req.ip);
    const path = typeof body?.path === 'string' ? body.path : '/';
    // Khách vãng lai không gửi userId (hoặc null) — cột PageView.userId nullable.
    const userId = typeof body?.userId === 'number' ? body.userId : null;
    const visitorId = typeof body?.visitorId === 'string' ? body.visitorId : undefined;
    await this.views.track(this.views.hashIp(ip), path, userId, visitorId, req.headers, ip);
    return { ok: true };
  }
}
