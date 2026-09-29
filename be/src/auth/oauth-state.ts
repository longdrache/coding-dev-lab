import { createHash } from 'node:crypto';
import { newToken } from './tokens.ts';

export const STATE_TTL_MS = 10 * 60 * 1000;
const PROVIDER_SCOPES = ['openid', 'email', 'profile'] as const;

type DbLike = {
  userOAuthState: {
    create(a: any): Promise<any>;
    findUnique(a: any): Promise<any>;
    deleteMany(a: any): Promise<{ count: number }>;
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

/**
 * Ăn `state`: xoá hẳn dòng và trả `codeVerifier` + `redirectTo`, hoặc `null` nếu
 * state sai, đã dùng, hoặc hết hạn.
 *
 * **Vì sao xoá chứ không đánh dấu `usedAt`.** Bảng này phình theo **số lần bấm
 * nút**, không theo số người: nếu chỉ đánh dấu thì mọi dòng đã dùng đều nằm lại
 * vĩnh viễn cùng `codeVerifier` dạng rõ, và không có cách nào dọn ngoài việc xoá
 * cả bảng. Xoá hẳn giữ bảng nhỏ bằng số luồng đang dở (tối đa vài phút), đúng như
 * spec yêu cầu.
 *
 * **Vì sao `DELETE` mới là chốt chặn chứ không phải `SELECT`.** Câu `deleteMany`
 * ở dưới lọc `usedAt: null` **và** `expiresAt > now` ngay trong SQL, nên Postgres
 * tự quyết định thắng/thua khi hai callback cùng tới: chỉ một câu `DELETE` trả
 * `count = 1`, câu còn lại `count = 0`. Nếu kiểm tra "chưa dùng" bằng `SELECT`
 * rồi mới `UPDATE` (cách cũ) thì hai callback đều đọc được `usedAt = null` và
 * cả hai đều đi tiếp — tức `state` dùng được hai lần đúng lúc nó còn hạn.
 * `usedAt: null` vẫn giữ trong điều kiện để dữ liệu cũ đã đánh dấu đã dùng từ bản
 * deploy trước cũng bị từ chối, thay vì lọt.
 *
 * `codeVerifier` đọc **trước** câu `DELETE` nên phần "giá trị trả về" không phụ
 * thuộc kết quả của nó; còn tính hợp lệ thì phụ thuộc `count === 1`. Đây là lý do
 * `consumeState` cần đọc rồi mới xoá, và cũng là lý do nó **không** dùng
 * `$transaction`: hai lệnh không cần chung tính nguyên tử, chỉ lệnh `DELETE` là
 * chốt chặn.
 */
export async function consumeState(
  db: DbLike,
  state: string,
  now: Date = new Date(),
): Promise<{ codeVerifier: string; redirectTo: string } | null> {
  if (!state) return null;
  const stateHash = hashState(state);
  const row = await db.userOAuthState.findUnique({ where: { stateHash } });
  if (!row) return null;
  const { count } = await db.userOAuthState.deleteMany({
    where: { stateHash, usedAt: null, expiresAt: { gt: now } },
  });
  if (count !== 1) return null;
  return { codeVerifier: row.codeVerifier, redirectTo: safeInternalPath(row.redirectTo) };
}

export const GOOGLE_SCOPES = [...PROVIDER_SCOPES];
export const GOOGLE_PROVIDER = 'google';
