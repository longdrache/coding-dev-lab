import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '../common/throttle.guard.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { SubmissionsService, type CreateSubmissionDto } from './submissions.service.ts';

@ApiTags('history')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('api/history')
@UseGuards(AuthGuard)
export class SubmissionsController {
  constructor(private readonly subs: SubmissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Ghi một dòng lịch sử nộp bài (không chấm — chấm thì qua /api/problems/:slug/submit)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['problemSlug', 'languageId', 'sourceCode'],
      properties: {
        problemSlug: { type: 'string', example: 'two-sum' },
        languageId: { type: 'number', example: 71 },
        sourceCode: { type: 'string', example: 'print(1)', description: 'Trống hoặc quá 64k thì 400.' },
        status: { type: 'string', nullable: true, example: 'Accepted' },
        statusId: { type: 'number', nullable: true, example: 3 },
        passed: { type: 'boolean', nullable: true },
        passedCount: { type: 'number', nullable: true },
        totalCount: { type: 'number', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Dòng lịch sử đã ghi (có id).' })
  @ApiResponse({ status: 400, description: 'Thiếu/sai slug, languageId, sourceCode, hoặc bài không tồn tại.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 403, description: 'Bài VIP mà role không đủ — không cho tự khai lịch sử khống.' })
  @ApiResponse({ status: 429, description: 'Quá 30 req/phút.' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateSubmissionDto) {
    return this.subs.create(Number(req.user!.userId), body, req.user!.role);
  }

  @Get()
  @ApiOperation({ summary: 'Lịch sử nộp bài của chính mình (mới nhất trước, tối đa 50; lọc theo slug tùy chọn)' })
  @ApiQuery({ name: 'slug', required: false, type: String, example: 'two-sum' })
  @ApiResponse({ status: 200, description: 'Mảng lịch sử.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 403, description: 'Hỏi lịch sử bài VIP mà role không đủ.' })
  async list(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(Number(req.user!.userId), slug, req.user!.role);
  }

  @Get('me')
  @ApiOperation({ summary: 'Bí danh của GET /api/history (FE gọi cả hai)' })
  @ApiQuery({ name: 'slug', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Mảng lịch sử.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 403, description: 'Hỏi lịch sử bài VIP mà role không đủ.' })
  async me(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(Number(req.user!.userId), slug, req.user!.role);
  }
}
