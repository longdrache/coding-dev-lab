import { BadRequestException, Injectable } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import Stripe from 'stripe';

export type PremiumPlan = 'monthly' | 'yearly';

const plans: Record<
  PremiumPlan,
  { amount: number; interval: 'month' | 'year' }
> = {
  monthly: { amount: 100, interval: 'month' },
  yearly: { amount: 200, interval: 'year' },
};

@Injectable()
export class PremiumService {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

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

  async setUserToVip(userId: string, plan: PremiumPlan = 'monthly') {
    return this.setUserRole(userId, 'vip', plan);
  }

  async createCheckout(userId: string, plan: PremiumPlan) {
    const selectedPlan = plans[plan];
    if (!selectedPlan)
      throw new BadRequestException('Gói premium không hợp lệ');

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: userId,
      metadata: { userId, plan },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: selectedPlan.amount,
            recurring: { interval: selectedPlan.interval },
            product_data: { name: `Coding Dev Lab VIP (${plan})` },
          },
        },
      ],
      success_url: `${frontendUrl}/vip?payment=success`,
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
      event = this.stripe.webhooks.constructEvent(
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

    return { received: true };
  }
}
