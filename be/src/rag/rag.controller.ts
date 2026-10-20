import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.ts';
import { Throttle } from '../common/throttle.guard.ts';
import { RagService } from './rag.service.ts';

@ApiTags('rag')
@Controller('api/rag')
export class RagController {
  constructor(private readonly rag: RagService) {}

  @Post('chat')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Hỏi trợ lý AI (cần đăng nhập, 10 req/phút)' })
  @ApiResponse({ status: 201, description: '`{ answer }`.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 429, description: 'Quá 10 req/phút.' })
  @ApiResponse({ status: 502, description: 'Bot RAG lỗi hoặc không kết nối được.' })
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  chat(@Body() body: unknown) {
    return this.rag.ask(body);
  }
}
