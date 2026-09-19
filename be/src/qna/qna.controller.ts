import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { QnaService } from './qna.service.ts';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';

@Controller('api/qna')
export class QnaController {
  constructor(private readonly qna: QnaService) {}

  @Post()
  async create(
    @Body() body: { name: string; email: string; question: string; message?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim();
    const question = String(body?.question ?? body?.message ?? '').trim();
    if (!name || !email || !question) {
      return { error: 'Thiếu tên, email hoặc câu hỏi' };
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
