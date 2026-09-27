import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import { RolesGuard } from '../auth/roles.guard.ts';
import { Roles } from '../auth/roles.decorator.ts';
import { PremiumService, type PremiumPlan } from './premium.service.ts';

type RawBodyRequest = {
  rawBody?: Buffer;
  body?: unknown;
};

/**
 * `User.id` là Int. `req.user.userId` và `@Body('userId')` đều tới dạng chuỗi, nên phải
 * chuẩn hoá về số trước khi vào service — nếu không, `where: { id: 'abc' }` sẽ nổ.
 */
function toUserId(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException('Không xác định được user');
  }
  return n;
}

@Controller('api/premium')
export class PremiumController {
  constructor(private readonly premiumService: PremiumService) {}

  @Post('checkout')
  @UseGuards(AuthGuard)
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Body('plan') plan: PremiumPlan,
  ) {
    return this.premiumService.createCheckout(toUserId(request.user?.userId), plan);
  }

  @Post('grant-vip')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async grantVip(
    @Req() request: AuthenticatedRequest,
    @Body('userId') targetUserId?: string,
    @Body('plan') plan?: PremiumPlan,
  ) {
    const userId = toUserId(targetUserId ?? request.user?.userId);

    await this.premiumService.setUserToVip(userId, plan ?? 'monthly');
    return {
      ok: true,
      message: `Đã cấp quyền VIP cho user ${userId}`,
      userId,
      role: 'vip',
      plan: plan ?? 'monthly',
    };
  }

  @Post('cancel-vip')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async cancelVip(
    @Req() request: AuthenticatedRequest,
    @Body('userId') targetUserId?: string,
  ) {
    const userId = toUserId(targetUserId ?? request.user?.userId);

    await this.premiumService.removeVip(userId);
    return {
      ok: true,
      message: `Đã hủy quyền VIP của user ${userId}`,
      userId,
      role: 'user',
    };
  }

  @Post('webhook')
  handleWebhook(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    console.log('⚡ Nhận request POST /api/premium/webhook');
    if (!signature || !request.rawBody) {
      console.error('❌ Thiếu stripe-signature hoặc rawBody:', {
        hasSignature: !!signature,
        hasRawBody: !!request.rawBody,
      });
      throw new BadRequestException('Thiếu Stripe signature hoặc raw body');
    }
    return this.premiumService.handleWebhook(request.rawBody, signature);
  }

  // ========== VIP hết hạn ==========

  @Get('status')
  @UseGuards(AuthGuard)
  async getStatus(@Req() request: AuthenticatedRequest) {
    return this.premiumService.getVipStatus(toUserId(request.user?.userId));
  }

  @Post('check-expired')
  @UseGuards(AuthGuard)
  async checkExpired(
    @Req() request: AuthenticatedRequest,
    @Body('userId') targetUserId?: string,
  ) {
    // Nếu check cho người khác, yêu cầu admin
    if (targetUserId && request.user?.role !== 'admin') {
      throw new BadRequestException('Chỉ admin mới được kiểm tra user khác');
    }
    const userId = toUserId(targetUserId ?? request.user?.userId);
    const result = await this.premiumService.checkAndDowngradeIfExpired(userId);
    return { userId, ...result };
  }

  /**
   * Chặn cron fail-closed, chấp nhận secret qua hai đường:
   * - header `x-cron-secret`: đường cũ, giữ để không phá client hiện có.
   * - header `Authorization: Bearer <CRON_SECRET>`: đúng cách Vercel Cron thật
   *   sự dùng (`vercel.json` chỉ cho khai báo `path`, không cấu hình được method
   *   hay header tuỳ biến).
   *
   * `CRON_SECRET` chưa cấu hình, hoặc không khớp đường nào, đều 401 và **không**
   * gọi service — không bao giờ để lọt. Cùng một thông báo cho cả hai ca để không
   * lộ ra chuyện biến môi trường có được cấu hình hay không.
   */
  private assertCronSecret(xCronSecret?: string, authorization?: string): void {
    const expected = process.env.CRON_SECRET;
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    if (!expected || (xCronSecret !== expected && bearer !== expected)) {
      throw new UnauthorizedException('Cron secret không hợp lệ');
    }
  }

  /**
   * Đường cho Vercel Cron: gọi bằng GET kèm `Authorization: Bearer $CRON_SECRET`.
   * Không nhận body, nên không có `limit`/`dryRun` — luôn quét theo mặc định của
   * service. Nhánh `dryRun` tay trong `@Post` bên dưới vẫn giữ nguyên cho client
   * cũ, nhưng phải qua đúng bộ secret này mới chạy được.
   */
  @Get('sweep-expired')
  async sweepExpiredByCron(
    @Headers('x-cron-secret') xCronSecret?: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.assertCronSecret(xCronSecret, authorization);
    return this.premiumService.sweepExpiredVips({});
  }

  @Post('sweep-expired')
  async sweepExpired(
    @Req() request: RawBodyRequest,
    @Headers('x-cron-secret') cronSecret?: string,
    @Headers('authorization') authorization?: string,
  ) {
    // Chỉ cron server (giữ CRON_SECRET) được gọi. Bỏ nhánh dryRun ẩn danh
    // vì nó cho phép quét toàn bộ user không giới hạn.
    this.assertCronSecret(cronSecret, authorization);

    const body = (request.body ?? {}) as Record<string, unknown>;
    const limit = typeof body.limit === 'number' ? body.limit : undefined;
    const dryRun = body.dryRun === true;
    return this.premiumService.sweepExpiredVips({ limit, dryRun });
  }

  @Post('sweep-expired-admin')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async sweepExpiredAsAdmin(@Body() body: { limit?: number; dryRun?: boolean }) {
    return this.premiumService.sweepExpiredVips({
      limit: body.limit,
      dryRun: body.dryRun,
    });
  }
}
