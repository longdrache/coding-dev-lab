import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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

@ApiTags('premium')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('api/premium')
export class PremiumController {
  private readonly logger = new Logger(PremiumController.name);

  constructor(private readonly premiumService: PremiumService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Create a Stripe Checkout session for a plan and return the payment URL' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['plan'],
      properties: { plan: { type: 'string', enum: ['daily', 'monthly', 'yearly'], example: 'monthly' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Stripe Checkout URL.' })
  @ApiResponse({ status: 400, description: 'The user could not be identified.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @UseGuards(AuthGuard)
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Body('plan') plan: PremiumPlan,
  ) {
    return this.premiumService.createCheckout(toUserId(request.user?.userId), plan);
  }

  @Post('grant-vip')
  @ApiOperation({ summary: '[Admin] Grant VIP access to a user (defaults to the current user and the monthly plan)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: '42', description: 'Omit to grant VIP access to yourself.' },
        plan: { type: 'string', enum: ['daily', 'monthly', 'yearly'], example: 'yearly' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '`{ ok, userId, role: "vip", plan }`.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 403, description: 'Administrator access is required.' })
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
  @ApiOperation({ summary: '[Admin] Revoke VIP access from a user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { userId: { type: 'string', example: '42', description: 'Omit to revoke your own VIP access.' } },
    },
  })
  @ApiResponse({ status: 201, description: '`{ ok, userId, role: "user" }`.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 403, description: 'Administrator access is required.' })
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
  @ApiOperation({ summary: 'Stripe webhook (called by Stripe, not clients; requires a valid signature)' })
  @ApiHeader({ name: 'stripe-signature', required: true, description: 'Stripe webhook signature.' })
  @ApiResponse({ status: 201, description: 'Event accepted (idempotent by StripeEvent).' })
  @ApiResponse({ status: 400, description: 'Signature or raw request body is missing, or the signature is invalid.' })
  handleWebhook(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    this.logger.log('Nhận request POST /api/premium/webhook');
    if (!signature || !request.rawBody) {
      this.logger.error(
        `Thiếu stripe-signature hoặc rawBody (có signature: ${!!signature}, có rawBody: ${!!request.rawBody})`,
      );
      throw new BadRequestException('Thiếu Stripe signature hoặc raw body');
    }
    return this.premiumService.handleWebhook(request.rawBody, signature);
  }

  // ========== VIP hết hạn ==========

  @Get('status')
  @ApiOperation({ summary: 'Get your VIP status (role, plan, expiration date, and days remaining)' })
  @ApiResponse({ status: 200, description: '`{ role, plan, expiresAt, isExpired, daysLeft }`.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @UseGuards(AuthGuard)
  async getStatus(@Req() request: AuthenticatedRequest) {
    return this.premiumService.getVipStatus(toUserId(request.user?.userId));
  }

  @Post('check-expired')
  @ApiOperation({ summary: 'Check and immediately downgrade expired VIP access (users can check themselves; checking others requires an administrator)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { userId: { type: 'string', example: '42', description: 'Omit to check your own account.' } },
    },
  })
  @ApiResponse({ status: 201, description: '`{ userId, downgraded, ... }`.' })
  @ApiResponse({ status: 400, description: 'Only an administrator can check another user.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
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
