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
    const map = await this.activity.recordLogin(clerkId);
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
