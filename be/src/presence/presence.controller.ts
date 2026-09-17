import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PresenceService } from './presence.service.ts';

@Controller('api/presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('heartbeat')
  heartbeat(@Body() body: { sessionId?: string }) {
    const sessionId =
      typeof body?.sessionId === 'string' && body.sessionId.length > 0
        ? body.sessionId.slice(0, 128)
        : randomUUID();
    const online = this.presence.heartbeat(sessionId);
    return { online, sessionId };
  }

  @Post('leave')
  leave(@Body() body: { sessionId?: string }) {
    if (typeof body?.sessionId === 'string' && body.sessionId.length > 0) {
      this.presence.leave(body.sessionId);
    }
    return { online: this.presence.count() };
  }

  @Delete('leave')
  leaveBeacon(@Body() body: { sessionId?: string }) {
    return this.leave(body);
  }

  @Get('online')
  online() {
    return { online: this.presence.count() };
  }
}
