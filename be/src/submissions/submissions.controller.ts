import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { SubmissionsService, type CreateSubmissionDto } from './submissions.service.ts';

@Controller('api/history')
@UseGuards(ClerkAuthGuard)
export class SubmissionsController {
  constructor(private readonly subs: SubmissionsService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateSubmissionDto) {
    return this.subs.create(req.user!.userId, body);
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(req.user!.userId, slug);
  }

  @Get('me')
  async me(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(req.user!.userId, slug);
  }
}
