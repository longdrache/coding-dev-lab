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
  @ApiOperation({ summary: 'Ask the AI assistant (authentication required; 10 requests per minute)' })
  @ApiResponse({ status: 201, description: '`{ answer }`.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded: 10 requests per minute.' })
  @ApiResponse({ status: 502, description: 'The RAG assistant failed or could not be reached.' })
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  chat(@Body() body: unknown) {
    return this.rag.ask(body);
  }
}
