import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { ActivityService } from './activity.service.ts';

@ApiTags('activity')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('api/activity')
@UseGuards(AuthGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Post('login')
  @ApiOperation({ summary: 'Ghi nhận lượt đăng nhập + điểm danh ngày (kèm IP/quốc gia)' })
  @ApiResponse({ status: 201, description: 'Trả bản đồ hoạt động `{ map }` sau khi ghi.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async login(@Req() req: AuthenticatedRequest) {
    const userId = Number(req.user!.userId);
    const headers = (req as unknown as { headers?: Record<string, string | string[] | undefined> }).headers ?? {};
    const forwarded = headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim())
      ?? (req as unknown as { ip?: string }).ip
      ?? 'unknown';
    // Vercel tự gắn quốc gia (miễn phí, không cần GeoIP DB); local thì trống
    const rawCountry = headers['x-vercel-ip-country'];
    const country = Array.isArray(rawCountry) ? rawCountry[0] : rawCountry;
    const map = await this.activity.recordLogin(userId, { ip, country });
    return { map };
  }

  @Post('run')
  @ApiOperation({ summary: 'Ghi nhận một lượt chạy code (tăng count hôm nay)' })
  @ApiResponse({ status: 201, description: 'Trả bản đồ hoạt động `{ map }` sau khi ghi.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async run(@Req() req: AuthenticatedRequest) {
    const userId = Number(req.user!.userId);
    const map = await this.activity.recordRun(userId);
    return { map };
  }

  @Get('me')
  @ApiOperation({ summary: 'Lấy bản đồ hoạt động của chính mình (heatmap/streak)' })
  @ApiResponse({ status: 200, description: 'Bản đồ `{ ngày: số lượt }`.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  async me(@Req() req: AuthenticatedRequest) {
    const userId = Number(req.user!.userId);
    const map = await this.activity.getMap(userId);
    return { map };
  }
}
