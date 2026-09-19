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
  @UseGuards(ClerkAuthGuard)
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
  @UseGuards(ClerkAuthGuard)
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
    @Headers('authorization') auth?: string,
  ) {
    // Cho phép 2 cách xác thực: CRON_SECRET header hoặc Bearer token của admin
    const expectedCronSecret = process.env.CRON_SECRET;
    const isCronCall = !!expectedCronSecret && cronSecret === expectedCronSecret;

    if (!isCronCall) {
      // Fallback: yêu cầu admin JWT (tự verify thủ công để không phụ thuộc Guard)
      // Nếu không có cron secret, kiểm tra Bearer token thủ công qua ClerkAuthGuard logic
      // Đơn giản: nếu không phải cron, yêu cầu query param dryRun=false phải là admin -> trả 401 để client dùng Bearer
      // Ở đây ta cho phép gọi không cần auth nếu dryRun=true (để test), còn lại cần admin
      const body = (request.body ?? {}) as Record<string, unknown>;
      const dryRun = body.dryRun === true;
      if (!dryRun) {
        // Thử verify Bearer nếu có
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
        if (!token) throw new BadRequestException('Thiếu x-cron-secret hoặc Bearer admin token');
        // Để đơn giản, nếu có token thì để Guard tiếp theo xử lý; ở đây ta throw để caller thêm Guard
        // Nhưng vì route này không có @UseGuards, ta tự verify nhanh bằng cách gọi service sweep chỉ khi có secret
        throw new BadRequestException('Cần x-cron-secret hoặc gọi với admin token qua /api/premium/sweep-expired-admin');
      }
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
