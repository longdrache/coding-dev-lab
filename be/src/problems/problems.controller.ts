import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ProblemsService } from './problems.service.ts';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';

@Controller('api/problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Get()
  async list() {
    return this.problems.findAll();
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    const p = await this.problems.findBySlug(slug);
    if (!p) throw new NotFoundException('Không tìm thấy bài toán');
    return p;
  }

  @Post(':slug/submit')
  @UseGuards(ClerkAuthGuard)
  async submit(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { languageId: number; sourceCode: string },
  ) {
    const clerkId = req.user!.userId;
    const languageId = Number(body?.languageId);
    const sourceCode = String(body?.sourceCode ?? '');
    if (!languageId || !sourceCode) throw new NotFoundException('Thiếu languageId/sourceCode');
    return this.problems.submit(slug, clerkId, languageId, sourceCode);
  }
}
