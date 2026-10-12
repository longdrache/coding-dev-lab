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
  @ApiOperation({ summary: 'Dashboard tiến độ: streak, heatmap, solved, badges' })
  @ApiResponse({ status: 200, description: 'Cache ngắn 200ms theo user.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async dashboard(@Req() req: AuthenticatedRequest) {
    return this.progress.getDashboard(Number(req.user!.userId));
  }

  @Get('solved')
  @ApiOperation({ summary: 'Bản đồ bài đã giải (tổng + theo độ khó + slugs)' })
  @ApiResponse({ status: 200, description: '`{ total, byDifficulty, slugs }`.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async solved(@Req() req: AuthenticatedRequest) {
    return this.progress.getSolvedMap(Number(req.user!.userId));
  }

  @Get('badges')
  @ApiOperation({ summary: 'Huy hiệu (đánh giá lại trước khi trả)' })
  @ApiResponse({ status: 200, description: '`{ total, unlocked, list[] }` kèm cờ unlocked từng huy hiệu.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async badges(@Req() req: AuthenticatedRequest) {
    return this.progress.getBadges(Number(req.user!.userId));
  }

  @Post('solve')
  @ApiOperation({ summary: 'Tự khai đã giải xong một bài (bài VIP vẫn cần role vip — chống tự khai khống)' })
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
  @ApiResponse({ status: 201, description: 'Dashboard mới sau khi ghi.' })
  @ApiResponse({ status: 200, description: '`{ error: "slug required" }` khi thiếu slug — không ném.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 403, description: 'Bài VIP mà role không đủ.' })
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
  @ApiOperation({ summary: 'Danh sách bài yêu thích (mới nhất trước)' })
  @ApiResponse({ status: 200, description: '`{ total, slugs }`.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async favorites(@Req() req: AuthenticatedRequest) {
    return this.progress.getFavorites(Number(req.user!.userId));
  }

  @Post('favorites')
  @ApiOperation({ summary: 'Thêm bài vào yêu thích' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string', example: 'two-sum' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Danh sách yêu thích sau khi thêm.' })
  @ApiResponse({ status: 200, description: '`{ error: "slug required" }` khi thiếu slug.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async addFavorite(
    @Req() req: AuthenticatedRequest,
    @Body() body: { slug: string },
  ) {
    const slug = String(body?.slug ?? '').trim();
    if (!slug) return { error: 'slug required' };
    return this.progress.addFavorite(Number(req.user!.userId), slug);
  }

  @Delete('favorites/:slug')
  @ApiOperation({ summary: 'Bỏ bài khỏi yêu thích (chưa thích thì im lặng qua)' })
  @ApiParam({ name: 'slug', type: String, example: 'two-sum' })
  @ApiResponse({ status: 200, description: 'Danh sách yêu thích sau khi bỏ.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async removeFavorite(@Req() req: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.progress.removeFavorite(Number(req.user!.userId), slug);
  }
}
