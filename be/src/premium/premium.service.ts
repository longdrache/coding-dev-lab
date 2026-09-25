import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import Stripe from 'stripe';
import 'dotenv/config';
import { DatabaseService } from '../database/database.service.ts';
export type PremiumPlan = 'daily' | 'monthly' | 'yearly';

const plans: Record<
  PremiumPlan,
  { amount: number; interval: 'day' | 'month' | 'year' }
> = {
  daily: { amount: 200, interval: 'day' },
  monthly: { amount: 1000, interval: 'month' },
  yearly: { amount: 2000, interval: 'year' },
};

@Injectable()
export class PremiumService implements OnModuleInit {
  private readonly logger = new Logger(PremiumService.name);
  private stripeInstance?: Stripe;

  constructor(private readonly db: DatabaseService) {}
  private sweepInterval?: NodeJS.Timeout;

  onModuleInit() {
    // Cron quét VIP hết hạn: mỗi 60 phút (có thể đổi qua env PREMIUM_SWEEP_INTERVAL_MS)
    // Trên Vercel serverless, interval chỉ chạy khi instance còn warm; vẫn an toàn nhờ auto-downgrade trong Guard và webhook.
    if (process.env.DISABLE_PREMIUM_SWEEP === '1') {
      this.logger.log('Premium sweep disabled via DISABLE_PREMIUM_SWEEP=1');
      return;
    }
    const intervalMs = Number(process.env.PREMIUM_SWEEP_INTERVAL_MS ?? 60 * 60 * 1000);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
    // Chạy lần đầu sau 30s để không block startup, sau đó lặp theo interval
    setTimeout(() => this.sweepExpiredVips().catch((e) => this.logger.error('sweep lần đầu lỗi', e as Error)), 30_000);
    this.sweepInterval = setInterval(() => {
      this.sweepExpiredVips().catch((e) => this.logger.error('sweep định kỳ lỗi', e as Error));
    }, intervalMs);
    // Cho phép process thoát khi không còn handle nào khác (tránh giữ serverless)
    if (this.sweepInterval.unref) this.sweepInterval.unref();
    this.logger.log(`Đã bật sweep VIP hết hạn mỗi ${Math.round(intervalMs / 60000)} phút`);
  }

  // ========== Helpers hết hạn ==========
  /** Kiểm tra expiresAt đã qua hiện tại chưa */
  isExpired(expiresAt?: string | null): boolean {
    if (!expiresAt) return false; // không có hạn = không hết hạn (VIP vĩnh viễn nếu admin cấp)
    const t = Date.parse(expiresAt);
    if (Number.isNaN(t)) return false;
    return Date.now() > t;
  }

  /** Lấy expiresAt từ publicMetadata (hỗ trợ cả string ISO và number epoch) */
  private parseExpiresAt(metadata?: Record<string, unknown> | null): string | null {
    if (!metadata) return null;
    const v = metadata.expiresAt ?? metadata.expires_at ?? metadata.vipExpiresAt;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return new Date(v).toISOString();
    return null;
  }

  /**
   * Kiểm tra 1 user có VIP hết hạn không; nếu hết hạn thì tự hạ xuống 'user'.
   * @returns { downgraded: boolean, wasVip: boolean, expired: boolean }
   */
  async checkAndDowngradeIfExpired(userId: string): Promise<{
    downgraded: boolean;
    wasVip: boolean;
    expired: boolean;
    expiresAt: string | null;
  }> {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new BadRequestException('Chưa cấu hình CLERK_SECRET_KEY');
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const user = await clerk.users.getUser(userId);
    const meta = (user.publicMetadata ?? {}) as Record<string, unknown>;
    const role = meta.role as string | undefined;
    const expiresAt = this.parseExpiresAt(meta);
    const wasVip = role === 'vip';
    if (!wasVip) return { downgraded: false, wasVip: false, expired: false, expiresAt };
    const expired = this.isExpired(expiresAt);
    if (!expired) return { downgraded: false, wasVip: true, expired: false, expiresAt };
    this.logger.warn(`VIP hết hạn cho user ${userId} (expiresAt=${expiresAt}) → hạ xuống user`);
    await this.removeVip(userId);
    return { downgraded: true, wasVip: true, expired: true, expiresAt };
  }

  /**
   * Quét toàn bộ user Clerk, tự hạ những VIP đã hết hạn.
   * Dùng phân trang 100 user/lần. Trả về thống kê.
   */
  async sweepExpiredVips(opts?: { limit?: number; dryRun?: boolean }): Promise<{
    checked: number;
    expired: number;
    downgraded: number;
    errors: number;
    dryRun: boolean;
  }> {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      this.logger.warn('sweepExpiredVips bỏ qua: thiếu CLERK_SECRET_KEY');
      return { checked: 0, expired: 0, downgraded: 0, errors: 0, dryRun: !!opts?.dryRun };
    }
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const maxChecked = opts?.limit ?? 1000;
    const dryRun = !!opts?.dryRun;
    let checked = 0, expired = 0, downgraded = 0, errors = 0;
    let offset = 0;
    const pageSize = 100;
    this.logger.log(`Bắt đầu sweep VIP hết hạn (dryRun=${dryRun}, max=${maxChecked})...`);
    while (checked < maxChecked) {
      const page = await clerk.users.getUserList({ limit: pageSize, offset });
      if (page.data.length === 0) break;
      for (const u of page.data) {
        if (checked >= maxChecked) break;
        checked++;
        const meta = (u.publicMetadata ?? {}) as Record<string, unknown>;
        if (meta.role !== 'vip') continue;
        const expiresAt = this.parseExpiresAt(meta);
        if (!this.isExpired(expiresAt)) continue;
        expired++;
        this.logger.warn(`  → VIP hết hạn: ${u.id} (${expiresAt})`);
        if (dryRun) continue;
        try {
          await this.removeVip(u.id);
          downgraded++;
        } catch (e) {
          errors++;
          this.logger.error(`  ✗ Lỗi hạ VIP ${u.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (page.data.length < pageSize) break;
      offset += pageSize;
    }
    this.logger.log(`Sweep hoàn tất: checked=${checked} expired=${expired} downgraded=${downgraded} errors=${errors}`);
    return { checked, expired, downgraded, errors, dryRun };
  }

  /**
   * Lấy trạng thái VIP hiện tại (dùng cho FE hiển thị và tự hạ nếu cần)
   */
  async getVipStatus(userId: string): Promise<{
    role: string;
    plan: string | null;
    expiresAt: string | null;
    isExpired: boolean;
    daysLeft: number | null;
  }> {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new BadRequestException('Chưa cấu hình CLERK_SECRET_KEY');
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const user = await clerk.users.getUser(userId);
    const meta = (user.publicMetadata ?? {}) as Record<string, unknown>;
    const role = typeof meta.role === 'string' ? meta.role : 'user';
    const plan = typeof meta.premiumPlan === 'string' ? meta.premiumPlan : null;
    const expiresAt = this.parseExpiresAt(meta);
    const isExpired = role === 'vip' && this.isExpired(expiresAt);
    let daysLeft: number | null = null;
    if (expiresAt) {
      const t = Date.parse(expiresAt);
      if (!Number.isNaN(t)) daysLeft = Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
    }
    return { role, plan, expiresAt, isExpired, daysLeft };
  }

  private getStripe(): Stripe {
    if (this.stripeInstance) return this.stripeInstance;
    const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
    if (!key) {
      throw new BadRequestException(
        'Chưa cấu hình STRIPE_SECRET_KEY – Vui lòng thêm biến môi trường trên Vercel (Settings → Environment Variables)',
      );
    }
    this.stripeInstance = new Stripe(key);
    return this.stripeInstance;
  }

  async setUserRole(
    userId: string,
    role: 'vip' | 'user' | 'admin',
    plan?: string,
  ) {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new BadRequestException('Chưa cấu hình CLERK_SECRET_KEY');
    }

    const clerk = createClerkClient({
      secretKey: clerkSecretKey,
    });

    return clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        role,
        ...(plan !== undefined ? { premiumPlan: plan } : {}),
      },
    });
  }

  async setUserToVip(
    userId: string,
    plan: PremiumPlan = 'monthly',
    extraMetadata?: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      expiresAt?: string;
    },
  ) {
    let expiresAt = extraMetadata?.expiresAt;
    if (!expiresAt) {
      const durationMap: Record<PremiumPlan, number> = { daily: 1, monthly: 30, yearly: 365 };
      const durationDays = durationMap[plan] ?? 30;
      expiresAt = new Date(
        Date.now() + durationDays * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new BadRequestException('Chưa cấu hình CLERK_SECRET_KEY');
    }

    const clerk = createClerkClient({
      secretKey: clerkSecretKey,
    });

    return clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: 'vip',
        premiumPlan: plan,
        expiresAt,
      },
    });
  }

  async removeVip(userId: string) {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new BadRequestException('Chưa cấu hình CLERK_SECRET_KEY');
    }

    const clerk = createClerkClient({
      secretKey: clerkSecretKey,
    });

    return clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: 'user',
        premiumPlan: null,
        expiresAt: null,
        stripeSubscriptionId: null,
      },
    });
  }

  async findUserIdByStripeCustomerId(
    customerId: string,
  ): Promise<string | undefined> {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) return undefined;
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    try {
      const users = await clerk.users.getUserList({ limit: 100 });
      const user = users.data.find(
        (u) => u.publicMetadata?.stripeCustomerId === customerId,
      );
      return user?.id;
    } catch {
      return undefined;
    }
  }

  async createCheckout(userId: string, plan: PremiumPlan) {
    const selectedPlan = plans[plan];
    if (!selectedPlan)
      throw new BadRequestException('Gói premium không hợp lệ');

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    return this.getStripe().checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: userId,
      metadata: { userId, plan },
      subscription_data: {
        metadata: { userId, plan },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'vnd',
            unit_amount: selectedPlan.amount,
            recurring: { interval: selectedPlan.interval },
            product_data: { name: `GoCode Premium (${plan})` },
          },
        },
      ],
      success_url: `${frontendUrl}/premium/thank-you?plan=${plan}&payment=success`,
      cancel_url: `${frontendUrl}/premium?payment=cancelled`,
    });
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET chưa được cấu hình');
    }

    let event: Stripe.Event;
    try {
      event = this.getStripe().webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.error(
        '❌ Lỗi xác thực Stripe signature:',
        err instanceof Error ? err.message : err,
      );
      throw new BadRequestException(
        `Webhook signature verification failed: ${
          err instanceof Error ? err.message : ''
        }`,
      );
    }

    console.log(`🔔 Stripe event nhận được: ${event.type}`);

    // Idempotency: Stripe retry cùng event.id khi timeout — bỏ qua nếu đã xử lý
    try {
      await this.db.stripeEvent.create({
        data: { eventId: event.id, type: event.type },
      });
    } catch {
      // P2002 unique violation = event đã xử lý trước đó
      this.logger.warn(`Stripe event trùng, bỏ qua: ${event.id}`);
      return { received: true, duplicate: true };
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      if (!userId) {
        console.warn(
          '⚠️ Checkout session hoàn tất nhưng không có userId (có thể là event test từ stripe trigger)',
        );
        return { received: true, warning: 'Thiếu userId' };
      }

      const plan = (session.metadata?.plan as PremiumPlan) ?? 'monthly';
      await this.setUserToVip(userId, plan);
      console.log(
        `✅ Đã nâng VIP thành công cho user: ${userId}, gói: ${plan}`,
      );
    }

    // Hủy/gỡ VIP khi Stripe subscription bị hủy/hết hạn
    if (
      event.type === 'customer.subscription.deleted' ||
      event.type === 'customer.subscription.updated'
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const userId =
        (sub.metadata as Record<string, string> | null)?.userId ??
        (await this.findUserIdByStripeCustomerId(sub.customer as string));
      if (userId) {
        const status = sub.status; // active, canceled, unpaid, past_due, incomplete_expired
        const shouldDowngrade =
          event.type === 'customer.subscription.deleted' ||
          status === 'canceled' ||
          status === 'unpaid' ||
          status === 'incomplete_expired';
        if (shouldDowngrade) {
          this.logger.warn(`Stripe sub ${sub.id} status=${status} → hạ VIP cho ${userId}`);
          await this.removeVip(userId).catch((e) => this.logger.error(`Lỗi hạ VIP từ webhook: ${e}`));
        }
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string | null;
      if (customerId) {
        const userId = await this.findUserIdByStripeCustomerId(customerId);
        if (userId) this.logger.warn(`Invoice payment_failed cho customer ${customerId} (user ${userId})`);
      }
    }

    return { received: true };
  }
}
