import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  event: { id: 'evt_test_1', type: 'unknown-type', data: { object: {} as any } },
}));

vi.mock('stripe', () => ({
  default: class FakeStripe {
    webhooks = {
      constructEvent: (payload: Buffer) => ({ ...h.event, raw: payload.toString() }),
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

describe('PremiumService đọc/ghi trạng thái VIP trong DB', () => {
  function makeService(user: Record<string, unknown> | null = {}) {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({ id: 7 }),
      },
    };
    return { svc: new PremiumService(db as any), db };
  }

  describe('getVipStatus', () => {
    it('đọc role, premiumPlan, vipExpiresAt từ cột của user', async () => {
      const until = new Date(Date.now() + 12 * 3_600_000);
      const { svc, db } = makeService({ role: 'vip', premiumPlan: 'yearly', vipExpiresAt: until });
      const res = await svc.getVipStatus(7);
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { role: true, premiumPlan: true, vipExpiresAt: true },
      });
      expect(res).toEqual({
        role: 'vip',
        plan: 'yearly',
        expiresAt: until.toISOString(),
        isExpired: false,
        daysLeft: 1,
      });
    });

    it('user thường trả plan/hạn null và không đụng DB ghi', async () => {
      const { svc, db } = makeService({ role: 'user', premiumPlan: null, vipExpiresAt: null });
      const res = await svc.getVipStatus(7);
      expect(res).toEqual({ role: 'user', plan: null, expiresAt: null, isExpired: false, daysLeft: null });
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('đánh dấu isExpired khi vipExpiresAt đã qua mốc hiện tại', async () => {
      const { svc } = makeService({
        role: 'vip',
        premiumPlan: 'monthly',
        vipExpiresAt: new Date(Date.now() - 1000),
      });
      expect((await svc.getVipStatus(7)).isExpired).toBe(true);
    });

    it('user không tồn tại thì coi như user thường, không ném lỗi', async () => {
      const { svc } = makeService(null);
      const res = await svc.getVipStatus(7);
      expect(res).toEqual({ role: 'user', plan: null, expiresAt: null, isExpired: false, daysLeft: null });
    });
  });

  describe('setUserRole', () => {
    it('ghi role vào DB, không đụng plan khi không truyền', async () => {
      const { svc, db } = makeService();
      await svc.setUserRole(7, 'admin');
      expect(db.user.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { role: 'admin' } });
    });

    it('ghi kèm premiumPlan khi có truyền', async () => {
      const { svc, db } = makeService();
      await svc.setUserRole(7, 'vip', 'yearly');
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { role: 'vip', premiumPlan: 'yearly' },
      });
    });
  });

  describe('setUserToVip', () => {
    it('cấp VIP ghi đủ role, vipExpiresAt, premiumPlan, stripeSubscriptionId', async () => {
      const { svc, db } = makeService();
      await svc.setUserToVip(7, 'monthly', { stripeSubscriptionId: 'sub_1' });
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          role: 'vip',
          vipExpiresAt: expect.any(Date),
          premiumPlan: 'monthly',
          stripeSubscriptionId: 'sub_1',
        },
      });
    });

    it('tôn trọng expiresAt truyền vào thay vì tự tính lại', async () => {
      const until = new Date(Date.now() + 5 * 86_400_000).toISOString();
      const { svc, db } = makeService();
      await svc.setUserToVip(7, 'monthly', { expiresAt: until });
      expect(db.user.update.mock.calls[0][0].data.vipExpiresAt.toISOString()).toBe(until);
    });

    it('không có expiresAt thì tự tính theo gói (daily = 1 ngày)', async () => {
      const { svc, db } = makeService();
      await svc.setUserToVip(7, 'daily');
      const days = Math.round(
        (db.user.update.mock.calls[0][0].data.vipExpiresAt.getTime() - Date.now()) / 86_400_000,
      );
      expect(days).toBe(1);
    });

    it('nhận cả tên cũ stripeCustomerId và ghi vào cột stripeSubscriptionId', async () => {
      const { svc, db } = makeService();
      await svc.setUserToVip(7, 'yearly', { stripeCustomerId: 'cus_9' });
      expect(db.user.update.mock.calls[0][0].data.stripeSubscriptionId).toBe('cus_9');
    });
  });

  describe('removeVip', () => {
    it('thu hồi VIP xoá cả hạn, plan và subscription', async () => {
      const { svc, db } = makeService();
      await svc.removeVip(7);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { role: 'user', vipExpiresAt: null, premiumPlan: null, stripeSubscriptionId: null },
      });
    });
  });

  describe('checkAndDowngradeIfExpired', () => {
    it('VIP còn hạn thì báo rõ và không ghi xuống DB', async () => {
      const { svc, db } = makeService({ role: 'vip', vipExpiresAt: new Date(Date.now() + 3_600_000) });
      const res = await svc.checkAndDowngradeIfExpired(7);
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { role: true, premiumPlan: true, vipExpiresAt: true },
      });
      expect(res.downgraded).toBe(false);
      expect(res.wasVip).toBe(true);
      expect(res.expired).toBe(false);
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('VIP hết hạn thì hạ xuống user', async () => {
      const { svc, db } = makeService({ role: 'vip', vipExpiresAt: new Date(Date.now() - 1000) });
      const res = await svc.checkAndDowngradeIfExpired(7);
      expect(res).toEqual({
        downgraded: true,
        wasVip: true,
        expired: true,
        expiresAt: expect.any(String),
      });
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { role: 'user', vipExpiresAt: null, premiumPlan: null, stripeSubscriptionId: null },
      });
    });

    it('user thường thì bỏ qua, không hạ nhầm', async () => {
      const { svc, db } = makeService({ role: 'user', vipExpiresAt: null });
      const res = await svc.checkAndDowngradeIfExpired(7);
      expect(res).toEqual({ downgraded: false, wasVip: false, expired: false, expiresAt: null });
      expect(db.user.update).not.toHaveBeenCalled();
    });
  });

  describe('sweepExpiredVips', () => {
    const QUERY = {
      where: { role: 'vip', vipExpiresAt: { lt: expect.any(Date) } },
      select: { id: true, vipExpiresAt: true },
      take: 1000,
    };
    const OFF_DATA = {
      role: 'user',
      vipExpiresAt: null,
      premiumPlan: null,
      stripeSubscriptionId: null,
    };

    it('chỉ quét role vip có vipExpiresAt đã qua', async () => {
      const { svc, db } = makeService();
      db.user.findMany.mockResolvedValue([
        { id: 1, vipExpiresAt: new Date(Date.now() - 86_400_000) },
        { id: 2, vipExpiresAt: new Date(Date.now() - 1000) },
      ]);
      const res = await svc.sweepExpiredVips();
      expect(db.user.findMany).toHaveBeenCalledWith(QUERY);
      expect(res).toEqual({ checked: 2, expired: 2, downgraded: 2, errors: 0, dryRun: false });
      expect(db.user.update).toHaveBeenCalledTimes(2);
      expect(db.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: OFF_DATA });
      expect(db.user.update).toHaveBeenCalledWith({ where: { id: 2 }, data: OFF_DATA });
    });

    it('dryRun chỉ đếm, không ghi DB', async () => {
      const { svc, db } = makeService();
      db.user.findMany.mockResolvedValue([{ id: 1, vipExpiresAt: new Date(Date.now() - 1000) }]);
      const res = await svc.sweepExpiredVips({ dryRun: true });
      expect(res).toEqual({ checked: 1, expired: 1, downgraded: 0, errors: 0, dryRun: true });
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('giới hạn số user một lượt quét bằng limit', async () => {
      const { svc, db } = makeService();
      await svc.sweepExpiredVips({ limit: 25 });
      expect(db.user.findMany).toHaveBeenCalledWith({ ...QUERY, take: 25 });
    });

    it('một user lỗi không làm hỏng cả lượt quét', async () => {
      const { svc, db } = makeService();
      (svc as any).logger.error = vi.fn();
      db.user.findMany.mockResolvedValue([
        { id: 1, vipExpiresAt: new Date(Date.now() - 1000) },
        { id: 2, vipExpiresAt: new Date(Date.now() - 1000) },
      ]);
      db.user.update.mockRejectedValueOnce(new Error('DB chết'));
      const res = await svc.sweepExpiredVips();
      expect(res).toEqual({ checked: 2, expired: 2, downgraded: 1, errors: 1, dryRun: false });
    });
  });

  describe('findUserIdByStripeCustomerId', () => {
    it('tìm user theo cột stripeSubscriptionId', async () => {
      const { svc, db } = makeService();
      db.user.findFirst.mockResolvedValue({ id: 42 });
      expect(await svc.findUserIdByStripeCustomerId('cus_1')).toBe(42);
      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'cus_1' },
        select: { id: true },
      });
    });

    it('không tìm thấy thì trả null, không ném lỗi', async () => {
      const { svc } = makeService();
      expect(await svc.findUserIdByStripeCustomerId('cus_khong')).toBeNull();
    });
  });
});

describe('PremiumService.createCheckout', () => {
  const OLD = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD };
  });

  function makeService() {
    const createMock = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' });
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({ id: 7 }),
      },
    };
    const svc = new PremiumService(db as any);
    (svc as any).stripeInstance = {
      checkout: { sessions: { create: createMock } },
    };
    return { svc, createMock };
  }

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  it('dùng mode payment, không có recurring/subscription_data', async () => {
    const { svc, createMock } = makeService();
    await svc.createCheckout(7, 'monthly');
    const arg = createMock.mock.calls[0][0];
    expect(arg.mode).toBe('payment');
    expect(arg.recurring).toBeUndefined();
    expect(arg.subscription_data).toBeUndefined();
  });

  it('tính vipExpiresAt từ thời lượng gói (monthly = 30 ngày)', async () => {
    const { svc } = makeService();
    const before = Date.now();
    await svc.setUserToVip(7, 'monthly');
    const after = Date.now();
    const expiresAt = (svc as any).toIso;
    const db = (svc as any).db;
    const vipExpiresAt = db.user.update.mock.calls[0][0].data.vipExpiresAt.getTime();
    expect(vipExpiresAt).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
    expect(vipExpiresAt).toBeLessThanOrEqual(after + 30 * 86_400_000);
  });

  it('tính vipExpiresAt từ thời lượng gói (yearly = 365 ngày)', async () => {
    const { svc } = makeService();
    const before = Date.now();
    await svc.setUserToVip(7, 'yearly');
    const after = Date.now();
    const db = (svc as any).db;
    const vipExpiresAt = db.user.update.mock.calls[0][0].data.vipExpiresAt.getTime();
    expect(vipExpiresAt).toBeGreaterThanOrEqual(before + 365 * 86_400_000);
    expect(vipExpiresAt).toBeLessThanOrEqual(after + 365 * 86_400_000);
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
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    return { svc: new PremiumService(db as any), db };
  }

  function emit(type: string, object: Record<string, unknown>) {
    h.event = { id: 'evt_test_1', type, data: { object } };
  }

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    emit('unknown-type', {});
  });

  it('báo lỗi khi thiếu webhook secret', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { svc } = makeService();
    await expect(svc.handleWebhook(Buffer.from('x'), 'sig')).rejects.toThrow('STRIPE_WEBHOOK_SECRET');
  });

  it('bỏ qua event trùng (idempotency), không xử lý tiếp', async () => {
    const err = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const { svc, db } = makeService(() => Promise.reject(err));
    const res = await svc.handleWebhook(Buffer.from('x'), 'sig');
    expect(res).toEqual({ received: true, duplicate: true });
    expect(db.stripeEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt_test_1', type: 'unknown-type' },
    });
  });

  it('checkout.session.completed cấp VIP và lưu customer id để tra ngược được', async () => {
    emit('checkout.session.completed', {
      customer: 'cus_7',
      metadata: { userId: '7', plan: 'yearly' },
    });
    const { svc, db } = makeService();
    await svc.handleWebhook(Buffer.from('x'), 'sig');
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        role: 'vip',
        vipExpiresAt: expect.any(Date),
        premiumPlan: 'yearly',
        stripeSubscriptionId: 'cus_7',
      },
    });
  });

  it('checkout.session.completed thiếu userId hợp lệ thì bỏ qua, không ghi DB', async () => {
    emit('checkout.session.completed', { customer: 'cus_7', metadata: {} });
    const { svc, db } = makeService();
    const res = await svc.handleWebhook(Buffer.from('x'), 'sig');
    expect(res).toEqual({ received: true, warning: 'Thiếu userId' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('customer.subscription.deleted không còn hạ VIP (không còn subscription)', async () => {
    emit('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_7', metadata: null, status: 'canceled' });
    const { svc, db } = makeService();
    db.user.findFirst.mockResolvedValue({ id: 7 });
    await svc.handleWebhook(Buffer.from('x'), 'sig');
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('customer.subscription.updated không còn hạ VIP (không còn subscription)', async () => {
    emit('customer.subscription.updated', { id: 'sub_1', customer: 'cus_7', metadata: { userId: '7' }, status: 'active' });
    const { svc, db } = makeService();
    await svc.handleWebhook(Buffer.from('x'), 'sig');
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
