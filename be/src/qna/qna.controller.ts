import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { QnaService } from './qna.service.ts';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';

@Controller('api/qna')
export class QnaController {
  constructor(private readonly qna: QnaService) {}

  @Post()
  @UseGuards(ThrottleGuard)
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
    // thử lấy userId nếu có token, không bắt buộc — khách vãng lai thì null
    let userId: number | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        // nếu có guard optional, userId có thể không có, bỏ qua
        const raw = (req as unknown as { user?: { userId?: unknown } }).user?.userId;
        if (typeof raw === 'number' && Number.isInteger(raw)) userId = raw;
        else if (typeof raw === 'string' && /^\d+$/.test(raw)) userId = Number(raw);
      } catch {}
    }
    const saved = await this.qna.create({ name, email, question, userId });
    return { ok: true, id: saved.id };
  }

  @Get()
  @UseGuards(ClerkAuthGuard)
  async list() {
    return this.qna.findAll();
  }
}
