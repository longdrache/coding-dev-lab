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
import type { Request } from 'express';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { Roles } from './auth/roles.decorator.ts';
import type { AuthenticatedRequest } from './auth/auth.types.ts';
import { PremiumService, type PremiumPlan } from './premium.service.ts';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/premium')
export class PremiumController {
  constructor(private readonly premiumService: PremiumService) {}

  @Post('checkout')
  @UseGuards(ClerkAuthGuard)
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Body('plan') plan: PremiumPlan,
  ) {
    const userId = request.user?.userId;
    if (!userId) throw new BadRequestException('Không xác định được user');
    return this.premiumService.createCheckout(userId, plan);
  }

  @Post('grant-vip')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @Roles('admin')
  async grantVip(
    @Req() request: AuthenticatedRequest,
    @Body('userId') targetUserId?: string,
    @Body('plan') plan?: PremiumPlan,
  ) {
    const userId = targetUserId ?? request.user?.userId;
    if (!userId) throw new BadRequestException('Không xác định được user');

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
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @Roles('admin')
  async cancelVip(
    @Req() request: AuthenticatedRequest,
    @Body('userId') targetUserId?: string,
  ) {
    const userId = targetUserId ?? request.user?.userId;
    if (!userId) throw new BadRequestException('Không xác định được user');

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
  @UseGuards(ClerkAuthGuard)
  async getStatus(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.userId;
    if (!userId) throw new BadRequestException('Không xác định được user');
    return this.premiumService.getVipStatus(userId);
  }

  @Post('check-expired')
  @UseGuards(ClerkAuthGuard)
  async checkExpired(
    @Req() request: AuthenticatedRequest,
    @Body('userId') targetUserId?: string,
  ) {
    const userId = targetUserId ?? request.user?.userId;
    if (!userId) throw new BadRequestException('Không xác định được user');
    // Nếu check cho người khác, yêu cầu admin
    if (targetUserId && request.user?.role !== 'admin') {
      throw new BadRequestException('Chỉ admin mới được kiểm tra user khác');
    }
    const result = await this.premiumService.checkAndDowngradeIfExpired(userId);
    return { userId, ...result };
  }

  @Post('sweep-expired')
  async sweepExpired(
    @Req() request: Request,
    @Headers('x-cron-secret') cronSecret?: string,
  ) {
    // Chỉ cron server (giữ CRON_SECRET) được gọi. Bỏ nhánh dryRun ẩn danh
    // vì nó cho phép quét Clerk API không giới hạn.
    const expectedCronSecret = process.env.CRON_SECRET;
    if (!expectedCronSecret || cronSecret !== expectedCronSecret) {
      throw new BadRequestException('Thiếu x-cron-secret hợp lệ');
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const limit = typeof body.limit === 'number' ? body.limit : undefined;
    const dryRun = body.dryRun === true;
    return this.premiumService.sweepExpiredVips({ limit, dryRun });
  }

  @Post('sweep-expired-admin')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @Roles('admin')
  async sweepExpiredAsAdmin(@Body() body: { limit?: number; dryRun?: boolean }) {
    return this.premiumService.sweepExpiredVips({
      limit: body.limit,
      dryRun: body.dryRun,
    });
  }
}
