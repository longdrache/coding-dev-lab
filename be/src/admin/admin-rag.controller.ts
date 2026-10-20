import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard.ts';
import { RagBotClient } from '../rag/rag.bot-client.ts';

export const MAX_INGEST_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_LENGTH = 120;

@Controller('api/admin/rag')
@UseGuards(AdminGuard)
export class AdminRagController {
  constructor(private readonly bot: RagBotClient) {}

  @Post('ingest')
  async ingest(@Body() body: { source?: unknown; text?: unknown }) {
    const source = typeof body?.source === 'string' ? body.source.trim() : '';
    const text = typeof body?.text === 'string' ? body.text : '';

    if (!source) throw new BadRequestException("Thiếu 'source'");
    if (source.length > MAX_SOURCE_LENGTH) {
      throw new BadRequestException(`'source' tối đa ${MAX_SOURCE_LENGTH} ký tự`);
    }
    if (!text.trim()) throw new BadRequestException('Tài liệu rỗng');
    if (Buffer.byteLength(text, 'utf8') > MAX_INGEST_BYTES) {
      throw new BadRequestException('Tài liệu tối đa 5MB');
    }

    await this.bot.post('/ingest', { source, text }, 60_000);
    return { ok: true };
  }
}
