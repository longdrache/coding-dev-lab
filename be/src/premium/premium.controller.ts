import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
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
}
