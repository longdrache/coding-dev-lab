import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { ProgressService } from './progress.service.ts';

@Controller('api/progress')
@UseGuards(ClerkAuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('dashboard')
  async dashboard(@Req() req: AuthenticatedRequest) {
    return this.progress.getDashboard(req.user!.userId);
  }

  @Get('solved')
  async solved(@Req() req: AuthenticatedRequest) {
    return this.progress.getSolvedMap(req.user!.userId);
  }

  @Get('badges')
  async badges(@Req() req: AuthenticatedRequest) {
    return this.progress.getBadges(req.user!.userId);
  }

  @Post('solve')
  async solve(
    @Req() req: AuthenticatedRequest,
    @Body() body: { slug: string; difficulty?: string },
  ) {
    const slug = String(body?.slug ?? '').trim();
    if (!slug) return { error: 'slug required' };
    return this.progress.recordSolved(req.user!.userId, slug, body?.difficulty ?? null);
  }

  @Get('favorites')
  async favorites(@Req() req: AuthenticatedRequest) {
    return this.progress.getFavorites(req.user!.userId);
  }

  @Post('favorites')
  async addFavorite(
    @Req() req: AuthenticatedRequest,
    @Body() body: { slug: string },
  ) {
    const slug = String(body?.slug ?? '').trim();
    if (!slug) return { error: 'slug required' };
    return this.progress.addFavorite(req.user!.userId, slug);
  }

  @Delete('favorites/:slug')
  async removeFavorite(@Req() req: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.progress.removeFavorite(req.user!.userId, slug);
  }
}
