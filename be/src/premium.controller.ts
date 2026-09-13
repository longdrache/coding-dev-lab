import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
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
}
