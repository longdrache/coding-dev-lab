import { createHash } from 'node:crypto';
import { newToken } from './tokens.ts';

const STATE_TTL_MS = 10 * 60 * 1000;
const PROVIDER_SCOPES = ['openid', 'email', 'profile'] as const;

type DbLike = {
  userOAuthState: {
    create(a: any): Promise<any>;
    findUnique(a: any): Promise<any>;
    update(a: any): Promise<any>;
  };
};

/**
 * Chỉ nhận đường dẫn nội bộ. `redirect_uri` về phía FE là dữ liệu do trình
 * duyệt gửi lên, không kiểm thì biến thành open redirect: kẻ xấu gửi
 * `/start?redirect_to=https://site-gia-mao.com` để đưa người dùng vừa đăng
 * nhập xong sang trang giả mạo.
 */
export function safeInternalPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  const v = raw.trim();
  if (!v.startsWith('/')) return '/';
  if (v.startsWith('//') || v.startsWith('/\\')) return '/';
  return v;
}

const hashState = (state: string) => createHash('sha256').update(state).digest('hex');

export async function createState(
  db: DbLike,
  redirectTo: string,
  now: Date = new Date(),
): Promise<{ state: string; codeVerifier: string }> {
  const state = newToken();
  const codeVerifier = newToken();
  await db.userOAuthState.create({
    data: {
      stateHash: hashState(state),
      codeVerifier,
      redirectTo: safeInternalPath(redirectTo),
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    },
  });
  return { state, codeVerifier };
}

export async function consumeState(
  db: DbLike,
  state: string,
  now: Date = new Date(),
): Promise<{ codeVerifier: string; redirectTo: string } | null> {
  if (!state) return null;
  const row = await db.userOAuthState.findUnique({ where: { stateHash: hashState(state) } });
  if (!row || row.usedAt) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  // Đánh dấu đã dùng TRƯỚC khi trả về: state dùng một lần, kể cả khi hai
  // callback tới cùng lúc.
  await db.userOAuthState.update({ where: { stateHash: row.stateHash }, data: { usedAt: now } });
  return { codeVerifier: row.codeVerifier, redirectTo: safeInternalPath(row.redirectTo) };
}

export const GOOGLE_SCOPES = [...PROVIDER_SCOPES];
export const GOOGLE_PROVIDER = 'google';
