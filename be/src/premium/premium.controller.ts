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
  constructor(private readonly premiumService: PremiumService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Tạo phiên Stripe Checkout cho một gói (trả về URL thanh toán)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['plan'],
      properties: { plan: { type: 'string', enum: ['daily', 'monthly', 'yearly'], example: 'monthly' } },
    },
  })
  @ApiResponse({ status: 201, description: 'URL Stripe Checkout.' })
  @ApiResponse({ status: 400, description: 'Không xác định được user.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @UseGuards(AuthGuard)
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Body('plan') plan: PremiumPlan,
  ) {
    return this.premiumService.createCheckout(toUserId(request.user?.userId), plan);
  }

  @Post('grant-vip')
  @ApiOperation({ summary: '[Admin] Cấp VIP cho user (mặc định chính mình, gói monthly)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: '42', description: 'Bỏ trống là tự cấp cho mình.' },
        plan: { type: 'string', enum: ['daily', 'monthly', 'yearly'], example: 'yearly' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '`{ ok, userId, role: "vip", plan }`.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 403, description: 'Không phải admin.' })
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
  @ApiOperation({ summary: '[Admin] Hủy VIP của user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { userId: { type: 'string', example: '42', description: 'Bỏ trống là tự hủy của mình.' } },
    },
  })
  @ApiResponse({ status: 201, description: '`{ ok, userId, role: "user" }`.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 403, description: 'Không phải admin.' })
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
  @ApiOperation({ summary: 'Webhook Stripe (Stripe gọi, không phải client — cần chữ ký hợp lệ)' })
  @ApiHeader({ name: 'stripe-signature', required: true, description: 'Chữ ký webhook của Stripe.' })
  @ApiResponse({ status: 201, description: 'Đã nhận (idempotent theo StripeEvent).' })
  @ApiResponse({ status: 400, description: 'Thiếu signature/raw body, hoặc chữ ký sai.' })
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
  @ApiOperation({ summary: 'Trạng thái VIP của chính mình (role, gói, hạn, còn mấy ngày)' })
  @ApiResponse({ status: 200, description: '`{ role, plan, expiresAt, isExpired, daysLeft }`.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @UseGuards(AuthGuard)
  async getStatus(@Req() request: AuthenticatedRequest) {
    return this.premiumService.getVipStatus(toUserId(request.user?.userId));
  }

  @Post('check-expired')
  @ApiOperation({ summary: 'Kiểm tra + hạ VIP hết hạn ngay (tự check mình; check người khác cần admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { userId: { type: 'string', example: '42', description: 'Bỏ trống là tự kiểm tra mình.' } },
    },
  })
  @ApiResponse({ status: 201, description: '`{ userId, downgraded, ... }`.' })
  @ApiResponse({ status: 400, description: 'Không phải admin mà đòi kiểm tra user khác.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
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
