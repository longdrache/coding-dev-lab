import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('stripe', () => ({
  default: class FakeStripe {
    webhooks = {
      constructEvent: (payload: Buffer) => ({
        id: 'evt_test_1',
        type: 'unknown-type',
        data: { object: {} },
        raw: payload.toString(),
      }),
    };
  },
}));

import { PremiumService } from './premium.service.ts';

describe('PremiumService.isExpired', () => {
  it('phân biệt hết hạn / còn hạn / không hạn / sai định dạng', () => {
    const svc = new PremiumService({} as any);
    expect(svc.isExpired(null)).toBe(false);
    expect(svc.isExpired(undefined)).toBe(false);
    expect(svc.isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(svc.isExpired(new Date(Date.now() + 86_400_000).toISOString())).toBe(false);
    expect(svc.isExpired('not-a-date')).toBe(false);
  });
});

describe('PremiumService.handleWebhook', () => {
  const OLD = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD };
  });

  function makeService(createImpl?: (args: unknown) => Promise<unknown>) {
    const db = {
      stripeEvent: { create: vi.fn().mockImplementation(createImpl ?? (() => Promise.resolve({}))) },
    };
    return { svc: new PremiumService(db as any), db };
  }

  it('báo lỗi khi thiếu webhook secret', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { svc } = makeService();
    await expect(svc.handleWebhook(Buffer.from('x'), 'sig')).rejects.toThrow('STRIPE_WEBHOOK_SECRET');
  });

  it('bỏ qua event trùng (idempotency), không xử lý tiếp', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const err = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const { svc, db } = makeService(() => Promise.reject(err));
    const res = await svc.handleWebhook(Buffer.from('x'), 'sig');
    expect(res).toEqual({ received: true, duplicate: true });
    expect(db.stripeEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt_test_1', type: 'unknown-type' },
    });
  });
});
