import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { PresenceService } from './presence.service.ts';

@ApiTags('presence')
@Controller('api/presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('heartbeat')
  @ApiOperation({ summary: 'Send an online heartbeat and keep the session in the active-user count (generates a UUID if sessionId is omitted)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { sessionId: { type: 'string', example: 'sess-1', maxLength: 128 } },
    },
  })
  @ApiResponse({ status: 201, description: '`{ online, sessionId }` — the current online-user count and active session ID.' })
  heartbeat(@Body() body: { sessionId?: string }) {
    const sessionId =
      typeof body?.sessionId === 'string' && body.sessionId.length > 0
        ? body.sessionId.slice(0, 128)
        : randomUUID();
    const online = this.presence.heartbeat(sessionId);
    return { online, sessionId };
  }

  @Post('leave')
  @ApiOperation({ summary: 'Leave a session and recount online users (an empty sessionId only recounts and does not remove a session)' })
  @ApiResponse({ status: 201, description: '`{ online }` after leaving the session.' })
  leave(@Body() body: { sessionId?: string }) {
    if (typeof body?.sessionId === 'string' && body.sessionId.length > 0) {
      this.presence.leave(body.sessionId);
    }
    return { online: this.presence.count() };
  }

  @Delete('leave')
  @ApiOperation({ summary: 'Handle a beacon sent when a tab closes (same behavior as POST leave)' })
  @ApiResponse({ status: 200, description: '`{ online }` after leaving the session.' })
  leaveBeacon(@Body() body: { sessionId?: string }) {
    return this.leave(body);
  }

  @Get('online')
  @ApiOperation({ summary: 'Get the number of online users (counts only; does not create a session)' })
  @ApiResponse({ status: 200, description: '`{ online }`.' })
  online() {
    return { online: this.presence.count() };
  }
}
