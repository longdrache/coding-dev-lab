/**
 * Auth pilot cho integration test: `AuthService` + `PremiumService` +
 * `AuthMailer` THẬT, Postgres thật, SMTP thật (Mailpit), bcrypt thật, JWT thật.
 * Không còn stub nào trên đường gửi mail: token trong test là token trích từ
 * mail Mailpit bắt được — đúng thứ người dùng bấm trong hộp thư.
 *
 * Vì sao file này tồn tại song song với `auth.service.spec.ts` (DB giả):
 * DB giả tự viết tay semantic Prisma — sai `orderBy`/tie-break, sai `where`
 * thì test vẫn xanh giả. Những test dưới đây chỉ xanh khi SQL thật đúng, đặc
 * biệt test "login lần 11" (tie-break `id` trên Postgres thật).
 *
 * Cần trước khi chạy: Postgres test đã migrate + Mailpit đang chạy:
 *   docker run -d --name gocode-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:55432/gocode pnpm test:integration
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { AuthMailer } from '../src/auth/auth.mailer.ts';
import { PremiumService } from '../src/premium/premium.service.ts';
import { verifyAccessToken } from '../src/auth/tokens.ts';
import {
  ensureJwtKeys,
  extractVerifyToken,
  requireTestDatabaseUrl,
  resetAuthTables,
  uniqueEmail,
} from './db-integration.ts';
import {
  mailpitClear,
  mailpitReady,
  mailpitTo,
  mailpitWaitFor,
  type MailpitMessage,
} from './mailpit.ts';

const PASSWORD = 'matkhau123';
const UA = 'IntegrationTest/1.0';
const MAIL_FROM = 'no-reply@gocode.local';

const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAILPIT_URL'];
const OLD_ENV: Record<string, string | undefined> = {};

describe('Auth (integration, DB + SMTP thật)', () => {
  let db: DatabaseService;
  let svc: AuthService;

  beforeAll(async () => {
    requireTestDatabaseUrl();
    ensureJwtKeys();
    for (const k of SMTP_VARS) OLD_ENV[k] = process.env[k];
    // Trỏ mailer thật vào Mailpit local (xem `AuthMailer.readConfig`):
    // plaintext, không auth — đúng mặc định của Mailpit.
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    process.env.MAIL_FROM = MAIL_FROM;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await mailpitReady();
    db = new DatabaseService();
    try {
      await db.$connect();
    } catch (e) {
      throw new Error(
        `Không nối được DB test — chạy \`prisma migrate deploy\` vào DB đó trước. ` +
          `Gốc: ${e instanceof Error ? e.message : e}`,
      );
    }
    svc = new AuthService(db, new AuthMailer(), new PremiumService(db));
  });

  afterAll(async () => {
    for (const k of SMTP_VARS) {
      if (OLD_ENV[k] === undefined) delete process.env[k];
      else process.env[k] = OLD_ENV[k];
    }
    await resetAuthTables(db);
    await db.$disconnect();
  });

  beforeEach(async () => {
    await mailpitClear();
    await resetAuthTables(db);
  });

  /** Chờ đúng n mail tới địa chỉ (đường resend chạy nền, không await được). */
  async function choMail(email: string, n: number): Promise<MailpitMessage[]> {
    return mailpitWaitFor((msgs) => msgs.filter((m) => m.to.includes(email)).length === n, {
      moTa: `${n} mail tới ${email}`,
    });
  }

  async function registerVerified(email = uniqueEmail()): Promise<{ id: number; email: string }> {
    await svc.register(email, PASSWORD, UA);
    const [mail] = await choMail(email, 1);
    const out = await svc.verifyEmail(extractVerifyToken(mail.text), UA);
    expect(out).not.toBeNull();
    const row = await db.user.findUnique({ where: { email } });
    expect(row?.emailVerifiedAt).not.toBeNull();
    return { id: row!.id, email };
  }

  it('đăng ký gửi 1 mail thật có token dùng được', async () => {
    const email = uniqueEmail();
    await svc.register(email, PASSWORD, UA);
    const [mail] = await choMail(email, 1);
    expect(mail.from).toBe(MAIL_FROM);
    expect(mail.subject).toContain('Xác nhận');
    const row = await db.user.findUnique({ where: { email } });
    expect(row?.emailVerifiedAt).toBeNull();
    // Token trong mail phải mở được tài khoản — đúng thứ người dùng bấm.
    const out = await svc.verifyEmail(extractVerifyToken(mail.text), UA);
    expect(out?.user.email).toBe(email);
  });

  it('chưa xác minh thì login 401 với câu FE dùng để hiện nút gửi lại', async () => {
    const email = uniqueEmail();
    await svc.register(email, PASSWORD, UA);
    await choMail(email, 1);
    const e = await svc.login(email, PASSWORD, UA).catch((x) => x);
    expect(e.status).toBe(401);
    // Hợp đồng với FE (`AuthForm` hiện nút "Gửi lại link xác nhận" khi error
    // chứa chuỗi này) — đổi câu là FE mất nút, nên ghim ở đây.
    expect(String(e.message)).toContain('chưa được xác minh');
    expect(await db.userToken.count({ where: { type: 'refresh' } })).toBe(0);
  });

  it('login cấp access ký RS256 thật + thêm đúng 1 dòng refresh + điểm danh', async () => {
    const { id, email } = await registerVerified();
    // `verifyEmail` trong helper cũng đã cấp 1 phiên (`verifyEmail` đi qua
    // `issueSession`) — nên đếm tương đối: login phải thêm đúng 1 dòng.
    const truoc = await db.userToken.count({ where: { userId: id, type: 'refresh' } });
    const r = await svc.login(email, PASSWORD, UA);
    const checked = await verifyAccessToken(r.accessToken);
    expect(checked).toMatchObject({ sub: String(id), role: 'user' });
    const rows = await db.userToken.findMany({ where: { userId: id, type: 'refresh' } });
    expect(rows).toHaveLength(truoc + 1);
    expect(rows.at(-1)?.userAgent).toBe(UA);
    expect(
      await db.activityDay.count({ where: { userId: id } }),
    ).toBe(1);
  });

  it('sai mật khẩu / email lạ đều 401 BAD_CREDENTIALS', async () => {
    const { email } = await registerVerified();
    const sai = await svc.login(email, 'sai-mat-khau', UA).catch((x) => x);
    expect(sai.status).toBe(401);
    expect(String(sai.message)).toContain('không đúng');
    const la = await svc.login(uniqueEmail('la'), PASSWORD, UA).catch((x) => x);
    expect(la.status).toBe(401);
  });

  it('refresh xoay vòng tại chỗ, token cũ còn dùng được trong grace', async () => {
    const { id, email } = await registerVerified();
    const first = await svc.login(email, PASSWORD, UA);
    const truoc = await db.userToken.count({ where: { userId: id, type: 'refresh' } });
    const second = await svc.refresh(first.refreshToken, UA);
    expect(second).not.toBeNull();
    // Xoay tại chỗ: số dòng không đổi, không nhân bản phiên.
    expect(await db.userToken.count({ where: { userId: id, type: 'refresh' } })).toBe(truoc);
    // Token vừa bị thay vẫn dùng được ngay (đệm 30s cho tab chậm).
    const again = await svc.refresh(first.refreshToken, UA);
    expect(again).not.toBeNull();
    expect(again?.user.email).toBe(email);
  });

  it('refresh bằng rác thì null để client tự xoá phiên', async () => {
    await expect(svc.refresh('khong-phai-token', UA)).resolves.toBeNull();
  });

  it('resend: cooldown chặn gửi dồn, đã xác minh thì không gửi thêm', async () => {
    const email = uniqueEmail();
    await svc.register(email, PASSWORD, UA);
    await choMail(email, 1);
    // Mã lúc đăng ký còn trong cooldown 1 giờ nên gửi lại ngay bị chặn đúng
    // thiết kế — lùi `createdAt` về 2 giờ trước để giả lập cooldown đã hết
    // (cùng kỹ thuật `quayLai` của unit test, nhưng bằng SQL thật).
    const user = await db.user.findUnique({ where: { email } });
    await db.userToken.updateMany({
      where: { userId: user!.id, type: 'verify_email' },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    await svc.resendVerification(email, UA);
    await choMail(email, 2);
    // Bấm ngay lần nữa trong cooldown: DB không thêm dòng là chốt chặn chính
    // (đồng bộ, quyết định); mail không tăng là hệ quả — chờ 2.5s cho đường
    // nền kịp chạy rồi mới chốt số mail.
    const dongTruoc = await db.userToken.count({ where: { type: 'verify_email' } });
    await svc.resendVerification(email, UA);
    await new Promise((r) => setTimeout(r, 2500));
    expect(await db.userToken.count({ where: { type: 'verify_email' } })).toBe(dongTruoc);
    expect(await mailpitTo(email)).toHaveLength(2);
    // Xác minh xong rồi gửi lại cũng không thêm gì.
    const mails = await mailpitTo(email);
    await svc.verifyEmail(extractVerifyToken(mails.at(-1)!.text), UA);
    await svc.resendVerification(email, UA);
    await new Promise((r) => setTimeout(r, 2500));
    expect(await mailpitTo(email)).toHaveLength(2);
  });

  it('login lần 11 cắt phiên cũ nhất, còn đúng 10 dòng và phiên mới nhất sống', async () => {
    const { id, email } = await registerVerified();
    let newest = '';
    for (let i = 0; i < 11; i++) {
      newest = (await svc.login(email, PASSWORD, `${UA}-${i}`)).refreshToken;
    }
    const rows = await db.userToken.findMany({
      where: { userId: id, type: 'refresh' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(rows).toHaveLength(10);
    // Phiên mới nhất phải là kẻ sống sót — chứng minh `orderBy` + tie-break
    // `id` chạy đúng trên Postgres thật (thứ DB giả không chứng minh được).
    const kept = await svc.refresh(newest, UA);
    expect(kept).not.toBeNull();
  });
});
