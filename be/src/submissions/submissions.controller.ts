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
  @ApiOperation({ summary: 'Record a submission history entry without judging it (use /api/problems/:slug/submit to run tests)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['problemSlug', 'languageId', 'sourceCode'],
      properties: {
        problemSlug: { type: 'string', example: 'two-sum' },
        languageId: { type: 'number', example: 71 },
        sourceCode: { type: 'string', example: 'print(1)', description: 'An empty value or more than 64 KB returns a 400 response.' },
        status: { type: 'string', nullable: true, example: 'Accepted' },
        statusId: { type: 'number', nullable: true, example: 3 },
        passed: { type: 'boolean', nullable: true },
        passedCount: { type: 'number', nullable: true },
        totalCount: { type: 'number', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'The submission history entry was recorded and includes an ID.' })
  @ApiResponse({ status: 400, description: 'The slug, languageId, or sourceCode is missing or invalid, or the problem does not exist.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 403, description: 'VIP access is required; users cannot create fabricated history for VIP problems.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded: 30 requests per minute.' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateSubmissionDto) {
    return this.subs.create(Number(req.user!.userId), body, req.user!.role);
  }

  @Get()
  @ApiOperation({ summary: 'Get your submission history (newest first, up to 50 entries; optionally filter by slug)' })
  @ApiQuery({ name: 'slug', required: false, type: String, example: 'two-sum' })
  @ApiResponse({ status: 200, description: 'Array of submission history entries.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 403, description: 'VIP access is required to view history for a VIP problem.' })
  async list(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(Number(req.user!.userId), slug, req.user!.role);
  }

  @Get('me')
  @ApiOperation({ summary: 'Alias for GET /api/history (both routes are used by the frontend)' })
  @ApiQuery({ name: 'slug', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Array of submission history entries.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 403, description: 'VIP access is required to view history for a VIP problem.' })
  async me(@Req() req: AuthenticatedRequest, @Query('slug') slug?: string) {
    return this.subs.findByUser(Number(req.user!.userId), slug, req.user!.role);
  }
}
