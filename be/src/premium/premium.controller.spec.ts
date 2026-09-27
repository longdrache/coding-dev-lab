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
      await expect(ctrl.sweepExpired({ body: {} }, undefined, undefined)).rejects.toThrow(
        'Cron secret không hợp lệ',
      );
      process.env.CRON_SECRET = 'secret_1';
      await expect(
        ctrl.sweepExpired({ body: {} }, 'secret_khong', undefined),
      ).rejects.toThrow('Cron secret không hợp lệ');
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

/**
 * Khoá hành vi bảo mật của route quét VIP. Route này quét và **hạ role** trong DB
 * nên mọi đường vào đều phải fail-closed.
 *
 * Nhóm test này cố ý bọc route `@Get` — chính là đường Vercel Cron gọi. Xoá nhánh
 * `Authorization` trong `assertCronSecret` sẽ làm các test dưới đây đỏ, vì
 * `sweepExpiredByCron` sẽ chỉ còn nhận `x-cron-secret` mà Vercel không gửi.
 */
describe('PremiumController — route quét VIP nhận secret qua cả hai đường', () => {
  it('x-cron-secret đúng thì qua (đường cũ, giữ để không phá client)', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      process.env.CRON_SECRET = 'secret_1';
      await ctrl.sweepExpiredByCron('secret_1', undefined);
      expect(service.sweepExpiredVips).toHaveBeenCalledWith({});
    } finally {
      process.env = { ...OLD };
    }
  });

  it('Authorization: Bearer đúng thì qua (đường Vercel Cron thật sự dùng)', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      process.env.CRON_SECRET = 'secret_1';
      await ctrl.sweepExpiredByCron(undefined, 'Bearer secret_1');
      expect(service.sweepExpiredVips).toHaveBeenCalledWith({});
    } finally {
      process.env = { ...OLD };
    }
  });

  it('sai cả hai đường thì 401 và không quét', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      process.env.CRON_SECRET = 'secret_1';
      await expect(
        ctrl.sweepExpiredByCron('x_cron_sai', 'Bearer secret_sai'),
      ).rejects.toThrow('Cron secret không hợp lệ');
      expect(service.sweepExpiredVips).not.toHaveBeenCalled();
    } finally {
      process.env = { ...OLD };
    }
  });

  it('không có header secret nào thì 401', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      process.env.CRON_SECRET = 'secret_1';
      await expect(ctrl.sweepExpiredByCron(undefined, undefined)).rejects.toThrow(
        'Cron secret không hợp lệ',
      );
      expect(service.sweepExpiredVips).not.toHaveBeenCalled();
    } finally {
      process.env = { ...OLD };
    }
  });

  it('CRON_SECRET chưa cấu hình thì 401 kể cả khi header khớp', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      delete process.env.CRON_SECRET;
      await expect(ctrl.sweepExpiredByCron('bat_ky', undefined)).rejects.toThrow(
        'Cron secret không hợp lệ',
      );
      await expect(
        ctrl.sweepExpiredByCron(undefined, 'Bearer bat_ky'),
      ).rejects.toThrow('Cron secret không hợp lệ');
      expect(service.sweepExpiredVips).not.toHaveBeenCalled();
    } finally {
      process.env = { ...OLD };
    }
  });

  it('header Authorization thiếu tiền tố Bearer thì không được coi là hợp lệ', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      process.env.CRON_SECRET = 'secret_1';
      await expect(ctrl.sweepExpiredByCron(undefined, 'secret_1')).rejects.toThrow(
        'Cron secret không hợp lệ',
      );
      expect(service.sweepExpiredVips).not.toHaveBeenCalled();
    } finally {
      process.env = { ...OLD };
    }
  });

  it('@Post cũng nhận được Authorization: Bearer, không chỉ x-cron-secret', async () => {
    const OLD = { ...process.env };
    const { ctrl, service } = makeController();
    try {
      process.env.CRON_SECRET = 'secret_1';
      await ctrl.sweepExpired({ body: {} }, undefined, 'Bearer secret_1');
      expect(service.sweepExpiredVips).toHaveBeenCalledWith({
        limit: undefined,
        dryRun: false,
      });
    } finally {
      process.env = { ...OLD };
    }
  });
});

