import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { ProgressService } from './progress.service.ts';

@ApiTags('progress')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('api/progress')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get the progress dashboard: streak, heatmap, solved problems, and badges' })
  @ApiResponse({ status: 200, description: 'Briefly cached for 200 ms per user.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  async dashboard(@Req() req: AuthenticatedRequest) {
    return this.progress.getDashboard(Number(req.user!.userId));
  }

  @Get('solved')
  @ApiOperation({ summary: 'Get solved-problem counts (total, by difficulty, and slugs)' })
  @ApiResponse({ status: 200, description: '`{ total, byDifficulty, slugs }`.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  async solved(@Req() req: AuthenticatedRequest) {
    return this.progress.getSolvedMap(Number(req.user!.userId));
  }

  @Get('badges')
  @ApiOperation({ summary: 'Get badges (re-evaluated before returning)' })
  @ApiResponse({ status: 200, description: '`{ total, unlocked, list[] }` with an unlocked flag for each badge.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  async badges(@Req() req: AuthenticatedRequest) {
    return this.progress.getBadges(Number(req.user!.userId));
  }

  @Post('solve')
  @ApiOperation({ summary: 'Mark a problem as solved (VIP access is still required for VIP problems to prevent fabricated progress)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['slug'],
      properties: {
        slug: { type: 'string', example: 'two-sum' },
        difficulty: { type: 'string', nullable: true, example: 'Dễ' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Updated dashboard after recording progress.' })
  @ApiResponse({ status: 200, description: 'Returns `{ error: "slug required" }` if the slug is missing; does not throw.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 403, description: 'VIP access is required for this problem.' })
  async solve(
    @Req() req: AuthenticatedRequest,
    @Body() body: { slug: string; difficulty?: string },
  ) {
    const slug = String(body?.slug ?? '').trim();
    if (!slug) return { error: 'slug required' };
    return this.progress.recordSolved(
      Number(req.user!.userId),
      slug,
      body?.difficulty ?? null,
      req.user!.role,
    );
  }

  @Get('favorites')
  @ApiOperation({ summary: 'List favorite problems (newest first)' })
  @ApiResponse({ status: 200, description: '`{ total, slugs }`.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  async favorites(@Req() req: AuthenticatedRequest) {
    return this.progress.getFavorites(Number(req.user!.userId));
  }

  @Post('favorites')
  @ApiOperation({ summary: 'Add a problem to favorites' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string', example: 'two-sum' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Favorite list after adding the problem.' })
  @ApiResponse({ status: 200, description: 'Returns `{ error: "slug required" }` if the slug is missing.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  async addFavorite(
    @Req() req: AuthenticatedRequest,
    @Body() body: { slug: string },
  ) {
    const slug = String(body?.slug ?? '').trim();
    if (!slug) return { error: 'slug required' };
    return this.progress.addFavorite(Number(req.user!.userId), slug);
  }

  @Delete('favorites/:slug')
  @ApiOperation({ summary: 'Remove a problem from favorites (no-op if it is not already a favorite)' })
  @ApiParam({ name: 'slug', type: String, example: 'two-sum' })
  @ApiResponse({ status: 200, description: 'Favorite list after removing the problem.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  async removeFavorite(@Req() req: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.progress.removeFavorite(Number(req.user!.userId), slug);
  }
}
