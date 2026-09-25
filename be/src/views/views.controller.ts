import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { clientIp } from '../common/geo.ts';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { ViewsService } from './views.service.ts';

type TrackRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

// Public — FE bắn mỗi lần vào trang (fire-and-forget), throttle chống spam
@Controller('api/views')
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  @Post('track')
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async track(
    @Req() req: TrackRequest,
    @Body() body: { path?: unknown; clerkId?: unknown; visitorId?: unknown },
  ) {
    const ip = clientIp(req.headers, req.ip);
    const path = typeof body?.path === 'string' ? body.path : '/';
    const clerkId = typeof body?.clerkId === 'string' ? body.clerkId : undefined;
    const visitorId = typeof body?.visitorId === 'string' ? body.visitorId : undefined;
    await this.views.track(this.views.hashIp(ip), path, clerkId, visitorId, req.headers, ip);
    return { ok: true };
  }
}
