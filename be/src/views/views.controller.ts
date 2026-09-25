import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
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
    @Body() body: { path?: unknown; clerkId?: unknown },
  ) {
    const forwarded = req.headers?.['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
    const ip = first || req.ip || 'unknown';
    const path = typeof body?.path === 'string' ? body.path : '/';
    const clerkId = typeof body?.clerkId === 'string' ? body.clerkId : undefined;
    await this.views.track(this.views.hashIp(ip), path, clerkId);
    return { ok: true };
  }
}
