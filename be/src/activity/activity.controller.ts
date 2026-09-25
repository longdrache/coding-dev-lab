import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { ActivityService } from './activity.service.ts';

@Controller('api/activity')
@UseGuards(ClerkAuthGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Post('login')
  async login(@Req() req: AuthenticatedRequest) {
    const clerkId = req.user!.userId;
    const headers = (req as unknown as { headers?: Record<string, string | string[] | undefined> }).headers ?? {};
    const forwarded = headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim())
      ?? (req as unknown as { ip?: string }).ip
      ?? 'unknown';
    // Vercel tự gắn quốc gia (miễn phí, không cần GeoIP DB); local thì trống
    const rawCountry = headers['x-vercel-ip-country'];
    const country = Array.isArray(rawCountry) ? rawCountry[0] : rawCountry;
    const map = await this.activity.recordLogin(clerkId, { ip, country });
    return { map };
  }

  @Post('run')
  async run(@Req() req: AuthenticatedRequest) {
    const clerkId = req.user!.userId;
    const map = await this.activity.recordRun(clerkId);
    return { map };
  }

  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const clerkId = req.user!.userId;
    const map = await this.activity.getMap(clerkId);
    return { map };
  }
}
