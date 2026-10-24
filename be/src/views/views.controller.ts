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
  @ApiOperation({ summary: 'Record a page view (fire-and-forget; the IP address is hashed before storage)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', example: '/premium', description: 'Non-string values are recorded as `/`.' },
        userId: { type: 'number', nullable: true, example: 7, description: 'Only numeric values are accepted; strings are recorded as null.' },
        visitorId: { type: 'string', example: 'v-1', description: 'Groups unauthenticated visitors; non-string values are ignored.' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Always returns `{ ok: true }` and never throws, even for an empty request body.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded: 30 requests per minute per IP.' })
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
