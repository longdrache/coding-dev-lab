import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { SubmissionsService, type CreateSubmissionDto } from './submissions.service.ts';

@Controller('api/history')
@UseGuards(AuthGuard, ThrottleGuard)
export class SubmissionsController {
  constructor(private readonly subs: SubmissionsService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateSubmissionDto) {
    return this.subs.create(Number(req.user!.userId), body, req.user!.role);
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(Number(req.user!.userId), slug, req.user!.role);
  }

  @Get('me')
  async me(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(Number(req.user!.userId), slug, req.user!.role);
  }
}
