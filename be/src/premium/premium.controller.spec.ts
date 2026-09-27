import { describe, expect, it, vi } from 'vitest';
import { PremiumController } from './premium.controller.ts';

function makeController() {
  const service = {
    createCheckout: vi.fn().mockResolvedValue({ id: 'cs_1' }),
    setUserToVip: vi.fn().mockResolvedValue(undefined),
    removeVip: vi.fn().mockResolvedValue(undefined),
    getVipStatus: vi.fn().mockResolvedValue({ role: 'user' }),
    checkAndDowngradeIfExpired: vi.fn().mockResolvedValue({ downgraded: false }),
    handleWebhook: vi.fn().mockResolvedValue({ received: true }),
    sweepExpiredVips: vi.fn().mockResolvedValue({ checked: 0 }),
  };
  return { ctrl: new PremiumController(service as any), service };
}

/** userId trong token luôn là chuỗi, kể cả khi `User.id` là Int. */
function req(userId: string, role: 'vip' | 'user' | 'admin') {
  return { headers: {}, user: { userId, role, roles: [role] } } as any;
}

describe('PremiumController chuẩn hoá userId về số', () => {
  it('checkout đưa userId trong token qua Number()', async () => {
    const { ctrl, service } = makeController();
    await ctrl.createCheckout(req('7', 'user'), 'monthly');
    expect(service.createCheckout).toHaveBeenCalledWith(7, 'monthly');
  });

  it('grant-vip đưa userId trong body qua Number()', async () => {
    const { ctrl, service } = makeController();
    await ctrl.grantVip(req('7', 'admin'), '42', 'yearly');
    expect(service.setUserToVip).toHaveBeenCalledWith(42, 'yearly');
  });

  it('grant-vip không có body thì lấy id trong token', async () => {
    const { ctrl, service } = makeController();
    const res = await ctrl.grantVip(req('7', 'admin'));
    expect(service.setUserToVip).toHaveBeenCalledWith(7, 'monthly');
    expect(res.userId).toBe(7);
  });

  it('cancel-vip đưa userId trong body qua Number()', async () => {
    const { ctrl, service } = makeController();
    const res = await ctrl.cancelVip(req('7', 'admin'), '42');
    expect(service.removeVip).toHaveBeenCalledWith(42);
    expect(res.userId).toBe(42);
  });

  it('status đưa userId trong token qua Number()', async () => {
    const { ctrl, service } = makeController();
    await ctrl.getStatus(req('7', 'user'));
    expect(service.getVipStatus).toHaveBeenCalledWith(7);
  });

  it('userId không phải số nguyên dương thì 400, không gọi service', async () => {
    const { ctrl, service } = makeController();
    await expect(ctrl.getStatus(req('abc', 'user'))).rejects.toThrow(
      'Không xác định được user',
    );
    await expect(ctrl.getStatus({ headers: {} } as any)).rejects.toThrow(
      'Không xác định được user',
    );
    expect(service.getVipStatus).not.toHaveBeenCalled();
  });
});

describe('PremiumController phân quyền route hết hạn VIP', () => {
  it('check-expired chặn non-admin khi kiểm tra user khác', async () => {
    const { ctrl, service } = makeController();
    await expect(ctrl.checkExpired(req('7', 'vip'), '42')).rejects.toThrow(
      'Chỉ admin mới được kiểm tra user khác',
    );
    expect(service.checkAndDowngradeIfExpired).not.toHaveBeenCalled();
  });

  it('check-expired cho admin kiểm tra user khác', async () => {
    const { ctrl, service } = makeController();
    const res = await ctrl.checkExpired(req('7', 'admin'), '42');
    expect(service.checkAndDowngradeIfExpired).toHaveBeenCalledWith(42);
    expect(res.userId).toBe(42);
  });

  it('sweep-expired fail-closed khi thiếu hoặc sai cron secret', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      delete process.env.CRON_SECRET;
      await expect(ctrl.sweepExpired({ body: {} }, undefined)).rejects.toThrow(
        'Thiếu x-cron-secret hợp lệ',
      );
      process.env.CRON_SECRET = 'secret_1';
      await expect(ctrl.sweepExpired({ body: {} }, 'secret_khong')).rejects.toThrow(
        'Thiếu x-cron-secret hợp lệ',
      );
      expect(service.sweepExpiredVips).not.toHaveBeenCalled();
    } finally {
      process.env = { ...OLD };
    }
  });

    it('sweep-expired chạy khi cron secret khớp', async () => {
      const OLD = { ...process.env };
      const { ctrl, service } = makeController();
      try {
        process.env.CRON_SECRET = 'secret_1';
        await ctrl.sweepExpired({ body: { limit: 5, dryRun: true } }, 'secret_1');
        expect(service.sweepExpiredVips).toHaveBeenCalledWith({ limit: 5, dryRun: true });
      } finally {
        process.env = { ...OLD };
      }
    });
});

