import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QnaService } from './qna.service.ts';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';

@Controller('api/qna')
export class QnaController {
  constructor(private readonly qna: QnaService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(
    @Body() body: { name: string; email: string; question: string; message?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const name = String(body?.name ?? '').trim().slice(0, 100);
    const email = String(body?.email ?? '').trim().slice(0, 254);
    const question = String(body?.question ?? body?.message ?? '').trim().slice(0, 2000);
    if (!name || !email || !question) {
      throw new BadRequestException('Thiếu tên, email hoặc câu hỏi');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email không hợp lệ');
    }
    // thử lấy clerkId nếu có token, không bắt buộc
    let clerkId: string | undefined;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        // nếu có guard optional, clerkId có thể không có, bỏ qua
        clerkId = (req as unknown as { user?: { userId: string } }).user?.userId;
      } catch {}
    }
    const saved = await this.qna.create({ name, email, question, clerkId });
    return { ok: true, id: saved.id };
  }

  @Get()
  @UseGuards(ClerkAuthGuard)
  async list() {
    return this.qna.findAll();
  }
}
