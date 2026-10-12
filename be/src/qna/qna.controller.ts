import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '../common/throttle.guard.ts';
import { QnaService } from './qna.service.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';

@ApiTags('qna')
@Controller('api/qna')
export class QnaController {
  constructor(private readonly qna: QnaService) {}

  @Post()
  @ApiOperation({ summary: 'Gửi câu hỏi hỗ trợ (khách vãng lai được, 5 req/phút)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'question'],
      properties: {
        name: { type: 'string', maxLength: 100, example: 'An' },
        email: { type: 'string', format: 'email', maxLength: 254, example: 'an@example.com' },
        question: { type: 'string', maxLength: 2000, example: 'Làm sao nộp bài Python?' },
        message: { type: 'string', description: 'Bí danh của `question` (client cũ).' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '`{ ok: true, id }`.' })
  @ApiResponse({ status: 400, description: 'Thiếu tên/email/câu hỏi hoặc email sai dạng.' })
  @ApiResponse({ status: 429, description: 'Quá 5 req/phút.' })
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
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Liệt kê câu hỏi (cần đăng nhập — dùng cho admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách câu hỏi.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @UseGuards(AuthGuard)
  async list() {
    return this.qna.findAll();
  }
}
