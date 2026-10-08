/**
 * Hạ tầng dùng chung cho integration test (DB thật).
 *
 * Khác với unit test (`*.spec.ts` dùng DB giả trong RAM): ở đây service thật
 * nói chuyện với Postgres thật qua `DatabaseService` thật — bắt được đúng lớp
 * lỗi mà DB giả không thấy (sai `where`, sai `orderBy`/tie-break, NOT NULL,
 * unique, FK). Mail cũng đi SMTP thật vào Mailpit (`test/mailpit.ts`), chỉ có
 * khoá RSA là tự sinh khi env thiếu (giống `test/api.e2e-spec.ts`), vì key chỉ
 * để ký token trong lúc test.
 *
 * An toàn:
 * - KHÔNG đọc `.env`/`.env.test` ở đây: `be/.env` trỏ Neon production. URL
 *   phải tới từ shell (`DATABASE_URL=... pnpm test:integration`), và host Neon
 *   bị chặn cứng trừ khi `E2E_ALLOW_PROD=1` (cùng luật với
 *   `scripts/guard-e2e-db.mjs`, nhưng check lại ở đây để chạy config này trực
 *   tiếp bằng `vitest` vẫn an toàn).
 * - Mỗi test tự dọn (`resetAuthTables`): truncate các bảng auth viết tới, con
 *   trước cha sau theo FK. Email duy nhất mỗi test để chạy song song file cũng
 *   không dẫm nhau.
 */
import { generateKeyPairSync } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service.ts';

const NEON = /neon\.tech/i;

/**
 * Lấy URL DB test từ shell, fail closed khi thiếu hoặc trỏ Neon. Không bao
 * giờ fallback về `.env` — đó là đường dẫn tới production.
 *
 * Chấp nhận cả hai biến (ưu tiên `DATABASE_URL` đang set): quy ước env đang
 * được chuyển dần sang `DATABASE_TEST_URL` riêng, helper theo cả hai để suite
 * xanh trong lúc chuyển. Đồng bộ ngược vào `DATABASE_URL` khi nó trống, vì
 * `DatabaseService` chỉ đọc `DATABASE_TEST_URL` khi `USE_DATABASE_TEST=1` —
 * không đồng bộ là test và app nói chuyện với hai DB khác nhau.
 */
export function requireTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_TEST_URL;
  if (!url) {
    throw new Error(
      'Thiếu DATABASE_URL (hoặc DATABASE_TEST_URL). Chạy integration test với DB test riêng, ví dụ:\n' +
        '  DATABASE_URL=postgresql://postgres:postgres@localhost:55432/gocode pnpm test:integration\n' +
        '(nhớ `prisma migrate deploy` vào DB đó trước)',
    );
  }
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`URL DB test không phải URL hợp lệ: ${url}`);
  }
  if (NEON.test(host) && process.env.E2E_ALLOW_PROD !== '1') {
    throw new Error(
      `CHẶN: URL DB test trỏ Neon (${host}). Integration test GHI vào DB — ` +
        `không chạy lên production. Muốn cố ý thì đặt E2E_ALLOW_PROD=1.`,
    );
  }
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = url;
  return url;
}

/** Tự sinh cặp RSA khi env thiếu — key chỉ sống trong lúc chạy test. */
export function ensureJwtKeys(): void {
  if (process.env.ADMIN_JWT_PRIVATE_KEY && process.env.ADMIN_JWT_PUBLIC_KEY) return;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.ADMIN_JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.ADMIN_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

/** Lấy token 64 hex trong link `/sign-up?token=` của nội dung mail. */
export function extractVerifyToken(text: string): string {
  const m = String(text ?? '').match(/token=([0-9a-f]{64})/);
  if (!m) throw new Error('Mail xác minh không kèm token — không giống mail người dùng nhận');
  return m[1];
}

let seq = 0;

/** Email duy nhất mỗi lần gọi — test chạy song song cũng không trùng. */
export function uniqueEmail(prefix = 'itest'): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}+${Date.now()}.${seq}.${rand}@gocode.local`;
}

/**
 * Xoá sạch dữ liệu auth để test độc lập. Thứ tự con-trước-cha-sau theo FK:
 * UserToken/UserOAuthState/UserAccount/ActivityDay/LoginEvent đều trỏ User.
 */
export async function resetAuthTables(db: DatabaseService): Promise<void> {
  await db.userToken.deleteMany({});
  await db.userOAuthState.deleteMany({});
  await db.userAccount.deleteMany({});
  await db.activityDay.deleteMany({});
  await db.loginEvent.deleteMany({});
  await db.user.deleteMany({});
}
