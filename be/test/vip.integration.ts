/**
 * VIP gating pilot cho integration test: `VipProblemService` (chính sách đọc
 * bài) + `PremiumService` (vòng đời VIP) với Postgres thật.
 *
 * Không mock gì cả — Stripe (`createCheckout`/`handleWebhook`) cố ý đứng ngoài:
 * đó là provider thanh toán ngoài, unit spec với stub đã phủ; ở đây chỉ test
 * phần đọc/ghi DB nội bộ (nâng/hạ/quét/hết hạn/quyền đọc bài).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service.ts';
import { VipProblemService } from '../src/problems/vip-problem.service.ts';
import { PremiumService } from '../src/premium/premium.service.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { AuthMailer } from '../src/auth/auth.mailer.ts';
import { hashPassword, verifyAccessToken } from '../src/auth/tokens.ts';
import {
  ensureJwtKeys,
  requireTestDatabaseUrl,
  resetAuthTables,
  uniqueEmail,
} from './db-integration.ts';

const DAY = 24 * 60 * 60 * 1000;

describe('VIP gating (integration, DB thật)', () => {
  let db: DatabaseService;
  let vipProblems: VipProblemService;
  let premium: PremiumService;
  let auth: AuthService;

  beforeAll(async () => {
    requireTestDatabaseUrl();
    ensureJwtKeys();
    db = new DatabaseService();
    try {
      await db.$connect();
    } catch (e) {
      throw new Error(
        `Không nối được DB test — chạy \`prisma migrate deploy\` vào DB đó trước. ` +
          `Gốc: ${e instanceof Error ? e.message : e}`,
      );
    }
    vipProblems = new VipProblemService(db);
    premium = new PremiumService(db);
    // Mailer thật nhưng đường login không gửi mail nên Mailpit không cần thiết
    // ở file này — không đụng tới mailbox của file auth.
    auth = new AuthService(db, new AuthMailer(), premium);
  });

  afterAll(async () => {
    await resetAuthTables(db);
    await db.$disconnect();
  });

  let n = 0;
  async function seedProblem(isVip: boolean) {
    n += 1;
    return db.problem.create({
      data: {
        slug: `itest-vip-${Date.now()}-${n}`,
        title: `Bài VIP test ${n}`,
        difficulty: 'easy',
        topic: 'arrays',
        description: 'đề test',
        tests: [],
        hiddenTests: [],
        isVip,
      },
    });
  }

  async function seedUser(opts: { role?: string; vipExpiresAt?: Date | null } = {}) {
    return db.user.create({
      data: {
        email: uniqueEmail('itest-vip'),
        passwordHash: await hashPassword('matkhau123'),
        emailVerifiedAt: new Date(),
        role: opts.role ?? 'user',
        ...(opts.vipExpiresAt !== undefined ? { vipExpiresAt: opts.vipExpiresAt } : {}),
      },
    });
  }

  beforeEach(async () => {
    await db.problem.deleteMany({ where: { slug: { startsWith: 'itest-' } } });
    await resetAuthTables(db);
  });

  it('isVipSlug: true/false, slug không tồn tại thì false chứ không ném', async () => {
    const vip = await seedProblem(true);
    const thuong = await seedProblem(false);
    expect(await vipProblems.isVipSlug(vip.slug)).toBe(true);
    expect(await vipProblems.isVipSlug(thuong.slug)).toBe(false);
    // Fail-closed: "không có bài" là câu của 404, không phải của chính sách.
    await expect(vipProblems.isVipSlug('itest-khong-ton-tai')).resolves.toBe(false);
  });

  it('assertSlugAllowed: vip/admin qua, user/khách chặn 403, bài thường ai cũng qua', async () => {
    const vip = await seedProblem(true);
    const thuong = await seedProblem(false);
    await expect(vipProblems.assertSlugAllowed(vip.slug, 'vip')).resolves.toBeUndefined();
    await expect(vipProblems.assertSlugAllowed(vip.slug, 'admin')).resolves.toBeUndefined();
    await expect(vipProblems.assertSlugAllowed(vip.slug, 'user')).rejects.toMatchObject({
      status: 403,
    });
    await expect(vipProblems.assertSlugAllowed(vip.slug, null)).rejects.toMatchObject({
      status: 403,
    });
    await expect(vipProblems.assertSlugAllowed(thuong.slug, 'user')).resolves.toBeUndefined();
    await expect(
      vipProblems.assertSlugAllowed('itest-khong-ton-tai', 'user'),
    ).resolves.toBeUndefined();
  });

  it('user thường checkAndDowngrade không đụng DB', async () => {
    const u = await seedUser();
    const r = await premium.checkAndDowngradeIfExpired(u.id);
    expect(r).toMatchObject({ downgraded: false, wasVip: false });
    const row = await db.user.findUnique({ where: { id: u.id } });
    expect(row?.role).toBe('user');
    expect(row?.vipExpiresAt).toBeNull();
  });

  it('vip còn hạn được giữ, vip hết hạn bị hạ về user trong DB', async () => {
    const fresh = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() + 30 * DAY) });
    const het = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() - DAY) });
    expect((await premium.checkAndDowngradeIfExpired(fresh.id)).downgraded).toBe(false);
    expect((await db.user.findUnique({ where: { id: fresh.id } }))?.role).toBe('vip');
    const r = await premium.checkAndDowngradeIfExpired(het.id);
    expect(r).toMatchObject({ downgraded: true, wasVip: true, expired: true });
    const row = await db.user.findUnique({ where: { id: het.id } });
    expect(row?.role).toBe('user');
  });

  it('setUserToVip monthly hẹn ~30 ngày, removeVip trả về user sạch hạn', async () => {
    const u = await seedUser();
    await premium.setUserToVip(u.id, 'monthly');
    const vip = await db.user.findUnique({ where: { id: u.id } });
    expect(vip?.role).toBe('vip');
    expect(vip?.premiumPlan).toBe('monthly');
    const days = Math.round(((vip?.vipExpiresAt?.getTime() ?? 0) - Date.now()) / DAY);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
    await premium.removeVip(u.id);
    const thuong = await db.user.findUnique({ where: { id: u.id } });
    expect(thuong?.role).toBe('user');
    expect(thuong?.vipExpiresAt).toBeNull();
  });

  it('getVipStatus phản ánh đúng hạn và cờ hết hạn', async () => {
    const fresh = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() + 30 * DAY) });
    const het = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() - DAY) });
    const ok = await premium.getVipStatus(fresh.id);
    expect(ok).toMatchObject({ role: 'vip', isExpired: false });
    expect(ok.daysLeft).toBeGreaterThan(0);
    const hetHan = await premium.getVipStatus(het.id);
    expect(hetHan).toMatchObject({ role: 'vip', isExpired: true });
    expect(hetHan.daysLeft).toBeLessThanOrEqual(0);
  });

  it('sweepExpiredVips chỉ hạ đúng tài khoản hết hạn; dryRun không ghi', async () => {
    const het = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() - DAY) });
    const fresh = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() + 30 * DAY) });
    const thuong = await seedUser();
    const kho = await premium.sweepExpiredVips({ dryRun: true });
    expect(kho).toMatchObject({ expired: 1, downgraded: 0, dryRun: true });
    // Dry-run không được ghi gì.
    expect((await db.user.findUnique({ where: { id: het.id } }))?.role).toBe('vip');
    const that = await premium.sweepExpiredVips();
    expect(that).toMatchObject({ expired: 1, downgraded: 1, errors: 0, dryRun: false });
    expect((await db.user.findUnique({ where: { id: het.id } }))?.role).toBe('user');
    expect((await db.user.findUnique({ where: { id: fresh.id } }))?.role).toBe('vip');
    expect((await db.user.findUnique({ where: { id: thuong.id } }))?.role).toBe('user');
  });

  it('login của vip hết hạn: token mang role user + DB bị hạ (đường roleForToken)', async () => {
    const u = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() - DAY) });
    const r = await auth.login(u.email, 'matkhau123', 'IntegrationTest/1.0');
    const checked = await verifyAccessToken(r.accessToken);
    // Token ký SAU khi hạ — VIP quá hạn không còn lọt role=vip vào token.
    expect(checked).toMatchObject({ sub: String(u.id), role: 'user' });
    expect((await db.user.findUnique({ where: { id: u.id } }))?.role).toBe('user');
  });

  it('login của vip còn hạn giữ nguyên role vip trong token', async () => {
    const u = await seedUser({ role: 'vip', vipExpiresAt: new Date(Date.now() + 30 * DAY) });
    const r = await auth.login(u.email, 'matkhau123', 'IntegrationTest/1.0');
    expect(await verifyAccessToken(r.accessToken)).toMatchObject({ role: 'vip' });
  });
});
