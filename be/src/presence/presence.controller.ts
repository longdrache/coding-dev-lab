import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { PresenceService } from './presence.service.ts';

@ApiTags('presence')
@Controller('api/presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('heartbeat')
  @ApiOperation({ summary: 'Nhịp tim online: giữ phiên trong bảng đếm (thiếu sessionId thì tự sinh UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { sessionId: { type: 'string', example: 'sess-1', maxLength: 128 } },
    },
  })
  @ApiResponse({ status: 201, description: '`{ online, sessionId }` — số người đang online + phiên đang giữ.' })
  heartbeat(@Body() body: { sessionId?: string }) {
    const sessionId =
      typeof body?.sessionId === 'string' && body.sessionId.length > 0
        ? body.sessionId.slice(0, 128)
        : randomUUID();
    const online = this.presence.heartbeat(sessionId);
    return { online, sessionId };
  }

  @Post('leave')
  @ApiOperation({ summary: 'Rời phiên + đếm lại số online (sessionId rỗng thì chỉ đếm, không xoá)' })
  @ApiResponse({ status: 201, description: '`{ online }` sau khi rời.' })
  leave(@Body() body: { sessionId?: string }) {
    if (typeof body?.sessionId === 'string' && body.sessionId.length > 0) {
      this.presence.leave(body.sessionId);
    }
    return { online: this.presence.count() };
  }

  @Delete('leave')
  @ApiOperation({ summary: 'Beacon khi đóng tab (cùng hành vi với POST leave)' })
  @ApiResponse({ status: 200, description: '`{ online }` sau khi rời.' })
  leaveBeacon(@Body() body: { sessionId?: string }) {
    return this.leave(body);
  }

  @Get('online')
  @ApiOperation({ summary: 'Số người đang online (chỉ đếm, không sinh phiên)' })
  @ApiResponse({ status: 200, description: '`{ online }`.' })
  online() {
    return { online: this.presence.count() };
  }
}
