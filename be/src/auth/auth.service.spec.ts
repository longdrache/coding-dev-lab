import { generateKeyPairSync } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AuthService, type GoogleProfile } from './auth.service.ts';
import { calcStreakFromMap } from '../progress/progress.service.ts';
import * as tokens from './tokens.ts';

// verifyEmail ký access token RS256, tokens.ts nạp khoá lazy và throw nếu thiếu
// khoá. Sinh cặp khoá ngay ở cấp module để spec không phụ thuộc be/.env.
const OLD_ENV = { ...process.env };
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.ADMIN_JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
process.env.ADMIN_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();

afterAll(() => {
  process.env = { ...OLD_ENV };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Mã xác minh cố định để test biết trước; các lần sinh mã sau vẫn ngẫu nhiên. */
const MA = 'M'.repeat(64);
const realNewToken = tokens.newToken;

/**
 * Đóng băng đồng hồ, chỉ giả `Date` — không giả timer. bcryptjs đi qua
 * `setImmediate` nên giả cả timer sẽ treo `hashPassword`.
 */
function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

/**
 * Bộ lọc của UserToken trong db giả. Chỉ hiểu đúng những gì AuthService dùng:
 * `{id:{in}}`, `{userId,type}`, `{tokenHash}`, `{prevTokenHash}`, `{usedAt:null}`,
 * `{OR:[...]}`. Các điều kiện đứng cạnh nhau phải **và** với nhau, nếu không `logoutAll` sẽ
 * xoá nhầm cả dòng `verify_email` và test thành xanh sai. Giống vậy, bỏ qua
 * `usedAt: null` thì `burnResetTokens` sẽ ghi đè cả dòng đã dùng và test mất dấu
 * vết thời điểm dùng mã.
 */
function tokenMatches(t: any, where: any): boolean {
  if (!where) return true;
  if (where.id?.in) return where.id.in.includes(t.id);
  const scalar = (w: any) =>
    (w.userId === undefined || t.userId === w.userId)
    && (w.type === undefined || t.type === w.type)
    && (w.tokenHash === undefined || t.tokenHash === w.tokenHash)
    && (w.prevTokenHash === undefined || t.prevTokenHash === w.prevTokenHash)
    && (w.usedAt === undefined || t.usedAt === w.usedAt);
  return where.OR ? where.OR.some(scalar) : scalar(where);
}

/**
 * Sắp xếp y hệt thứ mà DB làm theo `orderBy` service truyền vào, kể cả
 * tie-break. Phải đọc từ `orderBy` chứ không tự quyết thứ tự: nếu db giả cứ sắp
 * theo thứ tự chèn, thì bỏ tie-break trong query cũng không làm test đỏ, tức là
 * test không còn canh được thứ nó tưởng canh. Khi hết khoá sắp xếp, trả về 0 để
 * `Array.sort` (ổn định) giữ thứ tự chèn — giống heap order của Postgres khi
 * không có tie-break, tức là phiên mới nằm cuối và bị xoá trước.
 */
function sortByOrder(rows: any[], orderBy: any): any[] {
  // Prisma viết thứ tự là `{ createdAt: 'desc' }` — tên cột là chính tên khoá.
  const keys: [string, boolean][] = ([] as any[]).concat(orderBy ?? []).map((k: any) => {
    const field = Object.keys(k)[0];
    return [field, k[field] === 'desc'];
  });
  return rows.sort((a, b) => {
    for (const [field, desc] of keys) {
      if (a[field] > b[field]) return desc ? -1 : 1;
      if (a[field] < b[field]) return desc ? 1 : -1;
    }
    return 0;
  });
}

// `any` cố ý: đây là db giả, không phải DatabaseService thật.
function makeDb(): any {
  const state: Record<string, any[]> = { user: [], userToken: [], userAccount: [], userOAuthState: [], activityDay: [] };
  return {
    state,
    user: {
      findUnique: vi.fn(async ({ where }: any) => (
        where?.id !== undefined
          ? state.user.find((u) => u.id === where.id) ?? null
          : state.user.find((u) => u.email === where.email) ?? null
      )),
      create: vi.fn(async ({ data }: any) => {
        const r = { id: state.user.length + 1, name: null, emailVerifiedAt: null, ...data };
        state.user.push(r);
        return r;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const u = state.user.find((x) => x.id === where.id)!; Object.assign(u, data); return u;
      }),
    },
    userToken: {
      // `createdAt`/`lastUsedAt` có default ở schema, db giả phải dựng y như DB —
      // kể cả `usedAt: null`, vì `burnResetTokens` lọc đúng theo cột này và so
      // sánh `undefined === null` là false sẽ làm db giả im lặng bỏ sót dòng.
      // `id` đệm 4 chữ số để thứ tự chuỗi trùng thứ tự tạo, giống cách `cuid()`
      // của Prisma xếp theo thời điểm sinh — nhờ vậy tie-break `id` của service
      // được mô phỏng trung thực.
      create: vi.fn(async ({ data }: any) => {
        const r = {
          id: 't' + String(state.userToken.length).padStart(4, '0'),
          createdAt: new Date(), lastUsedAt: new Date(), usedAt: null, ...data,
        };
        state.userToken.push(r); return r;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        if (where?.prevTokenHash !== undefined) {
          return state.userToken.find((t) => t.prevTokenHash === where.prevTokenHash) ?? null;
        }
        return state.userToken.find((t) => t.tokenHash === where.tokenHash) ?? null;
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => (
        sortByOrder(state.userToken.filter((t) => tokenMatches(t, where)), orderBy)
      )),
      update: vi.fn(async ({ where, data }: any) => {
        const t = state.userToken.find((x) => x.id === where.id)!; Object.assign(t, data); return t;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const dong = state.userToken.filter((t) => tokenMatches(t, where));
        for (const t of dong) Object.assign(t, data);
        return { count: dong.length };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const keep = state.userToken.filter((t: any) => !tokenMatches(t, where));
        const count = state.userToken.length - keep.length;
        state.userToken.length = 0;
        state.userToken.push(...keep);
        return { count };
      }),
    },
    userAccount:
      // `findUnique` trên UserAccount dùng khoá **compound**
      // `(provider, providerUserId)`, nên Prisma nhận nó lồng trong
      // `provider_providerUserId` chứ không phải hai field phẳng. Db giả phải
      // đọc đúng hình dạng đó: đọc `where.provider` (phẳng) thì luôn trả
      // `null`, mọi test "khớp theo sub" sẽ xanh vì lý do hoàn toàn khác —
      // service có thể tra sai cột mà test vẫn không đỏ. Cùng lý do với `orderBy`
      // ở `sortByOrder`.
      {
        findUnique: vi.fn(async ({ where }: any) => {
          const k = where?.provider_providerUserId;
          if (!k) return null;
          return state.userAccount.find(
            (a) => a.provider === k.provider && a.providerUserId === k.providerUserId,
          ) ?? null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const r = { id: state.userAccount.length + 1, createdAt: new Date(), ...data };
          state.userAccount.push(r);
          return r;
        }),
      },
    // `ActivityDay` có `@@unique([userId, date])` nên db giả phải **tra chính
    // khoá đó** chứ không tự thêm dòng: nếu upsert cứ create thì "đăng nhập lại
    // thành 2" sẽ xanh trong khi Postgres thật sẽ ném P2002. `update` rỗng thì
    // dòng cũ giữ nguyên — đó chính là câu hỏi "tài khoản cũ có bị reset không".
    activityDay: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const { userId, date } = where.userId_date;
        const existing = state.activityDay.find(
          (r) => r.userId === userId && r.date.getTime() === date.getTime(),
        );
        if (existing) {
          if (update?.count?.increment !== undefined) existing.count += update.count.increment;
          Object.assign(existing, update?.set ?? {});
          return existing;
        }
        const r = { id: String(state.activityDay.length + 1), userId, date, count: 0, ...create };
        state.activityDay.push(r);
        return r;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        let rows = state.activityDay;
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        if (where?.date?.gte !== undefined) {
          rows = rows.filter((r) => r.date.getTime() >= where.date.gte.getTime());
        }
        return rows;
      }),
    },
    userOAuthState:
      // `oauth-state.ts` tra bằng khoá chính `stateHash` (lưu dạng hash) và **xoá
      // hẳn** dòng khi ăn state, nên db giả phải có `deleteMany` chứ không có
      // `update`: còn `update` thì db giả vẫn chạy được trong khi code thật đã đổi
      // sang xoá, và mọi test "state dùng một lần rồi chết" sẽ xanh vì lý do
      // khác. `deleteMany` lọc đúng ba điều kiện service dùng và **xoá thật khỏi
      // mảng** — không xoá thì `findUnique` lần sau vẫn thấy dòng cũ.
      // `usedAt` phải dựng sẵn `null` như schema: so `undefined === null` là
      // false sẽ khiến mọi dòng bị điều kiện lọc loại.
      {
        create: vi.fn(async ({ data }: any) => {
          const r = { usedAt: null, ...data };
          state.userOAuthState.push(r);
          return r;
        }),
        findUnique: vi.fn(async ({ where }: any) =>
          state.userOAuthState.find((x) => x.stateHash === where?.stateHash) ?? null),
        deleteMany: vi.fn(async ({ where }: any) => {
          const con = state.userOAuthState.filter((r) => {
            if (where?.stateHash !== undefined && r.stateHash !== where.stateHash) return false;
            if (where?.usedAt !== undefined && r.usedAt !== where.usedAt) return false;
            if (where?.expiresAt?.gt !== undefined && r.expiresAt.getTime() <= where.expiresAt.gt.getTime()) {
              return false;
            }
            if (where?.expiresAt?.lte !== undefined && r.expiresAt.getTime() > where.expiresAt.lte.getTime()) {
              return false;
            }
            return true;
          });
          state.userOAuthState = state.userOAuthState.filter((r) => !con.includes(r));
          return { count: con.length };
        }),
      },
  };
}

/** Đăng ký rồi xác minh email, trả về db giả + service để test dùng tiếp. */
/** AuthService goi checkAndDowngradeIfExpired khi ky token; mac dinh user chua het han. */
function makePremium(over: Record<string, unknown> = {}) {
  return {
    checkAndDowngradeIfExpired: vi.fn(async () => ({
      downgraded: false,
      wasVip: false,
      expired: false,
      expiresAt: null,
      ...over,
    })),
  } as any;
}
async function seedVerified(email = 'a@b.co') {
  const db = makeDb();
  const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
  await svc.register(email, 'matkhau123');
  await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
  return { db, svc };
}

/** Chặn newToken cho lần đầu (mã xác minh), các lần sau vẫn random thật. */
function fixVerifyToken() {
  return vi
    .spyOn(tokens, 'newToken')
    .mockReturnValueOnce(MA)
    .mockImplementation(realNewToken);
}

describe('đăng ký', () => {
  let db: any; let svc: AuthService; let sent: any[];
  beforeEach(() => {
    db = makeDb(); sent = [];
    svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
  });

  it('tạo user chưa xác minh và gửi mail, không cấp phiên', async () => {
    const r = await svc.register('a@b.co', 'matkhau123');
    expect(db.user.create).toHaveBeenCalledOnce();
    expect(db.state.user[0].emailVerifiedAt).toBeNull();
    expect(db.state.user[0].passwordHash).not.toBe('matkhau123');
    expect(db.userToken.create).toHaveBeenCalledOnce();
    expect(db.state.userToken[0].type).toBe('verify_email');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('a@b.co');
    expect(r.message).toContain('xác nhận');
  });

  it('chỉ lưu hash của mã trong DB, mã thô nằm trong mail', async () => {
    await svc.register('a@b.co', 'matkhau123');
    const raw = sent[0].text.match(/token=([0-9a-f]{64})/)?.[1];
    expect(raw).toBeTruthy();
    expect(db.state.userToken[0].tokenHash).toBe(tokens.hashToken(raw!));
    expect(db.state.userToken[0].tokenHash).not.toBe(raw);
  });

  it('email trùng trả 409', async () => {
    await svc.register('a@b.co', 'matkhau123');
    await expect(svc.register('a@b.co', 'matkhau123')).rejects.toMatchObject({ status: 409 });
  });

  it('email không phân biệt hoa thường: A@B.co và a@b.co là một tài khoản', async () => {
    await svc.register('A@B.co', 'matkhau123');
    expect(db.state.user[0].email).toBe('a@b.co');
    expect(sent[0].to).toBe('a@b.co');
    await expect(svc.register('a@b.co', 'matkhau123')).rejects.toMatchObject({ status: 409 });
    expect(db.state.user).toHaveLength(1);
  });

  it('userAgent dài bị cắt còn 200 ký tự', async () => {
    const ua = 'U'.repeat(300);
    await svc.register('a@b.co', 'matkhau123', ua);
    const row = db.state.userToken[0];
    expect(row.userAgent).toHaveLength(200);
    expect(row.userAgent).toBe(ua.slice(0, 200));
  });

  it('race đăng ký trùng email (P2002) trả 409 chứ không phải 500', async () => {
    db.user.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });
    const e = await svc.register('a@b.co', 'matkhau123').catch((x) => x);
    expect(e.status).toBe(409);
    expect(e.message).toBe('Email này đã được dùng để đăng ký');
    expect(db.userToken.create).not.toHaveBeenCalled();
  });

  it('lỗi DB khác P2002 thì ném nguyên, không giả làm 409', async () => {
    const loi = Object.assign(new Error('hết kết nối'), { code: 'P1001' });
    db.user.create.mockRejectedValueOnce(loi);
    await expect(svc.register('a@b.co', 'matkhau123')).rejects.toBe(loi);
  });

  it('mật khẩu dưới 8 ký tự bị từ chối, không tạo user', async () => {
    await expect(svc.register('a@b.co', 'ngan')).rejects.toMatchObject({ status: 400 });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('email sai định dạng bị từ chối', async () => {
    await expect(svc.register('khong-phai-email', 'matkhau123')).rejects.toMatchObject({ status: 400 });
  });

  it('mailer hỏng không làm hỏng đăng ký: user vẫn được tạo', async () => {
    const bom = makeDb();
    const svcBom = new AuthService(bom, {
      send: async () => { throw new Error('SMTP chết'); },
    } as any, makePremium());
    const r = await svcBom.register('a@b.co', 'matkhau123');
    expect(bom.state.user).toHaveLength(1);
    expect(bom.state.userToken).toHaveLength(1);
    expect(r.message).toContain('xác nhận');
  });
});

describe('xác minh email', () => {
  it('mã đúng thì xác minh xong cấp phiên', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');
    expect(db.state.userToken[0].type).toBe('verify_email');

    const r = await svc.verifyEmail(MA, 'UA');
    expect(r).not.toBeNull();
    expect(typeof r!.accessToken).toBe('string');
    expect(r!.refreshToken).toHaveLength(64);
    expect(r!.user.email).toBe('a@b.co');
    expect(r!.user.role).toBe('user');
    expect(db.state.user[0].emailVerifiedAt).not.toBeNull();
  });

  it('mã dùng lần hai trả null vì mã là dùng một lần', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');
    expect(await svc.verifyEmail(MA, 'UA')).not.toBeNull();
    expect(db.state.userToken[0].usedAt).not.toBeNull();

    await expect(svc.verifyEmail(MA, 'UA')).resolves.toBeNull();
  });

  it('mã sai trả null và không tạo phiên', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await expect(svc.verifyEmail('sai', 'UA')).resolves.toBeNull();
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
  });

  it('mã xác minh sống đúng 24 giờ kể từ lúc đăng ký', async () => {
    freezeAt('2026-01-01T00:00:00Z');
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');
    const row = db.state.userToken[0];
    expect(row.expiresAt.getTime() - Date.now()).toBe(24 * 60 * 60 * 1000);
  });

  it('mã xác minh còn dùng được ở giây thứ 23:59:59', async () => {
    freezeAt('2026-01-01T00:00:00Z');
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');

    freezeAt('2026-01-01T23:59:59Z');
    expect(await svc.verifyEmail(MA, 'UA')).not.toBeNull();
    expect(db.state.user[0].emailVerifiedAt).not.toBeNull();
  });

  it('mã xác minh hết hạn thì trả null, không cấp phiên', async () => {
    freezeAt('2026-01-01T00:00:00Z');
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');

    freezeAt('2026-01-02T00:00:00Z');
    await expect(svc.verifyEmail(MA, 'UA')).resolves.toBeNull();
    expect(db.state.user[0].emailVerifiedAt).toBeNull();
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
  });

  // Bịt lỗ hổng Task 4 bàn giao: guard `row.type !== 'verify_email'` không có test,
  // nên refresh token thô đưa vào verifyEmail sẽ xác minh email rồi cấp phiên.
  it('refresh token thô đưa vào verifyEmail thì trả null, không cấp phiên mới', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');
    const session = await svc.verifyEmail(MA, 'UA');
    expect(session).not.toBeNull();

    await svc.register('b@b.co', 'matkhau123');
    const truoc = db.state.userToken.filter((t: any) => t.type === 'refresh').length;

    await expect(svc.verifyEmail(session!.refreshToken, 'UA')).resolves.toBeNull();
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(truoc);
  });
});

/**
 * Câu trả lời duy nhất của `resendVerification` — ghim thành hằng để đổi câu là
 * test đỏ, vì đây chính là câu không được lộ khác nhau giữa các trường hợp.
 */
const RESEND_MSG = 'Nếu email đó có tài khoản chưa xác minh, chúng tôi đã gửi lại link xác nhận.';

const verifyRows = (db: any) => db.state.userToken.filter((t: any) => t.type === 'verify_email');

/**
 * Lùi thời điểm tạo của mọi dòng token trong db giả, mô phỏng tài khoản đã đăng
 * ký **đã lâu**.
 *
 * Cần từ Task 16: `resendVerification` có cooldown 1 giờ tính từ `createdAt` của
 * mã xác nhận gần nhất, nên tài khoản *vừa* đăng ký thì bấm "Gửi lại" là bị
 * chặn. Đó là hành vi đúng — mail đầu vừa gửi, bấm lại ngay là bơm thư — nên test
 * phải mô phỏng đúng tình huống mà nút này sinh ra để chữa: đã lâu không nhận
 * được mail, giờ bấm gửi lại.
 */
function quayLai(db: any, gio = 2) {
  const truoc = new Date(Date.now() - gio * 60 * 60 * 1000);
  for (const t of db.state.userToken) t.createdAt = truoc;
  return db;
}

/**
 * Tài khoản **chưa** xác minh (đúng trạng thái lúc mới đăng ký xong), trả về
 * mọi thứ test cần. Không seed "đã xác minh" ở đây: `seedVerified` phục vụ
 * `login`/`forgotPassword`, còn endpoint này cần đúng hai loại user — chưa xác
 * minh (được gửi) và đã xác minh (không được gửi).
 */
async function seedUnverified(email = 'a@b.co') {
  const db = makeDb();
  const sent: any[] = [];
  const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
  await svc.register(email, 'matkhau123');
  quayLai(db);
  // Mail xác minh lúc đăng ký đã nằm trong `sent`; đếm lại từ đây.
  return { db, svc, sent };
}

describe('gửi lại link xác nhận', () => {
  it('bốn trường hợp trả đúng MỘT câu, giống nhau tuyệt đối', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    // Hai tài khoản có thật, khác nhau ở đúng `emailVerifiedAt` — đó là biến duy
    // nhất quyết định có gửi mail hay không. Ba nhánh còn lại là ảo.
    await svc.register('chua-xac-minh@b.co', 'matkhau123');
    await svc.register('da-xac-minh@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[1].id }, data: { emailVerifiedAt: new Date() } });
    const mailDaGui = sent.length;
    const tokenDaTao = db.state.userToken.length;

    const r1 = await svc.resendVerification('khong-ton-tai@b.co');
    const r2 = await svc.resendVerification('da-xac-minh@b.co');
    const r3 = await svc.resendVerification('khong-phai-email');
    const r4 = await svc.resendVerification('');

    expect(r1.message).toBe(RESEND_MSG);
    expect(r2.message).toBe(r1.message);
    expect(r3.message).toBe(r1.message);
    expect(r4.message).toBe(r1.message);
    // Ba nhánh phải trả lời **và** hành động giống nhau: không sinh mã, không gửi
    // mail. Chỉ khác câu thì vẫn dò được; chỉ khác hành động thì đo độ trễ ra.
    expect(db.state.userToken).toHaveLength(tokenDaTao);
    expect(sent).toHaveLength(mailDaGui);
  });

  it('tài khoản chưa xác minh thì sinh mã và gửi mail', async () => {
    const { db, svc, sent } = await seedUnverified();
    const r = await svc.resendVerification('a@b.co');
    expect(r.message).toBe(RESEND_MSG);
    expect(verifyRows(db)).toHaveLength(2);
    // 1 mail lúc đăng ký + 1 mail gửi lại.
    expect(sent).toHaveLength(2);
    expect(sent.at(-1)!.to).toBe('a@b.co');
    expect(String(sent.at(-1)!.text)).toContain('/sign-up?token=');
  });

  it('mã gửi lại hạn đúng 24 giờ, không phải 1 giờ như mã đặt lại mật khẩu', async () => {
    // Đóng băng đồng hồ: `expiresAt` dựng bằng `Date.now()` lúc tạo, nên với đồng
    // hồ thật phép trừ ở đây lệch 1-2 ms mỗi lần chạy — test nhấp nháy xanh đỏ
    // theo tải máy. Đổi `VERIFY_TTL_MS` thành 1 giờ là test này đỏ ngay.
    freezeAt('2026-05-01T00:00:00Z');
    const { db, svc } = await seedUnverified();
    const row = verifyRows(db).at(-1)!;
    expect(row.expiresAt.getTime() - Date.now()).toBe(24 * 60 * 60 * 1000);
    // Ghim thêm một mốc: khác hẳn hạn 1 giờ của mã đặt lại mật khẩu, để đổi
    // nhầm hằng cũng bị bắt chứ không chỉ trùng số với 24 giờ.
    expect(row.expiresAt.getTime() - Date.now()).not.toBe(60 * 60 * 1000);
  });

  it('mã trong mail gửi lại dùng được: verifyEmail mở phiên được', async () => {
    // Đọc mã **từ nội dung mail** chứ không `spyOn(newToken)`: nếu link gửi lại
    // không kèm mã thì mọi test dùng mã giả vẫn xanh trong khi người dùng bấm
    // link là tới trang chết — đúng hỏng mà nút này sinh ra để chữa.
    //
    // Phải ghim `sent` có **hai** mail và mã lấy ra khác mã lúc đăng ký: trước
    // khi có cooldown, lần bấm đầu bị chặn và `sent.at(-1)` âm thầm trả về mail
    // **đăng ký** — mã vẫn hợp lệ nên `verifyEmail` vẫn xanh, tức test pass vì lý do
    // hoàn toàn khác với cái nó tưởng kiểm.
    const { db, svc, sent } = await seedUnverified();
    const maDangKy = String(sent.at(-1)!.text).match(/token=([0-9a-f]{64})/)?.[1];
    await svc.resendVerification('a@b.co');
    expect(sent).toHaveLength(2);
    const raw = String(sent.at(-1)!.text).match(/token=([0-9a-f]{64})/)?.[1];
    expect(raw).toBeTruthy();
    expect(raw).not.toBe(maDangKy);

    const row = verifyRows(db).at(-1)!;
    expect(row.tokenHash).toBe(tokens.hashToken(raw!));
    expect(row.tokenHash).not.toBe(raw);

    const session = await svc.verifyEmail(raw!);
    expect(session).not.toBeNull();
    expect(db.state.user[0].emailVerifiedAt).not.toBeNull();
  });

  it('đã xác minh rồi thì không sinh mã, không gửi mail', async () => {
    // Bỏ kiểm tra `emailVerifiedAt` ở service là test này đỏ: nó sẽ sinh mã và
    // gửi mail cho một tài khoản không cần xác minh nữa.
    const { db, svc, sent } = await seedUnverified();
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    const tokenDaTao = db.state.userToken.length;

    const r = await svc.resendVerification('a@b.co');
    expect(r.message).toBe(RESEND_MSG);
    expect(verifyRows(db)).toHaveLength(tokenDaTao);
    expect(sent).toHaveLength(1);
  });

  it('email viết HOA và có khoảng trắng vẫn ra mã (thiếu .trim()/.toLowerCase() là hỏng)', async () => {
    const { db, svc, sent } = await seedUnverified();
    const r = await svc.resendVerification('  A@B.co  ');
    expect(r.message).toBe(RESEND_MSG);
    expect(verifyRows(db)).toHaveLength(2);
    expect(sent.at(-1)!.to).toBe('a@b.co');
  });

  it('gửi lại lần nữa trong 1 giờ thì không sinh mã thứ hai, không gửi mail thứ hai', async () => {
    // Test canh cooldown: bỏ khối `conHieu` ở service là test này đỏ. Lần gửi lại
    // **đầu** phải qua (đó là cả việc của nút này) — mốc chặn là mã vừa sinh ra.
    const { db, svc, sent } = await seedUnverified();
    await svc.resendVerification('a@b.co');
    const tokenDaTao = db.state.userToken.length;
    const r = await svc.resendVerification('a@b.co');
    // Câu trả lời y hệt nên người gọi không biết mình có bị chặn hay không.
    expect(r.message).toBe(RESEND_MSG);
    expect(db.state.userToken).toHaveLength(tokenDaTao);
    expect(sent).toHaveLength(2);
  });

  it('bấm nút nhiều lần trong 1 giờ thì vẫn chỉ một mail — không thành công cụ bơm thư', async () => {
    // Đây là lý do có cooldown: `ThrottleGuard` chỉ biết IP, mà IP dùng chung ở
    // Việt Nam rất phổ biến. Không có giới hạn theo tài khoản thì bấm nút năm
    // lần là năm mail vào đúng một hộp thư.
    const { db, svc, sent } = await seedUnverified();
    for (let i = 0; i < 5; i += 1) await svc.resendVerification('a@b.co');
    // 1 mail lúc đăng ký + đúng 1 lần gửi lại được phép.
    expect(sent).toHaveLength(2);
    expect(verifyRows(db)).toHaveLength(2);
  });

  it('cooldown đúng 1 giờ: 59 phút 59 giây còn chặn, 1 giờ 1 giây thì qua', async () => {
    // Ghim đúng số: đổi `RESEND_COOLDOWN_MS` thành hạn 24 giờ của mã thì phần
    // "1 giờ 1 giây" đỏ — tức test bắt được cả lỗi lấy nhầm TTL làm cooldown.
    // Đóng băng đồng hồ vì ranh giới cửa sổ tính bằng `Date.now()`.
    freezeAt('2026-05-01T00:00:00Z');
    const { db, svc } = await seedUnverified();
    await svc.resendVerification('a@b.co');
    const tokenDaTao = db.state.userToken.length;

    vi.setSystemTime(new Date(Date.parse('2026-05-01T00:00:00Z') + (60 * 60 - 1) * 1000));
    await svc.resendVerification('a@b.co');
    expect(db.state.userToken).toHaveLength(tokenDaTao);

    vi.setSystemTime(new Date(Date.parse('2026-05-01T00:00:00Z') + (60 * 60 + 1) * 1000));
    await svc.resendVerification('a@b.co');
    expect(db.state.userToken).toHaveLength(tokenDaTao + 1);
  });

  it('hết giờ chờ thì gửi lại được, và mã cũ vẫn dùng được', async () => {
    // Mã cũ **không** bị vô hiệu hoá: người dùng có thể đã mở mail cũ trước khi
    // bấm nhầm, và họ không có lý do gì phải mất nó.
    freezeAt('2026-05-01T00:00:00Z');
    const { db, svc, sent } = await seedUnverified();
    await svc.resendVerification('a@b.co');
    const maCu = String(sent.at(-1)!.text).match(/token=([0-9a-f]{64})/)?.[1];
    expect(maCu).toBeTruthy();

    vi.setSystemTime(new Date('2026-05-01T01:00:01Z'));
    await svc.resendVerification('a@b.co');
    expect(verifyRows(db)).toHaveLength(3);
    expect(verifyRows(db).at(-1)!.expiresAt.getTime() - Date.now()).toBe(24 * 60 * 60 * 1000);

    const session = await svc.verifyEmail(maCu!);
    expect(session).not.toBeNull();
  });

  it('giới hạn theo tài khoản, không chặn nhầm tài khoản khác', async () => {
    // Bỏ `userId` khỏi truy vấn cooldown là test này đỏ: tài khoản B vừa được
    // gửi thì lần bấm kế tiếp của A cũng bị chặn oan, đúng cái loại chặn nhầm
    // mà số IP dùng chung ở Việt Nam gây ra hằng ngày.
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await svc.register('b@b.co', 'matkhau123');
    quayLai(db);

    await svc.resendVerification('a@b.co');
    await svc.resendVerification('b@b.co');
    expect(verifyRows(db).filter((t: any) => t.userId === db.state.user[0].id)).toHaveLength(2);
    expect(verifyRows(db).filter((t: any) => t.userId === db.state.user[1].id)).toHaveLength(2);
  });

  it('mail hỏng thì trả lại mã, không kẹt tài khoản 1 giờ với mã không ai nhận được', async () => {
    // Cùng lỗi mà Task 10 đã phải sửa cho `forgotPassword`: giữ mã còn hạn mà
    // không ai nhận được thì cooldown nuốt mọi lần xin lại, tức một lần SMTP
    // chết biến thành "gửi lại link bị treo 1 tiếng". Bỏ nhánh `updateMany`
    // trong `catch` là test này đỏ.
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = makeDb();
    let hong = true;
    const svc = new AuthService(db, {
      send: async () => { if (hong) throw new Error('SMTP chết'); },
    } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    quayLai(db);

    await svc.resendVerification('a@b.co');
    await flush();
    expect(verifyRows(db).at(-1)!.usedAt).not.toBeNull();

    hong = false; // SMTP sống lại, người dùng bấm lại
    const tokenDaTao = db.state.userToken.length;
    await svc.resendVerification('a@b.co');
    expect(db.state.userToken).toHaveLength(tokenDaTao + 1);
  });

  it('userAgent dài bị cắt còn 200 ký tự', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    quayLai(db);
    await svc.resendVerification('a@b.co', 'U'.repeat(500));
    expect(verifyRows(db).at(-1)!.userAgent).toHaveLength(200);
  });

  it('không chờ mail: send treo vĩnh viễn thì resendVerification vẫn trả về', async () => {
    // Hàng rào cho đúng cái lý do bỏ `await`: nếu lại chờ SMTP thì thời gian phản
    // hồi tự nó phân biệt "tài khoản chưa xác minh" với "không có tài khoản" —
    // phá biện pháp "luôn trả cùng một câu". Chỉ mail **gửi lại** treo (lần gọi
    // thứ hai trở đi), vì `register` cố ý `await` mail xác nhận nên treo luôn
    // cả hai thì test hỏng ở `register` chứ không phải ở endpoint này.
    const treo = new Promise<void>(() => { /* không bao giờ resolve */ });
    const db = makeDb();
    let lan = 0;
    const svc = new AuthService(db, {
      send: () => (lan++ === 0 ? Promise.resolve() : treo),
    } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    quayLai(db);

    const TREO = 'TREO';
    const r = await Promise.race([
      svc.resendVerification('a@b.co'),
      new Promise((x) => { setTimeout(() => { x(TREO); }, 500); }),
    ]);
    expect(r).not.toBe(TREO);
    expect((r as { message: string }).message).toBe(RESEND_MSG);
    // Không chờ mail không được có nghĩa bỏ luôn việc cấp mã.
    expect(verifyRows(db)).toHaveLength(2);
  });

  it('mailer hỏng thì vẫn trả đúng câu đó, và ghi log chứ không nuốt im lặng', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => { throw new Error('SMTP chết'); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    quayLai(db);
    warn.mockClear(); // bỏ qua log của mail xác minh lúc đăng ký

    const r = await svc.resendVerification('a@b.co');
    await flush();
    expect(r.message).toBe(RESEND_MSG);
    expect(verifyRows(db)).toHaveLength(2);
    expect(warn).toHaveBeenCalledOnce();
    const dong = String(warn.mock.calls[0][0]);
    expect(dong).toContain('SMTP chết');
    expect(dong).toContain('a@b.co');
    // Log phải truy được nhưng không được lộ mã xác nhận.
    expect(dong).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe('đăng nhập', () => {
  it('sai mật khẩu và email không tồn tại trả cùng 401, cùng một câu', async () => {
    const { db, svc } = await seedVerified();
    const e1 = await svc.login('a@b.co', 'sai-mat-khau', 'UA').catch((x) => x);
    const e2 = await svc.login('khong-ton-tai@b.co', 'matkhau123', 'UA').catch((x) => x);
    expect(e1.status).toBe(401);
    expect(e2.status).toBe(401);
    expect(e1.response.message).toBe(e2.response.message);
    // Cả hai lỗi phải giống hệt nhau cả ở tác dụng phụ: không sinh phiên nào.
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
  });

  it('tài khoản chưa xác minh email thì không đăng nhập được', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    await svc.register('b@b.co', 'matkhau123');
    await expect(svc.login('b@b.co', 'matkhau123', 'UA')).rejects.toMatchObject({ status: 401 });
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
  });

  it('tài khoản chưa có mật khẩu thì trả 401 chứ không phải 500', async () => {
    const { db, svc } = await seedVerified();
    db.state.user[0].passwordHash = null;
    await expect(svc.login('a@b.co', 'matkhau123', 'UA')).rejects.toMatchObject({ status: 401 });
  });

  it('email không tồn tại vẫn chạy bcrypt, không lộ qua độ trễ', async () => {
    const spy = vi.spyOn(tokens, 'verifyPassword');
    const { svc } = await seedVerified();
    const truoc = spy.mock.calls.length;

    const e = await svc.login('khong-ton-tai@b.co', 'matkhau123', 'UA').catch((x) => x);
    expect(e.status).toBe(401);
    // Không có lời gọi này thì nhánh trả về sau ~1ms còn nhánh có mật khẩu thật
    // sau ~65ms, và kẻ dò email chỉ cần đo thời gian là biết email nào tồn tại.
    expect(spy).toHaveBeenCalledTimes(truoc + 1);
    expect(spy.mock.calls.at(-1)![1]).toMatch(/^\$2[aby]\$10\$/);
  });

  it('tài khoản chưa có mật khẩu cũng chạy bcrypt, không lộ qua độ trễ', async () => {
    const spy = vi.spyOn(tokens, 'verifyPassword');
    const { db, svc } = await seedVerified();
    db.state.user[0].passwordHash = null;
    const truoc = spy.mock.calls.length;

    await expect(svc.login('a@b.co', 'matkhau123', 'UA')).rejects.toMatchObject({ status: 401 });
    expect(spy).toHaveBeenCalledTimes(truoc + 1);
    expect(spy.mock.calls.at(-1)![1]).toMatch(/^\$2[aby]\$10\$/);
  });

  it('cả ba nhánh từ chối đều tốn đúng một lần bcrypt', async () => {
    const spy = vi.spyOn(tokens, 'verifyPassword');
    const { svc } = await seedVerified();
    const chuaXacMinh = makeDb();
    const svcChuaXacMinh = new AuthService(chuaXacMinh, { send: async () => {} } as any, makePremium());
    await svcChuaXacMinh.register('b@b.co', 'matkhau123');

    const moc = spy.mock.calls.length;
    await svc.login('khong-ton-tai@b.co', 'matkhau123', 'UA').catch(() => {}); // không có user
    await svc.login('a@b.co', 'sai-mat-khau', 'UA').catch(() => {}); // sai mật khẩu
    await svcChuaXacMinh.login('b@b.co', 'matkhau123', 'UA').catch(() => {}); // chưa xác minh
    expect(spy.mock.calls.length - moc).toBe(3);
  });

  it('đăng nhập thành công trả access token, refresh token và user công khai', async () => {
    const { db, svc } = await seedVerified();
    const r = await svc.login('a@b.co', 'matkhau123', 'may-tinh');
    expect(typeof r.accessToken).toBe('string');
    expect(r.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(r.user).toEqual({
      id: db.state.user[0].id, email: 'a@b.co', name: null, role: 'user', avatarUrl: null,
    });
    expect(db.state.userToken.find((t: any) => t.type === 'refresh')!.userAgent).toBe('may-tinh');
  });

  // Bịt lỗ hổng Task 4 bàn giao: test cũ chỉ phủ mã xác minh, chưa phủ refresh token.
  it('DB chỉ nhận hash của refresh token, không lưu bản thô', async () => {
    const { db, svc } = await seedVerified();
    const r = await svc.login('a@b.co', 'matkhau123', 'UA');
    const row = db.state.userToken.find((t: any) => t.type === 'refresh')!;
    expect(row.tokenHash).toBe(tokens.hashToken(r.refreshToken));
    expect(row.tokenHash).not.toBe(r.refreshToken);
  });

  it('email không phân biệt hoa thường khi đăng nhập', async () => {
    const { svc } = await seedVerified();
    await expect(svc.login('A@B.co', 'matkhau123', 'UA')).resolves.toBeTruthy();
  });

  it('userAgent dài bị cắt còn 200 ký tự', async () => {
    const { db, svc } = await seedVerified();
    await svc.login('a@b.co', 'matkhau123', 'U'.repeat(300));
    expect(db.state.userToken.find((t: any) => t.type === 'refresh')!.userAgent).toHaveLength(200);
  });

  it('đăng nhập trên nhiều thiết bị cho nhiều dòng refresh, không đuổi nhau', async () => {
    const { db, svc } = await seedVerified();
    const a = await svc.login('a@b.co', 'matkhau123', 'may-tinh');
    const b = await svc.login('a@b.co', 'matkhau123', 'dien-thoai');
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(2);
    expect(await svc.refresh(a.refreshToken, 'may-tinh')).not.toBeNull();
    expect(await svc.refresh(b.refreshToken, 'dien-thoai')).not.toBeNull();
  });
});

describe('xoay vòng refresh', () => {
  it('refresh đúng thì trả token mới và giữ token cũ trong đệm 30 giây', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { db, svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');

    const r1 = await svc.refresh(first.refreshToken, 'UA');
    expect(r1).not.toBeNull();
    expect(r1!.refreshToken).not.toBe(first.refreshToken);
    const row = db.state.userToken.find((t: any) => t.type === 'refresh')!;
    expect(row.tokenHash).toBe(tokens.hashToken(r1!.refreshToken));
    expect(row.prevTokenHash).toBe(tokens.hashToken(first.refreshToken));
    expect(row.prevValidUntil!.getTime() - Date.now()).toBe(30 * 1000);
  });

  it('xoay vòng tại chỗ, không nhân bản dòng phiên', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { db, svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');
    await svc.refresh(first.refreshToken, 'UA');
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(1);
  });

  it('refresh không kèm userAgent thì giữ userAgent của phiên', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { db, svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'dien-thoai');
    await svc.refresh(first.refreshToken);
    expect(db.state.userToken.find((t: any) => t.type === 'refresh')!.userAgent).toBe('dien-thoai');
  });

  it('refresh với userAgent dài thì cắt còn 200 ký tự', async () => {
    const { db, svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');
    await svc.refresh(first.refreshToken, 'U'.repeat(300));
    expect(db.state.userToken.find((t: any) => t.type === 'refresh')!.userAgent).toHaveLength(200);
  });

  it('hai tab cùng refresh trong 30 giây thì tab chậm vẫn được token mới', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { db, svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');

    vi.setSystemTime(new Date('2026-03-01T00:00:05Z'));
    const tabA = await svc.refresh(first.refreshToken, 'UA');
    expect(tabA).not.toBeNull();
    // Tab B chưa kịp nhận kết quả nên vẫn cầm token cũ — không được giết phiên.
    vi.setSystemTime(new Date('2026-03-01T00:00:10Z'));
    const tabB = await svc.refresh(first.refreshToken, 'UA');
    expect(tabB).not.toBeNull();
    expect(tabB!.refreshToken).not.toBe(tabA!.refreshToken);
    // Token tab A vừa nhận vẫn dùng được sau khi tab B xoay vòng.
    expect(await svc.refresh(tabA!.refreshToken, 'UA')).not.toBeNull();
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(1);
  });

  it('token cũ 29 giây vẫn dùng được', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');

    vi.setSystemTime(new Date('2026-03-01T00:00:01Z'));
    expect(await svc.refresh(first.refreshToken, 'UA')).not.toBeNull();
    vi.setSystemTime(new Date('2026-03-01T00:00:30Z'));
    expect(await svc.refresh(first.refreshToken, 'UA')).not.toBeNull();
  });

  it('token cũ hơn 30 giây thì bị từ chối, trả null', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');

    vi.setSystemTime(new Date('2026-03-01T00:00:01Z'));
    expect(await svc.refresh(first.refreshToken, 'UA')).not.toBeNull();
    vi.setSystemTime(new Date('2026-03-01T00:00:32Z'));
    await expect(svc.refresh(first.refreshToken, 'UA')).resolves.toBeNull();
  });

  it('token sai thì trả null', async () => {
    const { svc } = await seedVerified();
    await expect(svc.refresh('0'.repeat(64), 'UA')).resolves.toBeNull();
  });

  it('mã xác minh email chưa dùng, chưa hết hạn đưa vào refresh thì trả null', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('b@b.co', 'matkhau123');
    const raw = sent[0].text.match(/token=([0-9a-f]{64})/)?.[1];
    expect(raw).toBeTruthy();

    await expect(svc.refresh(raw!, 'UA')).resolves.toBeNull();
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
  });

  it('refresh hết hạn sau 30 ngày thì trả null', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');

    vi.setSystemTime(new Date('2026-03-31T00:00:01Z'));
    await expect(svc.refresh(first.refreshToken, 'UA')).resolves.toBeNull();
  });

  it('dòng nằm trong đệm mà không phải phiên refresh thì vẫn bị từ chối', async () => {
    const { db, svc } = await seedVerified();
    // Dựng tay trạng thái mà code hiện tại chưa tạo ra: `prevTokenHash` là cột
    // chung của mọi loại token, nên guard `type` phải đứng ở cả nhánh đệm.
    const raw = 'b'.repeat(64);
    db.state.userToken.push({
      id: 'x', userId: db.state.user[0].id, type: 'verify_email', tokenHash: 'khac',
      prevTokenHash: tokens.hashToken(raw), prevValidUntil: new Date(Date.now() + 30_000),
      createdAt: new Date(),
    });

    await expect(svc.refresh(raw, 'UA')).resolves.toBeNull();
    expect(db.state.userToken.find((t: any) => t.id === 'x')!.tokenHash).toBe('khac');
  });

  it('refresh token mà tài khoản đã bị xoá thì trả null', async () => {
    const { db, svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');
    db.state.user.length = 0;
    await expect(svc.refresh(first.refreshToken, 'UA')).resolves.toBeNull();
  });
});

describe('giới hạn phiên', () => {
  it('MAX_SESSIONS = 10', async () => {
    const { MAX_SESSIONS } = await import('./auth.service.ts');
    expect(MAX_SESSIONS).toBe(10);
  });

  it('đăng nhập lần thứ 11 thì cắt phiên cũ nhất, còn đúng 10 dòng refresh', async () => {
    const { db, svc } = await seedVerified();
    const phien = [(await svc.login('a@b.co', 'matkhau123', 'may-1')).refreshToken];
    for (let i = 2; i <= 11; i++) {
      phien.push((await svc.login('a@b.co', 'matkhau123', 'may-' + i)).refreshToken);
    }
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(10);
    await expect(svc.refresh(phien[0], 'may-1')).resolves.toBeNull();
    await expect(svc.refresh(phien[10], 'may-11')).resolves.not.toBeNull();
  });

  it('cắt phiên cũ không đụng mã xác minh của cùng tài khoản', async () => {
    const { db, svc } = await seedVerified();
    for (let i = 1; i <= 11; i++) await svc.login('a@b.co', 'matkhau123', 'may-' + i);
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(10);
    expect(db.state.userToken.filter((t: any) => t.type === 'verify_email')).toHaveLength(1);
  });

  it('trimSessions truyền tie-break id xuống DB', async () => {
    const { db, svc } = await seedVerified();
    await svc.login('a@b.co', 'matkhau123', 'may-1');
    expect(db.userToken.findMany).toHaveBeenCalledWith({
      where: { userId: db.state.user[0].id, type: 'refresh' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('khi mọi phiên trùng createdAt thì phiên vừa cấp vẫn được giữ', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { db, svc } = await seedVerified();
    const phien: string[] = [];
    for (let i = 1; i <= 11; i++) {
      phien.push((await svc.login('a@b.co', 'matkhau123', 'may-' + i)).refreshToken);
    }
    const dong = db.state.userToken.filter((t: any) => t.type === 'refresh');
    expect(dong).toHaveLength(10);
    // Điều kiện để tie-break là thứ quyết định ở test này: createdAt trùng tuyệt đối,
    // nên Postgres không có lý do nào xếp `createdAt` theo ý muốn.
    expect(new Set(dong.map((t: any) => t.createdAt.getTime())).size).toBe(1);
    // Không có tie-break thì phiên vừa cấp rơi vào cuối danh sách và bị xoá ngay.
    await expect(svc.refresh(phien[10], 'may-11')).resolves.not.toBeNull();
    await expect(svc.refresh(phien[0], 'may-1')).resolves.toBeNull();
  });
});

describe('đăng xuất', () => {
  it('logout xoá phiên, token đó không refresh được nữa', async () => {
    const { db, svc } = await seedVerified();
    const r = await svc.login('a@b.co', 'matkhau123', 'UA');
    await svc.logout(r.refreshToken);
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
    await expect(svc.refresh(r.refreshToken, 'UA')).resolves.toBeNull();
  });

  it('logout bằng token nằm trong đệm cũng xoá được phiên', async () => {
    freezeAt('2026-03-01T00:00:00Z');
    const { db, svc } = await seedVerified();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');
    const r1 = (await svc.refresh(first.refreshToken, 'UA'))!;

    await svc.logout(first.refreshToken);
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
    await expect(svc.refresh(r1.refreshToken, 'UA')).resolves.toBeNull();
  });

  it('logout token lạ không ném lỗi và không xoá nhầm phiên khác', async () => {
    const { db, svc } = await seedVerified();
    await svc.login('a@b.co', 'matkhau123', 'UA');
    await expect(svc.logout('f'.repeat(64))).resolves.toBeUndefined();
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(1);
  });

  it('logoutAll xoá mọi phiên của tài khoản, giữ mã xác minh, không đụng tài khoản khác', async () => {
    const { db, svc } = await seedVerified();
    await svc.register('b@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[1].id }, data: { emailVerifiedAt: new Date() } });
    await svc.login('a@b.co', 'matkhau123', 'may-a');
    await svc.login('b@b.co', 'matkhau123', 'may-b');
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(2);

    await svc.logoutAll(db.state.user[0].id);
    const conLai = db.state.userToken.filter((t: any) => t.type === 'refresh');
    expect(conLai).toHaveLength(1);
    expect(conLai[0].userId).toBe(db.state.user[1].id);
    expect(db.state.userToken.filter((t: any) => t.type === 'verify_email')).toHaveLength(2);
  });
});

/**
 * Câu trả lời duy nhất của `forgotPassword` — ghim thành hằng ở đây để đổi câu là
 * test đỏ, vì đây chính là câu không được lộ khác nhau giữa các trường hợp.
 */
const RESET_MSG = 'Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.';

/**
 * Đăng ký → xác minh email → xin quên mật khẩu, trả về **mã thô đọc từ mail**.
 * Cố ý không `vi.spyOn(tokens, 'newToken')` như Task 4-6: đọc mã từ nội dung
 * mail mới chứng minh mã thật sự tới nơi người dùng cần tới — nếu hỏng tình huống
 * này (link không kèm mã) thì mọi test dùng `newToken` giả vẫn xanh trong khi
 * không ai đặt lại được mật khẩu.
 */
async function seedReset(email = 'a@b.co') {
  const db = makeDb();
  const sent: any[] = [];
  const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
  await svc.register(email, 'matkhau123');
  await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
  await svc.forgotPassword(email);
  // Chỉ lấy đúng mail đặt lại. Dùng `sent.at(-1)` thì khi `forgotPassword` quên
  // gửi mail, helper âm thầm lấy luôn mail xác minh — còn mã 64 ký tự hợp lệ —
  // và mọi test phía dưới vẫn xanh trong khi không ai nhận được link đặt lại.
  const mail = sent.find((m) => String(m.text).includes('/reset-password?token='));
  expect(mail).toBeTruthy();
  const raw = String(mail!.text).match(/token=([0-9a-f]{64})/)?.[1];
  expect(raw).toBeTruthy();
  return { db, svc, sent, raw: raw! };
}

const resetRows = (db: any) => db.state.userToken.filter((t: any) => t.type === 'reset_password');
const refreshRows = (db: any) => db.state.userToken.filter((t: any) => t.type === 'refresh');

/**
 * Cho mọi microtask đang chờ chạy hết. Cần sau khi gọi `forgotPassword` vì mail
 * được gửi **nền**: lúc đó `send` và `.catch` của nó chưa xong, nên assert ngay
 * sẽ kiểm tra trạng thái của một việc chưa xảy ra.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve); });
}

describe('quên mật khẩu', () => {
  it('email không tồn tại, chưa xác minh và sai định dạng trả đúng MỘT câu, giống nhau', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    // Tài khoản có thật nhưng chưa xác minh: khác email-không-tồn-tại ở chỗ DB có
    // dòng user, nên nếu chỉ kiểm "user có tồn tại" thì lỡ tay gửi mail cho nó.
    await svc.register('chua-xac-minh@b.co', 'matkhau123');
    const mailDaGui = sent.length;

    const r1 = await svc.forgotPassword('khong-ton-tai@b.co');
    const r2 = await svc.forgotPassword('chua-xac-minh@b.co');
    const r3 = await svc.forgotPassword('khong-phai-email');
    const r4 = await svc.forgotPassword('');

    expect(r1.message).toBe(RESET_MSG);
    expect(r2.message).toBe(r1.message);
    expect(r3.message).toBe(r1.message);
    expect(r4.message).toBe(r1.message);
    // Ba trường hợp trên không được chạm vào bảng token cũng không gửi thêm mail.
    expect(db.userToken.create).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(mailDaGui);
  });

  it('email có thật và đã xác minh thì sinh đúng một dòng reset_password và gửi mail', async () => {
    const { db, sent } = await seedReset();
    expect(resetRows(db)).toHaveLength(1);
    // 1 mail xác minh lúc đăng ký + 1 mail đặt lại mật khẩu.
    expect(sent).toHaveLength(2);
    expect(sent.at(-1)!.to).toBe('a@b.co');
    expect(String(sent.at(-1)!.subject)).toContain('mật khẩu');
  });

  it('mã đặt lại hạn đúng 1 giờ, ngắn hơn 24 giờ của mã xác minh', async () => {
    // Đóng băng đồng hồ: `expiresAt` được dựng bằng `Date.now()` lúc tạo, nên với
    // đồng hồ thật thì phép trừ ở đây lệch 1-2 ms mỗi lần chạy — test nhấp nháy xanh
    // đỏ theo tải máy. Giống test hạn 24 giờ của mã xác minh.
    freezeAt('2026-05-01T00:00:00Z');
    const { db } = await seedReset();
    const row = resetRows(db)[0];
    // Ghim đúng số: đổi 1 giờ thành 24 giờ (như VERIFY_TTL_MS) là test đỏ.
    expect(row.expiresAt.getTime() - Date.now()).toBe(60 * 60 * 1000);
    expect(resetRows(db)[0].expiresAt.getTime()).not.toBe(
      db.state.userToken[0].expiresAt.getTime(),
    );
  });

  it('email viết HOA và có khoảng trắng vẫn ra mã (thiếu .trim()/.toLowerCase() là hỏng)', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });

    const r = await svc.forgotPassword('  A@B.co  ');
    expect(resetRows(db)).toHaveLength(1);
    expect(sent.at(-1)!.to).toBe('a@b.co');
    expect(r.message).toBe(RESET_MSG);
  });

  it('DB chỉ nhận hash của mã; mã thô chỉ nằm trong link trong mail', async () => {
    const { db, raw, sent } = await seedReset();
    const row = resetRows(db)[0];
    expect(row.tokenHash).toBe(tokens.hashToken(raw));
    expect(row.tokenHash).not.toBe(raw);
    expect(String(sent.at(-1)!.text)).toContain(`/reset-password?token=${raw}`);
  });

  it('xin lại trong 1 giờ thì không sinh mã thứ hai, không gửi mail thứ hai', async () => {
    const { db, sent, svc } = await seedReset();
    const truoc = db.state.userToken.length;
    const r = await svc.forgotPassword('a@b.co');
    // Câu trả lời y hệt nên người gọi không biết có bị chặn hay không.
    expect(r.message).toBe(RESET_MSG);
    expect(db.state.userToken).toHaveLength(truoc);
    expect(sent).toHaveLength(2);
  });

  it('mã đã hết hạn thì xin lại được ngay, mã mới hạn lại 1 giờ', async () => {
    freezeAt('2026-05-01T00:00:00Z');
    const { db, svc } = await seedReset();
    vi.setSystemTime(new Date('2026-05-01T01:00:01Z'));
    await svc.forgotPassword('a@b.co');
    expect(resetRows(db)).toHaveLength(2);
    expect(resetRows(db)[1].expiresAt.getTime() - Date.now()).toBe(60 * 60 * 1000);
  });

  it('mã đã dùng xong thì xin lại được ngay', async () => {
    const { db, svc, raw } = await seedReset();
    expect(await svc.resetPassword(raw, 'matkhaumoi123')).toBe(true);
    await svc.forgotPassword('a@b.co');
    expect(resetRows(db)).toHaveLength(2);
  });

  it('giới hạn theo tài khoản, không chặn nhầm tài khoản khác', async () => {
    // IP dùng chung ở Việt Nam rất phổ biến nên `ThrottleGuard` (theo IP) không
    // đủ: phải có thêm giới hạn theo chính tài khoản mới chặn được bơm mail vào
    // hộp thư một người. Bỏ `userId` khỏi truy vấn là test này đỏ.
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await svc.register('b@b.co', 'matkhau123');
    for (const u of [0, 1]) {
      await db.user.update({ where: { id: db.state.user[u].id }, data: { emailVerifiedAt: new Date() } });
    }
    await svc.forgotPassword('a@b.co');
    await svc.forgotPassword('a@b.co');
    await svc.forgotPassword('b@b.co');
    expect(resetRows(db).filter((t: any) => t.userId === db.state.user[0].id)).toHaveLength(1);
    expect(resetRows(db).filter((t: any) => t.userId === db.state.user[1].id)).toHaveLength(1);
  });

  it('mailer hỏng thì vẫn trả đúng câu đó, không lộ lỗi ra ngoài', async () => {
    const bom = makeDb();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const svcBom = new AuthService(bom, { send: async () => { throw new Error('SMTP chết'); } } as any, makePremium());
    await svcBom.register('a@b.co', 'matkhau123');
    await bom.user.update({ where: { id: bom.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    const r = await svcBom.forgotPassword('a@b.co');
    await flush();
    expect(r.message).toBe(RESET_MSG);
    expect(resetRows(bom)).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });

  /**
   * `mail.send` là thứ nặng nhất của endpoint (SMTP: hàng trăm ms). Nếu response
   * chờ nó thì **thời gian phản hồi** tự nó phân biệt được "email có tài khoản"
   * với "email không có", phá đúng biện pháp "luôn trả cùng một câu" mà `login`
   * dựng bằng `burnCompare`. Test này là hàng rào cho đúng cái đó.
   */
  it('không chờ mail: send treo vĩnh viễn thì forgotPassword vẫn trả về', async () => {
    const treo = new Promise<void>(() => { /* không bao giờ resolve */ });
    const db = makeDb();
    // Chỉ mail **đặt lại** treo: `register` cố ý `await` mail xác minh, nên treo
    // cả hai thì test hỏng ở `register` chứ không phải ở `forgotPassword`.
    const svc = new AuthService(db, {
      send: (m: any) => (String(m.subject).includes('Đặt lại') ? treo : Promise.resolve()),
    } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });

    // Đua với mốc 500 ms: nếu `forgotPassword` lại `await` mail, nó treo ở đây và

    // thắng phần `Timeout` — thay vì treo tới hết timeout của vitest.
    const TREO = 'TREO';
    const r = await Promise.race([
      svc.forgotPassword('a@b.co'),
      new Promise((x) => { setTimeout(() => { x(TREO); }, 500); }),
    ]);
    expect(r).not.toBe(TREO);
    expect((r as { message: string }).message).toBe(RESET_MSG);
    // Token vẫn phải được tạo: không chờ mail không được có nghĩa bỏ luôn việc cấp mã.
    expect(resetRows(db)).toHaveLength(1);
  });

  it('mail lỗi thì ghi Logger.warn kèm lý do, không nuốt im lặng', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = makeDb();
    const svc = new AuthService(db, {
      send: async () => { throw new Error('SMTP chết'); },
    } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    warn.mockClear(); // bỏ qua log của mail xác minh lúc đăng ký

    await svc.forgotPassword('a@b.co');
    await flush();
    expect(warn).toHaveBeenCalledOnce();
    const dong = String(warn.mock.calls[0][0]);
    expect(dong).toContain('SMTP chết');
    // Log phải chỉ ra đích gửi để còn truy được, nhưng không được lộ mã đặt lại.
    expect(dong).toContain('a@b.co');
    expect(dong).not.toMatch(/[0-9a-f]{64}/);
  });

  it('mail lỗi thì trả lại mã đã cấp, không kẹt người dùng 1 giờ', async () => {
    // Giữ mã còn hạn mà không ai nhận được, thì cooldown 1 giờ/tài khoản sẽ nuốt
    // mọi lần xin lại → một lần SMTP chết biến thành "quên mật khẩu bị treo 1 tiếng".
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = makeDb();
    let hong = true;
    const svc = new AuthService(db, {
      send: async () => { if (hong) throw new Error('SMTP chết'); },
    } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });

    await svc.forgotPassword('a@b.co');
    await flush();
    expect(resetRows(db)[0].usedAt).not.toBeNull();

    hong = false; // SMTP sống lại, người dùng bấm lại
    await svc.forgotPassword('a@b.co');
    expect(resetRows(db)).toHaveLength(2);
  });
});

describe('đặt lại mật khẩu', () => {
  it('mã hợp lệ thì đổi mật khẩu và xoá HẾT mọi phiên', async () => {
    const { db, svc, raw } = await seedReset();
    await svc.login('a@b.co', 'matkhau123', 'may-1');
    await svc.login('a@b.co', 'matkhau123', 'may-2');
    expect(refreshRows(db)).toHaveLength(2);

    expect(await svc.resetPassword(raw, 'matkhaumoi123')).toBe(true);
    // Bỏ lời gọi `logoutAll` là test này đỏ: phiên cũ vẫn sống thì kẻ trộm được
    // cookie trước khi đổi mật khẩu vẫn vào app được.
    expect(refreshRows(db)).toHaveLength(0);
    expect(resetRows(db)[0].usedAt).not.toBeNull();
  });

  it('mật khẩu cũ chết, mật khẩu mới dùng được', async () => {
    const { svc, raw } = await seedReset();
    expect(await svc.resetPassword(raw, 'matkhaumoi123')).toBe(true);
    await expect(svc.login('a@b.co', 'matkhau123', 'UA')).rejects.toMatchObject({ status: 401 });
    const r = await svc.login('a@b.co', 'matkhaumoi123', 'UA');
    expect(r.refreshToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mã dùng lần hai bị từ chối và không đụng mật khẩu đã đặt', async () => {
    const { db, svc, raw } = await seedReset();
    expect(await svc.resetPassword(raw, 'matkhaumoi123')).toBe(true);
    const hashDaDoi = db.state.user[0].passwordHash;

    // Bỏ kiểm tra `usedAt` là test này đỏ: lần hai trả true và ghi đè mật khẩu.
    expect(await svc.resetPassword(raw, 'matkhaumoi1234')).toBe(false);
    expect(db.state.user[0].passwordHash).toBe(hashDaDoi);
  });

  it('dùng một mã thì vô hiệu MỌI mã đặt lại còn lại của tài khoản', async () => {
    // Lỗ hổng: cooldown cho phép mỗi tài khoản một mail mỗi giờ, nên tài khoản có
    // thể còn mã cũ **còn hạn**. Đánh dấu đúng mã vừa dùng thì kẻ giữ mã cũ vẫn
    // đổi được mật khẩu lần nữa — sau khi chủ tài khoản đã đổi mật khẩu và tin là
    // mình an toàn.
    freezeAt('2026-06-01T00:00:00Z');
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    const ma = (n: number) => String(
      sent.filter((m) => String(m.text).includes('/reset-password?token='))[n].text,
    ).match(/token=([0-9a-f]{64})/)![1];

    await svc.forgotPassword('a@b.co');
    const [row1] = resetRows(db);
    const raw1 = ma(0);
    vi.setSystemTime(new Date('2026-06-01T01:00:01Z'));
    await svc.forgotPassword('a@b.co');
    const row2 = resetRows(db)[1];
    const raw2 = ma(1);
    // Gia hạn row1 để **cả hai cùng sống**. Không làm vậy thì lần dùng thứ hai
    // trả `false` vì hết hạn chứ không phải vì đã dùng → test xanh sai.
    row1.expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    expect(await svc.resetPassword(raw1, 'matkhaumoi123')).toBe(true);
    // Bỏ phần vô hiệu hoá mọi mã (chỉ đánh dấu dòng vừa dùng) là test này đỏ.
    expect(await svc.resetPassword(raw2, 'matkhaumoi1234')).toBe(false);
    expect(row2.usedAt).not.toBeNull();
  });

  it('vô hiệu mã cũ không ghi đè mốc thời gian của mã đã dùng trước đó', async () => {
    // `usedAt` của một mã là dấu vết "mã này bị dùng lúc nào". Ghi đè nó bằng thời
    // điểm của một lần reset sau là mất dấu vết, nên lọc `usedAt: null` khi vô
    // hiệu hoá là bắt buộc chứ không phải tối ưu.
    freezeAt('2026-06-01T00:00:00Z');
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    const ma = (n: number) => String(
      sent.filter((m) => String(m.text).includes('/reset-password?token='))[n].text,
    ).match(/token=([0-9a-f]{64})/)![1];

    await svc.forgotPassword('a@b.co');
    const row1 = resetRows(db)[0];
    const raw1 = ma(0);
    vi.setSystemTime(new Date('2026-06-01T00:30:00Z'));
    expect(await svc.resetPassword(raw1, 'matkhaumoi123')).toBe(true);
    const lucDaDung = row1.usedAt;
    expect(lucDaDung!.getTime()).toBe(Date.parse('2026-06-01T00:30:00Z'));

    vi.setSystemTime(new Date('2026-06-01T01:00:01Z'));
    await svc.forgotPassword('a@b.co');
    const row2 = resetRows(db)[1];
    expect(await svc.resetPassword(ma(1), 'matkhaumoi1234')).toBe(true);
    expect(row1.usedAt!.getTime()).toBe(lucDaDung!.getTime());
    expect(row2.usedAt!.getTime()).toBe(Date.parse('2026-06-01T01:00:01Z'));
  });

  it('mã xác minh email và refresh token đưa vào resetPassword thì trả false', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    const maXacNhan = String(sent[0].text).match(/token=([0-9a-f]{64})/)![1];
    const phien = await svc.login('a@b.co', 'matkhau123', 'may-cu-a');
    const hashCu = db.state.user[0].passwordHash;

    // Bỏ `row.type !== 'reset_password'` là test này đỏ: mã xác minh email hoặc
    // refresh token bị trộm sẽ đổi được mật khẩu và đuổi chủ sở hữu ra khỏi app.
    expect(await svc.resetPassword(maXacNhan, 'matkhaumoi123')).toBe(false);
    expect(await svc.resetPassword(phien.refreshToken, 'matkhaumoi123')).toBe(false);
    expect(db.state.user[0].passwordHash).toBe(hashCu);
    // Dòng xác minh vẫn chưa dùng: `resetPassword` từ chối ở tầng token, không
    // được "tiện tay" đánh dấu dòng mà nó vừa từ chối.
    expect(resetRows(db)).toHaveLength(0);
    expect(refreshRows(db)).toHaveLength(1);
    expect(db.state.userToken.find((t: any) => t.type === 'verify_email')!.usedAt).toBeFalsy();
  });

  it('mã còn dùng được ở giây thứ 59:59', async () => {
    freezeAt('2026-05-01T00:00:00Z');
    const { svc, raw } = await seedReset();
    vi.setSystemTime(new Date('2026-05-01T00:59:59Z'));
    expect(await svc.resetPassword(raw, 'matkhaumoi123')).toBe(true);
  });

  it('mã hết hạn ở giây thứ 60:00 thì trả false, mật khẩu giữ nguyên', async () => {
    freezeAt('2026-05-01T00:00:00Z');
    const { db, svc, raw } = await seedReset();
    const hashCu = db.state.user[0].passwordHash;
    vi.setSystemTime(new Date('2026-05-01T01:00:00Z'));
    expect(await svc.resetPassword(raw, 'matkhaumoi123')).toBe(false);
    expect(db.state.user[0].passwordHash).toBe(hashCu);
  });

  it('mã lạ thì trả false, không đụng gì', async () => {
    const { db, svc } = await seedReset();
    const hashCu = db.state.user[0].passwordHash;
    expect(await svc.resetPassword('0'.repeat(64), 'matkhaumoi123')).toBe(false);
    expect(db.state.user[0].passwordHash).toBe(hashCu);
  });

  it('mật khẩu mới dưới 8 ký tự bị 400 TRƯỚC khi tra cặp token', async () => {
    const { db, svc, raw } = await seedReset();
    const mocToken = db.userToken.findFirst.mock.calls.length;
    const mocUser = db.user.update.mock.calls.length;
    const e = await svc.resetPassword(raw, 'ngan').catch((x) => x);
    expect(e.status).toBe(400);
    expect(e.message).toBe('Mật khẩu phải có ít nhất 8 ký tự');
    // Dời phép đo độ dài xuống sau khi tra token là test này đỏ: mật khẩu quá ngắn
    // là lỗi dữ liệu của người gọi, không phụ thuộc mã có hợp lệ hay không.
    expect(db.userToken.findFirst).toHaveBeenCalledTimes(mocToken);
    expect(db.user.update).toHaveBeenCalledTimes(mocUser);
    expect(db.state.user[0].passwordHash).not.toBe('ngan');
  });

  it('thiếu body thì 400, không phải 500', async () => {
    const { svc } = await seedReset();
    await expect(svc.resetPassword(undefined as never, undefined as never))
      .rejects.toMatchObject({ status: 400 });
  });

  it('xoá phiên lỗi thì KHÔNG đổi mật khẩu', async () => {
    // Đổi mật khẩu trước rồi mới xoá phiên là lỗ hổng: DB chết giữa chừng thì
    // mật khẩu đã đổi (chủ nhà tưởng an toàn) còn cookie của kẻ trộm vẫn sống.
    // Vì vậy `logoutAll` phải chạy trước bước ghi mật khẩu.
    const { db, svc, raw } = await seedReset();
    const hashCu = db.state.user[0].passwordHash;
    db.userToken.deleteMany.mockRejectedValueOnce(new Error('DB chết'));
    await expect(svc.resetPassword(raw, 'matkhaumoi123')).rejects.toThrow('DB chết');
    expect(db.state.user[0].passwordHash).toBe(hashCu);
  });

  it('đổi mật khẩu không đụng tài khoản khác', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any, makePremium());
    await svc.register('a@b.co', 'matkhau123');
    await svc.register('b@b.co', 'matkhau123');
    for (const u of [0, 1]) {
      await db.user.update({ where: { id: db.state.user[u].id }, data: { emailVerifiedAt: new Date() } });
    }
    await svc.login('b@b.co', 'matkhau123', 'may-b');
    await svc.forgotPassword('a@b.co');
    const rawA = String(sent.find((m) => String(m.text).includes('/reset-password?token='))!.text)
      .match(/token=([0-9a-f]{64})/)![1];

    expect(await svc.resetPassword(rawA, 'matkhaumoi123')).toBe(true);
    expect(refreshRows(db)).toHaveLength(1);
    expect(refreshRows(db)[0].userId).toBe(db.state.user[1].id);
  });
});

describe('thông tin tài khoản', () => {
  it('trả user công khai, không lộ passwordHash', async () => {
    const { db, svc } = await seedVerified();
    expect(await svc.me(db.state.user[0].id)).toEqual({
      id: db.state.user[0].id, email: 'a@b.co', name: null, role: 'user', avatarUrl: null,
    });
  });

  it('tài khoản không còn thì trả 401', async () => {
    const { svc } = await seedVerified();
    await expect(svc.me(999)).rejects.toMatchObject({ status: 401 });
  });
});
describe('hạ VIP hết hạn lúc ký access token', () => {
  /** Dựng user đã xác minh, role tuỳ ý, kèm premium mock trả về kết quả mong muốn. */
  async function seedVip(role: string, premiumResult: Record<string, unknown>) {
    const db = makeDb();
    const premium = makePremium(premiumResult);
    const svc = new AuthService(db, { send: async () => {} } as any, premium);
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({
      where: { id: db.state.user[0].id },
      data: { emailVerifiedAt: new Date(), role, vipExpiresAt: new Date(Date.now() + 86_400_000) },
    });
    return { db, svc, premium };
  }

  it('VIP đã quá hạn: token đăng nhập mang role user chứ không phải vip', async () => {
    const { svc } = await seedVip('vip', { downgraded: true, wasVip: true, expired: true });
    const r = await svc.login('a@b.co', 'matkhau123', 'UA');
    const claims = await tokens.verifyAccessToken(r.accessToken);
    expect(claims?.role).toBe('user');
  });

  it('VIP chưa hết hạn: token đăng nhập vẫn mang role vip', async () => {
    const { svc } = await seedVip('vip', { downgraded: false, wasVip: true, expired: false });
    const r = await svc.login('a@b.co', 'matkhau123', 'UA');
    const claims = await tokens.verifyAccessToken(r.accessToken);
    expect(claims?.role).toBe('vip');
  });

  it('admin không bị hạ nhầm xuống user', async () => {
    const { svc } = await seedVip('admin', { downgraded: false, wasVip: false, expired: false });
    const r = await svc.login('a@b.co', 'matkhau123', 'UA');
    const claims = await tokens.verifyAccessToken(r.accessToken);
    expect(claims?.role).toBe('admin');
  });

  it('hết hạn phải hạ DB trước, không chỉ đổi role trong token', async () => {
    const { db, svc, premium } = await seedVip('vip', { downgraded: true, wasVip: true, expired: true });
    await svc.login('a@b.co', 'matkhau123', 'UA');
    expect(premium.checkAndDowngradeIfExpired).toHaveBeenCalledWith(db.state.user[0].id);
  });

  it('luôn hỏi trạng thái hạn khi ký token, kể cả user thường', async () => {
    const { db, svc, premium } = await seedVip('user', { downgraded: false, wasVip: false, expired: false });
    await svc.login('a@b.co', 'matkhau123', 'UA');
    expect(premium.checkAndDowngradeIfExpired).toHaveBeenCalledWith(db.state.user[0].id);
  });

  it('refresh cũng phải hạ VIP hết hạn, không chỉ đăng nhập', async () => {
    const { svc } = await seedVip('vip', { downgraded: true, wasVip: true, expired: true });
    const r = await svc.login('a@b.co', 'matkhau123', 'UA');
    const refreshed = await svc.refresh(r.refreshToken, 'UA');
    const claims = await tokens.verifyAccessToken(refreshed!.accessToken);
    expect(claims?.role).toBe('user');
  });
});

/**
 * Profile Google hợp lệ. `sub` là mã định danh bền vững, `email` thì Google cho
 * người dùng đổi — mọi quyết định ghép tài khoản phải dựa vào `sub`.
 */
/** `avatarUrl: null` = Google không trả `picture`; xem describe `avatarUrl` bên dưới. */
const GOOGLE_OK = {
  sub: 'g-1', email: 'a@b.co', emailVerified: true, name: 'A B', avatarUrl: null,
};

/** URL ảnh kiểu Google trả (dùng chung cho cả test `googleProfile` lẫn test DB). */
const GOOGLE_CO = 'https://lh3.googleusercontent.com/a/photo-1';

/**
 * Profile Google có ảnh đại diện. `picture` là URL do Google trả, nên nó là **dữ
 * liệu bên ngoài**: `avatarUrl` phải chịu được việc thiếu, rỗng, hoặc sai kiểu
 * mà không làm hỏng luồng đăng nhập.
 */
const GOOGLE_WITH_PHOTO = { ...GOOGLE_OK, avatarUrl: GOOGLE_CO };

describe('avatarUrl từ Google', () => {
  it('profile có picture thì user mới nhận avatarUrl', async () => {
    // Bỏ `avatarUrl` khỏi `user.create` là test này đỏ: cột nullable thì không
    // ai bắt buộc phải ghi, và không có test nì ảnh sẽ luôn null.
    const { db, svc } = makeEmptySvc();
    await svc.linkOrCreateFromGoogle(GOOGLE_WITH_PHOTO, null);
    expect(db.state.user[0].avatarUrl).toBe(GOOGLE_CO);
  });

  it('ghép vào tài khoản cũ thì cập nhật avatarUrl chứ không chỉ set lúc tạo', async () => {
    // Người dùng đổi ảnh Google giữa chừng là chuyện thật, và nhánh "đã có tài
    // khoản" mới là nhánh mà mọi lần đăng nhập sau đều đi qua. Bỏ `user.update`
    // ở nhánh này là test đỏ.
    const { db, svc } = await seedVerified();
    const id = db.state.user[0].id;
    expect(db.state.user[0].avatarUrl).toBeUndefined();
    expect(await svc.linkOrCreateFromGoogle(GOOGLE_WITH_PHOTO, id)).toEqual({ kind: 'ok', userId: id });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id }, data: { avatarUrl: GOOGLE_CO } }),
    );
    expect(db.state.user[0].avatarUrl).toBe(GOOGLE_CO);
  });

  it('sub đã gắn sẵn thì cũng cập nhật avatarUrl', async () => {
    // Lần đăng nhập Google thứ hai đi qua nhánh `existingLink` chứ không qua
    // nhánh "email đã có" — bỏ `user.update` ở đây là ảnh Google không bao giờ
    // được cập nhật sau lần đăng nhập đầu tiên.
    const { db, svc } = makeEmptySvc();
    await svc.linkOrCreateFromGoogle(GOOGLE_WITH_PHOTO, null);
    const id = db.state.user[0].id;
    const doi = 'https://lh3.googleusercontent.com/a/photo-2';
    expect(await svc.linkOrCreateFromGoogle({ ...GOOGLE_WITH_PHOTO, avatarUrl: doi }, id))
      .toEqual({ kind: 'ok', userId: id });
    expect(db.state.user[0].avatarUrl).toBe(doi);
  });

  it('Google không trả picture thì không ghi đè avatar sẵn có bằng null', async () => {
    // `undefined` (thiếu hẳn) là "không biết", khác `null` ("biết là không có").
    // Ghi đè bằng `null` là xoá ảnh người dùng chỉ vì một lần Google im tiếng.
    const { db, svc } = await seedVerified();
    const id = db.state.user[0].id;
    await db.user.update({ where: { id }, data: { avatarUrl: GOOGLE_CO } });
    await svc.linkOrCreateFromGoogle(GOOGLE_WITH_PHOTO, id);
    await svc.linkOrCreateFromGoogle({ ...GOOGLE_WITH_PHOTO, avatarUrl: null }, id);
    expect(db.state.user[0].avatarUrl).toBe(GOOGLE_CO);
  });

  it('Google trả picture sai kiểu thì coi như không có, không ném 500', async () => {
    // `picture` là dữ liệu từ JSON bên ngoài, không hứa kiểu: số hay object
    // đều không được làm hỏng luồng đăng nhập.
    const { db, svc } = makeEmptySvc();
    const p = { ...GOOGLE_OK, avatarUrl: { khong: 'phai chuoi' } } as unknown as GoogleProfile;
    expect(await svc.linkOrCreateFromGoogle(p, null)).toEqual({ kind: 'ok', userId: 1 });
    expect(db.state.user[0].avatarUrl ?? null).toBeNull();
  });

  it('toPublic trả avatarUrl để FE dùng', async () => {
    // Không có trường này trong `PublicUser` thì FE không lấy đâu ra ảnh, dù DB
    // có cột.
    const { db, svc } = makeEmptySvc();
    await svc.linkOrCreateFromGoogle(GOOGLE_WITH_PHOTO, null);
    expect(await svc.me(db.state.user[0].id)).toMatchObject({ avatarUrl: GOOGLE_CO });
  });

  it('me() của tài khoản không có ảnh trả null, không phải undefined', async () => {
    const { db, svc } = await seedVerified();
    expect(await svc.me(db.state.user[0].id)).toMatchObject({ avatarUrl: null });
  });
});

/**
 * db giả **trống** + service. Nhánh "email mới" cần đúng trạng thái này, nên
 * không dùng `seedVerified`: hàm đó đã tạo sẵn user `a@b.co`, và mọi test bắt
 * đầu từ đó đều rơi vào nhánh "email đã tồn tại" chứ không phải nhánh tạo mới.
 */
function makeEmptySvc() {
  const db = makeDb();
  return { db, svc: new AuthService(db, { send: async () => {} } as any, makePremium()) };
}

describe('linkOrCreateFromGoogle', () => {
  it('email mới thì tạo user đã xác minh và ghi UserAccount', async () => {
    const { db, svc } = makeEmptySvc();
    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    expect(r).toEqual({ kind: 'ok', userId: 1 });
    // Bỏ `emailVerifiedAt: new Date()` là test này đỏ: user sinh ra từ Google mà
    // chưa xác minh thì `login` chặn vĩnh viễn — họ không có mật khẩu để tự xác
    // minh, và cũng không có màn hình nào để bấm.
    expect(db.state.user[0].emailVerifiedAt).toBeTruthy();
    expect(db.state.user[0].email).toBe('a@b.co');
    expect(db.state.user[0].name).toBe('A B');
    expect(db.state.userAccount[0]).toMatchObject({
      userId: db.state.user[0].id, provider: 'google', providerUserId: 'g-1',
    });
  });

  it('user sinh ra từ Google không có passwordHash', async () => {
    // Không sinh mật khẩu ngẫu nhiên. `passwordHash = null` là tín hiệu mà cả
    // `login` (nhánh `burnCompare`) dựa vào để biết "tài khoản này không đăng
    // nhập được bằng mật khẩu"; điền hash của một mật khẩu không ai giữ vào đó
    // là tạo ra bí mật mà không ai quản lý, đồng thời làm mất chính tín hiệu
    // phân biệt đó.
    const { db, svc } = makeEmptySvc();
    await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    expect(db.state.user[0].passwordHash ?? null).toBeNull();
  });

  it('email_verified false thì từ chối, không ghi gì', async () => {
    const { db, svc } = await seedVerified();
    // `register` của seed đã gọi `user.create`, nên phải chụp mốc trước thay vì
    // đòi `not.toHaveBeenCalled()`.
    const soUser = db.user.create.mock.calls.length;
    const r = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, emailVerified: false }, null);
    expect(r).toEqual({ kind: 'unverified' });
    expect(db.state.userAccount).toHaveLength(0);
    expect(db.user.create).toHaveBeenCalledTimes(soUser);
  });

  it('email_verified là chuỗi thì vẫn từ chối — chỉ tin đúng `=== true`', async () => {
    // Google trả JSON nên không hứa kiểu dữ liệu. Nếu kiểm tra truthy thì chuỗi
    // `"false"` cũng truthy và **mọi** profile không xác minh đều lọt vào — đúng
    // nhánh bảo mật chính, nên có test riêng chứ không gộp vào case `false`.
    const { db, svc } = await seedVerified();
    const soUser = db.user.create.mock.calls.length;
    const p = { ...GOOGLE_OK, emailVerified: 'true' } as unknown as GoogleProfile;
    const r = await svc.linkOrCreateFromGoogle(p, null);
    expect(r).toEqual({ kind: 'unverified' });
    expect(db.state.userAccount).toHaveLength(0);
    expect(db.user.create).toHaveBeenCalledTimes(soUser);
  });

  it('email đã có và đang đăng nhập thì ghép vào user đó', async () => {
    const { db, svc } = await seedVerified();
    const id = db.state.user[0].id;
    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, id);
    expect(r).toEqual({ kind: 'ok', userId: id });
    expect(db.state.user).toHaveLength(1);
    expect(db.state.userAccount).toHaveLength(1);
    expect(db.state.userAccount[0]).toMatchObject({
      userId: id, provider: 'google', providerUserId: 'g-1',
    });
  });

  it('email đã có mà CHƯA đăng nhập thì không ghép — ranh giới bảo mật', async () => {
    // Tự ghép theo email ở đây là lỗ hổng: kẻ nào đăng ký được một tài khoản
    // Google mang đúng email của nạn nhân cũng vào thẳng tài khoản đó. Bắt họ
    // đăng nhập bằng mật khẩu trước là cách duy nhất chứng minh mình giữ tài
    // khoản; bấm lại nút Google sau đó sẽ rơi vào nhánh `ok`.
    const { db, svc } = await seedVerified();
    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    expect(r).toEqual({ kind: 'needs-password', email: 'a@b.co' });
    expect(db.state.user).toHaveLength(1);
    // Không chỉ trả `needs-password`: **không được** ghi UserAccount. Ghi luôn
    // thì lần sau bấm nút Google là vào thẳng mà không cần mật khẩu nữa — nhánh
    // `needs-password` trở thành trang trắng.
    expect(db.state.userAccount).toHaveLength(0);
  });

  it('Google trả email khác chữ hoa/thường thì vẫn ra needs-password, không tạo user thứ hai', async () => {
    // `User.email` là `TEXT @unique` — Postgres phân biệt hoa/thường. Tra bằng
    // đúng chuỗi Google trả thì `A@B.CO` không khớp dòng `a@b.co` đã có,
    // `findUnique` **trượt**, và ta rơi xuống nhánh TẠO USER MỚI: ranh giới
    // "email đã tồn tại mà chưa đăng nhập thì không ghép" hoá thành "không tồn
    // tại", và tài khoản cũ mãi mãi không được gắn với Google.
    const { db, svc } = await seedVerified();
    const r = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, email: 'A@B.CO' }, null);
    // Email trả về là bản đã chuẩn hoá: nó đi thẳng vào `?email=` để điền sẵn ô
    // form, và mọi đường ghi còn lại của DB đều viết dạng chữ thường.
    expect(r).toEqual({ kind: 'needs-password', email: 'a@b.co' });
    expect(db.state.user).toHaveLength(1);
    expect(db.state.userAccount).toHaveLength(0);
  });

  it('khớp theo sub chứ không theo email: sub đã gắn user khác thì báo conflict', async () => {
    const { db, svc } = await seedVerified();
    const idA = db.state.user[0].id;
    // Cần tài khoản thứ hai để thử chuyện gắn sub đã thuộc về A vào tài khoản B.
    await svc.register('b@b.co', 'matkhau123');
    const idB = db.state.user[1].id;
    await db.user.update({ where: { id: idB }, data: { emailVerifiedAt: new Date() } });
    expect(await svc.linkOrCreateFromGoogle(GOOGLE_OK, idA)).toEqual({ kind: 'ok', userId: idA });

    // Cùng `sub`, nhưng email đã đổi sang của B, và người gọi đang đăng nhập B.
    const r = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, email: 'b@b.co' }, idB);
    expect(r).toEqual({ kind: 'conflict' });
    // Sub vẫn phải trỏ về A. Nếu khớp theo email thì B nuốt mất liên kết này —
    // tức một tài khoản Google duy nhất bị gắn vào hai user khác nhau.
    expect(db.state.userAccount).toHaveLength(1);
    expect(db.state.userAccount[0].userId).toBe(idA);
    // Và phải tra bằng khoá compound thật của Prisma, không phải field phẳng:
    // đây là hợp đồng với db, và là chỗ duy nhất chống trùng.
    expect(db.userAccount.findUnique).toHaveBeenCalledWith({
      where: { provider_providerUserId: { provider: 'google', providerUserId: 'g-1' } },
    });
  });

  it('conflict vì sub đã gắn user khác thì log id và sub — không log email', async () => {
    // Spec yêu cầu "từ chối **và log**". `conflict` không bao giờ xảy ra trong vận
    // hành bình thường, nên nếu nó xảy ra mà log im thì không ai biết. Email là
    // PII và log ở đây ở chế độ công khai, nên chỉ `id` + `sub`.
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { db, svc } = await seedVerified();
    const idA = db.state.user[0].id;
    await svc.register('b@b.co', 'matkhau123');
    const idB = db.state.user[1].id;
    await db.user.update({ where: { id: idB }, data: { emailVerifiedAt: new Date() } });
    expect(await svc.linkOrCreateFromGoogle(GOOGLE_OK, idA)).toEqual({ kind: 'ok', userId: idA });

    const r = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, email: 'b@b.co' }, idB);
    expect(r).toEqual({ kind: 'conflict' });
    const line = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain(`sub=${GOOGLE_OK.sub}`);
    expect(line).toContain(`linkUserId=${idA}`);
    expect(line).toContain(`signedInId=${idB}`);
    // Xoá dòng `this.logger.warn` trước `return { kind: 'conflict' }` thì `line`
    // rỗng → test này đỏ. Không có assert nào ở trên bắt được việc thiếu log.
    expect(line).not.toContain('b@b.co');
  });

  it('conflict vì email trùng user khác thì log id và sub — không log email', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { db, svc } = await seedVerified();
    await svc.register('b@b.co', 'matkhau123');
    const idB = db.state.user[1].id;
    await db.user.update({ where: { id: idB }, data: { emailVerifiedAt: new Date() } });

    // `sub` chưa từng gắn, nhưng email đã thuộc về user A còn người gọi đang
    // đăng nhập B — đây là nhánh `conflict` thứ hai, và nó cũng phải log.
    const r = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, sub: 'g-2' }, idB);
    expect(r).toEqual({ kind: 'conflict' });
    const line = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('sub=g-2');
    expect(line).toContain(`emailUserId=${db.state.user[0].id}`);
    expect(line).toContain(`signedInId=${idB}`);
    expect(line).not.toContain('a@b.co');
  });

  it('race hai callback cùng email mới: P2002 thành needs-password, không phải 500', async () => {
    // Cả hai callback tra `findUnique` lúc email còn chưa có rồi cùng `create`.
    // Người thứ hai nhận `P2002`; để nó ném ra thì callback trả 500 — màn trắng.
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { db, svc } = makeEmptySvc();
    db.user.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });

    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    expect(r).toEqual({ kind: 'needs-password', email: 'a@b.co' });
    // Không ghi UserAccount: tài khoản đã tồn tại thì bắt đăng nhập bằng mật khẩu,
    // tuyệt đối không ghép — đây là ranh giới, không phải lỗi để bỏ qua.
    expect(db.state.userAccount).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain('a@b.co');
  });

  it('lỗi DB khác P2002 thì ném nguyên, không giả thành "email đã tồn tại"', async () => {
    // Bắt rộng hơn `P2002` là nói dối người dùng rằng email của họ trùng khi
    // thật ra máy chủ chết; lỗi thật phải nổi lên để điều tra được.
    const { db, svc } = makeEmptySvc();
    const loi = Object.assign(new Error('hết thời gian chờ'), { code: 'P1001' });
    db.user.create.mockRejectedValueOnce(loi);
    await expect(svc.linkOrCreateFromGoogle(GOOGLE_OK, null)).rejects.toBe(loi);
  });

  it('đã gắn rồi thì bấm lại nút Google khi chưa đăng nhập vẫn vào đúng tài khoản cũ', async () => {
    const { db, svc } = await seedVerified();
    const id = db.state.user[0].id;
    await svc.linkOrCreateFromGoogle(GOOGLE_OK, id);
    // Lần hai không còn phiên — đây đúng là lúc người dùng bấm nút Google để
    // đăng nhập, nên phải trả về tài khoản đã gắn chứ không phải
    // `needs-password` (bắt nhập mật khẩu vô ích), và không tạo liên kết thứ hai.
    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    expect(r).toEqual({ kind: 'ok', userId: id });
    expect(db.state.userAccount).toHaveLength(1);
  });
});

describe('googleProfile', () => {
  const ENV = {
    GOOGLE_CLIENT_ID: 'cid',
    GOOGLE_CLIENT_SECRET: 'csec',
    GOOGLE_REDIRECT_URI: 'https://app.go.vn/auth/google/callback',
  };
  const KEYS = Object.keys(ENV) as (keyof typeof ENV)[];
  let truoc: Record<string, string | undefined>;

  beforeEach(() => {
    truoc = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    Object.assign(process.env, ENV);
    // `googleProfile` log cảnh báo ở các nhánh lỗi; để output của test sạch.
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (truoc[k] === undefined) delete process.env[k];
      else process.env[k] = truoc[k];
    }
  });

  const res = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

  /**
   * Giả `fetch` theo đúng thứ tự lời gọi và ghi lại từng lời gọi, để test kiểm
   * được request token có mang `code_verifier` (thiếu nó thì PKCE hỏng, mà
   * Google chỉ trả 400 — lúc đó mọi assert về kết quả vẫn xanh vì lý do khác)
   * và để phát hiện service gọi thừa hay gọi sai thứ tự.
   */
  function stubFetch(...kq: any[]) {
    const calls: { url: string; init: any }[] = [];
    let i = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      const r = kq[i++];
      if (!r) throw new Error(`fetch được gọi lần ${i} không có trong kịch bản`);
      return r;
    }));
    return calls;
  }

  it('thiếu cấu hình thì trả null chứ không ném 500', async () => {
    // Không cấu hình là tình trạng triển khai, không phải lỗi của người dùng:
    // ném 500 khiến nút Google báo "tài khoản sai" một cách vô lý.
    delete process.env.GOOGLE_CLIENT_ID;
    const calls = stubFetch(res({}), res({}));
    const { svc } = makeEmptySvc();
    await expect(svc.googleProfile('code', 'verifier')).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('Google trả lỗi khi đổi code thì trả null, không gọi tiếp userinfo', async () => {
    const calls = stubFetch(res({ error: 'invalid_grant' }, false, 400), res({}));
    const { svc } = makeEmptySvc();
    await expect(svc.googleProfile('code', 'verifier')).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('lấy được profile thì trả đủ 5 trường, và có mang code_verifier', async () => {
    const calls = stubFetch(
      res({ access_token: 'tok' }),
      res({ sub: 'g-1', email: 'a@b.co', email_verified: true, name: 'A B' }),
    );
    const { svc } = makeEmptySvc();
    // `avatarUrl: null` khi Google không trả `picture` — dùng `toEqual` nên
    // trả `undefined` sẽ đỏ: kiểu `GoogleProfile` hứa `string | null`.
    await expect(svc.googleProfile('code-1', 'verifier-1')).resolves.toEqual({
      sub: 'g-1', email: 'a@b.co', emailVerified: true, name: 'A B', avatarUrl: null,
    });
    expect(calls.map((c) => c.url)).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://openidconnect.googleapis.com/v1/userinfo',
    ]);
    const body = String(calls[0].init.body);
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code_verifier=verifier-1');
    expect(calls[1].init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('email_verified là chuỗi "true" thì thành false — không tin kiểu của Google', async () => {
    // Lớp thứ hai trước khi tới `linkOrCreateFromGoogle`: chỗ này ép về boolean
    // thật nên `"true"` không bao giờ đi tiếp được. Sửa `=== true` thành
    // `raw.email_verified` là test này đỏ.
    stubFetch(
      res({ access_token: 'tok' }),
      res({ sub: 'g-1', email: 'a@b.co', email_verified: 'true', name: 'A B' }),
    );
    const { svc } = makeEmptySvc();
    const p = await svc.googleProfile('code', 'verifier');
    expect(p?.emailVerified).toBe(false);
  });

  it('thiếu sub hoặc email thì trả null chứ không làm profile nửa vời', async () => {
    const { svc } = makeEmptySvc();
    stubFetch(res({ access_token: 'tok' }), res({ email: 'a@b.co', email_verified: true }));
    await expect(svc.googleProfile('code', 'verifier')).resolves.toBeNull();

    stubFetch(res({ access_token: 'tok' }), res({ sub: 'g-1', email_verified: true }));
    await expect(svc.googleProfile('code', 'verifier')).resolves.toBeNull();
  });

  it('Google trả lỗi khi lấy userinfo thì trả null', async () => {
    const calls = stubFetch(res({ access_token: 'tok' }), res({}, false, 401));
    const { svc } = makeEmptySvc();
    await expect(svc.googleProfile('code', 'verifier')).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('đọc picture thành avatarUrl', async () => {
    // Bỏ `picture` khỏi kết quả là test này đỏ: cột `avatarUrl` sẽ luôn null
    // dù Google có gửi ảnh.
    stubFetch(
      res({ access_token: 'tok' }),
      res({ sub: 'g-1', email: 'a@b.co', email_verified: true, name: 'A B', picture: GOOGLE_CO }),
    );
    const { svc } = makeEmptySvc();
    await expect(svc.googleProfile('code', 'verifier')).resolves.toMatchObject({
      avatarUrl: GOOGLE_CO,
    });
  });

  it('thiếu picture thì avatarUrl là null, không phải undefined', async () => {
    // `GoogleProfile.avatarUrl` kiểu `string | null` nên thiếu hẳn phải hoá
    // `null`; nếu để `undefined` thì mọi nơi so sánh với `null` đều trượt.
    stubFetch(
      res({ access_token: 'tok' }),
      res({ sub: 'g-1', email: 'a@b.co', email_verified: true, name: 'A B' }),
    );
    const { svc } = makeEmptySvc();
    expect((await svc.googleProfile('code', 'verifier'))?.avatarUrl).toBeNull();
  });

  it('picture rỗng hoặc sai kiểu thì coi như không có ảnh', async () => {
    stubFetch(res({ access_token: 'tok' }), res({ sub: 'g-1', email: 'a@b.co', email_verified: true, picture: '' }));
    const { svc } = makeEmptySvc();
    expect((await svc.googleProfile('code', 'verifier'))?.avatarUrl).toBeNull();

    stubFetch(res({ access_token: 'tok' }), res({ sub: 'g-1', email: 'a@b.co', email_verified: true, picture: 42 }));
    expect((await svc.googleProfile('code', 'verifier'))?.avatarUrl).toBeNull();
  });
});

/**
 * Phiên phát ra sau OAuth **phải** đi qua đúng đường của `login`: ký access
 * token bằng `roleForToken` (hạ VIP quá hạn trong DB trước khi ký) rồi mới cấp
 * refresh. `roleForToken` và `issueRefresh` đều `private`, nên nếu controller
 * tự ký token thì `tsc` vẫn 0 lỗi — chỉ có test này mới bắt được.
 */
describe('phiên sau OAuth', () => {
  /** Dựng user đã xác minh, role tuỳ ý, kèm premium mock trả về kết quả mong muốn. */
  async function seedVipUser(role: string, premiumResult: Record<string, unknown>) {
    const db = makeDb();
    const premium = makePremium(premiumResult);
    const svc = new AuthService(db, { send: async () => {} } as any, premium);
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({
      where: { id: db.state.user[0].id },
      data: { emailVerifiedAt: new Date(), role, vipExpiresAt: new Date(Date.now() + 86_400_000) },
    });
    return { db, svc, premium };
  }

  it('VIP hết hạn: token từ OAuth mang role user chứ không phải vip', async () => {
    const { svc, db } = await seedVipUser('vip', { downgraded: true, wasVip: true, expired: true });
    const r = await svc.issueSessionForUserId(db.state.user[0].id, 'UA');
    const claims = await tokens.verifyAccessToken(r!.accessToken);
    expect(claims?.role).toBe('user');
  });

  it('VIP chưa hết hạn: token từ OAuth vẫn mang role vip', async () => {
    const { svc, db } = await seedVipUser('vip', { downgraded: false, wasVip: true, expired: false });
    const r = await svc.issueSessionForUserId(db.state.user[0].id, 'UA');
    const claims = await tokens.verifyAccessToken(r!.accessToken);
    expect(claims?.role).toBe('vip');
  });

  it('OAuth cũng phải hạ VIP hết hạn trong DB, không chỉ đổi role trong token', async () => {
    const { svc, db, premium } = await seedVipUser('vip', { downgraded: true, wasVip: true, expired: true });
    await svc.issueSessionForUserId(db.state.user[0].id, 'UA');
    expect(premium.checkAndDowngradeIfExpired).toHaveBeenCalledWith(db.state.user[0].id);
  });

  it('cấp cả refresh token thật trong DB và ghi user-agent', async () => {
    const { svc, db } = await seedVipUser('user', { downgraded: false, wasVip: false, expired: false });
    const id = db.state.user[0].id;
    const r = await svc.issueSessionForUserId(id, 'Mozilla/5.0');
    const dong = db.state.userToken.filter((t: any) => t.type === 'refresh');
    expect(dong).toHaveLength(1);
    expect(dong[0].userId).toBe(id);
    expect(dong[0].tokenHash).toBe(tokens.hashToken(r!.refreshToken));
    expect(dong[0].userAgent).toBe('Mozilla/5.0');
    // Access token phải là chữ ký RS256 thật, không phải chuỗi bất kỳ.
    expect((await tokens.verifyAccessToken(r!.accessToken))?.sub).toBe(String(id));
  });

  it('user không tồn tại thì trả null chứ không ký token không ai dùng được', async () => {
    const { svc } = await seedVipUser('user', { downgraded: false, wasVip: false, expired: false });
    expect(await svc.issueSessionForUserId(999, 'UA')).toBeNull();
  });

  it('phát phiên OAuth cũng cắt bớt phiên cũ vượt MAX_SESSIONS', async () => {
    // `login` cắt phiên cũ; nếu đường OAuth quên thì người dùng bấm Google nhiều
    // lần sẽ vượt giới hạn phiên và không bao giờ bị đuổi phiên cũ.
    const { svc, db } = await seedVipUser('user', { downgraded: false, wasVip: false, expired: false });
    const id = db.state.user[0].id;
    for (let i = 0; i < 12; i += 1) {
      await db.userToken.create({
        data: { userId: id, type: 'refresh', tokenHash: 'hash-' + i, expiresAt: new Date(Date.now() + 86_400_000) },
      });
    }
    await svc.issueSessionForUserId(id, 'UA');
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(10);
  });
});

describe('state OAuth qua AuthService', () => {
  it('beginGoogleOAuth lưu redirectTo đã đi qua safeInternalPath', async () => {
    // Lần đầu trong hai lần kiểm (lúc đọc `?redirect_to=`); lần sau ở controller.
    const { svc, db } = makeEmptySvc();
    await svc.beginGoogleOAuth('https://evil.com');
    expect(db.state.userOAuthState[0].redirectTo).toBe('/');
  });

  it('state dùng một lần rồi chết, lần hai trả null', async () => {
    const { svc } = makeEmptySvc();
    const { state } = await svc.beginGoogleOAuth('/premium');
    expect(await svc.takeGoogleState(state)).toEqual({
      codeVerifier: expect.any(String), redirectTo: '/premium',
    });
    expect(await svc.takeGoogleState(state)).toBeNull();
  });

  it('state lưu dạng hash, không lưu bản rõ', async () => {
    const { svc, db } = makeEmptySvc();
    const { state, codeVerifier } = await svc.beginGoogleOAuth('/');
    expect(db.state.userOAuthState[0].stateHash).toBe(tokens.hashToken(state));
    expect(db.state.userOAuthState[0].stateHash).not.toBe(state);
    // `code_verifier` phải khớp đúng thứ trả về, vì callback dùng nó để đổi code.
    expect(db.state.userOAuthState[0].codeVerifier).toBe(codeVerifier);
  });

  it('state rỗng hoặc không tồn tại thì trả null, không ném', async () => {
    const { svc } = makeEmptySvc();
    expect(await svc.takeGoogleState('')).toBeNull();
    expect(await svc.takeGoogleState('khong-ton-tai')).toBeNull();
  });
});

/**
 * `userIdForRefresh` phục vụ cho `signedInUserId` ở callback OAuth: hỏi "phiên này
 * của ai" mà **không** làm mới phiên. Nó phải tôn trọng đúng những điều kiện mà
 * `refresh()` đặt, nếu không thì một token mà `refresh` từ chối lại được dùng
 * để gắn Google vào một tài khoản.
 */
describe('userIdForRefresh', () => {
  it('refresh token còn hạn thì trả userId của dòng phiên đó', async () => {
    const { db, svc } = makeEmptySvc();
    const user = await db.user.create({ data: { email: 'a@b.co' } });
    const phien = await svc.issueSessionForUserId(user.id, 'UA');
    expect(await svc.userIdForRefresh(phien!.refreshToken)).toBe(user.id);
  });

  it('chỉ ĐỌC: không phát token mới, không xoá dòng phiên', async () => {
    // Xoá dòng phiên ở đây là đăng xuất người dùng. Callback OAuth chỉ cần biết
    // id để ghép Google vào đúng tài khoản — làm thêm thao tác này là mất phiên
    // người dùng chỉ vì họ bấm nút Google.
    const { db, svc } = makeEmptySvc();
    const user = await db.user.create({ data: { email: 'a@b.co' } });
    const phien = await svc.issueSessionForUserId(user.id, 'UA');
    const soDong = db.state.userToken.length;
    await svc.userIdForRefresh(phien!.refreshToken);
    expect(db.state.userToken).toHaveLength(soDong);
    expect(db.userToken.update).not.toHaveBeenCalled();
    // Và token vẫn dùng được sau đó — chứng minh không có xoay vòng nào xảy ra.
    expect(await svc.refresh(phien!.refreshToken)).not.toBeNull();
  });

  it('token sai, rỗng, hết hạn, hoặc không phải phiên refresh thì trả null', async () => {
    const { db, svc } = makeEmptySvc();
    const user = await db.user.create({ data: { email: 'a@b.co' } });
    expect(await svc.userIdForRefresh('')).toBeNull();
    expect(await svc.userIdForRefresh('khong-ton-tai')).toBeNull();

    // Hết hạn: `findRotatable` từ chối, và `userIdForRefresh` phải từ chối y hệt.
    await db.userToken.create({
      data: {
        userId: user.id, type: 'refresh', tokenHash: tokens.hashToken('het-han'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect(await svc.userIdForRefresh('het-han')).toBeNull();

    // Mã xác minh email cũng là dòng trong `UserToken` — không phải phiên.
    await db.userToken.create({
      data: {
        userId: user.id, type: 'verify_email', tokenHash: tokens.hashToken('ma-xac-nhan'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(await svc.userIdForRefresh('ma-xac-nhan')).toBeNull();
  });
});

/**
 * Bảng `UserOAuthState` phình theo **số lần bấm nút** chứ không theo số người, nên
 * ngoài `consumeState` (xoá dòng đã dùng) phải còn một lịch quét dòng hết hạn —
 * state người dùng bỏ dở (đóng tab, Google trả `error`) không ai ăn nên không ai
 * xoá.
 */
describe('quét state OAuth hết hạn', () => {
  const KHOA = ['DISABLE_OAUTH_STATE_SWEEP', 'OAUTH_STATE_SWEEP_INTERVAL_MS'] as const;
  let truoc: Record<string, string | undefined>;

  beforeEach(() => {
    truoc = Object.fromEntries(KHOA.map((k) => [k, process.env[k]]));
    // `onModuleInit` gọi `Logger.log`; giữ output test sạch.
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const k of KHOA) {
      if (truoc[k] === undefined) delete process.env[k];
      else process.env[k] = truoc[k];
    }
  });

  /**
   * Dựng service với hai dòng state: một còn hạn, một đã hết hạn.
   *
   * `beginGoogleOAuth` luôn đặt hạn 10 phút kể từ `now` nên dòng hết hạn phải
   * chỉnh tay trong db giả — không có cách nào làm nó hết hạn tự nhiên mà không
   * chờ 10 phút thật.
   */
  async function seedStates() {
    const { db, svc } = makeEmptySvc();
    const conHan = (await svc.beginGoogleOAuth('/')).state;
    const hetHan = (await svc.beginGoogleOAuth('/')).state;
    // Chỉ dòng thứ hai hết hạn: dòng đầu phải còn hạn để test chứng minh lịch quét
    // không xoá nhầm dòng đang dùng được.
    db.state.userOAuthState[1] = { ...db.state.userOAuthState[1], expiresAt: new Date(Date.now() - 1000) };
    expect(db.state.userOAuthState[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    return { db, svc, conHan, hetHan };
  }

  it('xoá dòng hết hạn, giữ dòng còn hạn', async () => {
    // Bỏ lịch quét là test này đỏ: dòng hết hạn nằm lại vĩnh viễn, và mỗi dòng
    // mang `codeVerifier` dạng rõ.
    const { db, svc, conHan } = await seedStates();
    process.env.OAUTH_STATE_SWEEP_INTERVAL_MS = '60000';
    vi.useFakeTimers();
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(db.state.userOAuthState.map((r: any) => r.stateHash)).toHaveLength(1);
    expect(db.state.userOAuthState[0].codeVerifier).toBeTruthy();
    // Dòng còn hạn phải **dùng được**, không phải chỉ còn trong bảng.
    expect(await svc.takeGoogleState(conHan)).not.toBeNull();
  });

  it('xoá theo điều kiện expiresAt để ăn đúng index', async () => {
    const { db, svc } = await seedStates();
    process.env.OAUTH_STATE_SWEEP_INTERVAL_MS = '60000';
    vi.useFakeTimers();
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(30_000);
    const lanSweep = db.userOAuthState.deleteMany.mock.calls.filter(
      (c: any[]) => c[0]?.where?.expiresAt?.lte !== undefined,
    );
    expect(lanSweep.length).toBeGreaterThanOrEqual(1);
  });

  it('xoá cả dòng đã đánh dấu usedAt từ bản deploy cũ', async () => {
    // Dòng cũ không đi qua `consumeState` nữa nên không ai xoá nó; thêm
    // `usedAt: null` vào điều kiện lịch quét là dòng đó nằm lại vĩnh viễn.
    const { db, svc } = await seedStates();
    // Dòng thứ hai vốn đã hết hạn (xem `seedStates`); đánh dấu `usedAt` lên nó
    // để mô phỏng dữ liệu do bản cũ để lại.
    db.state.userOAuthState[1] = {
      ...db.state.userOAuthState[1], usedAt: new Date(Date.now() - 60_000),
    };
    process.env.OAUTH_STATE_SWEEP_INTERVAL_MS = '60000';
    vi.useFakeTimers();
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(db.state.userOAuthState).toHaveLength(1);
    expect(db.state.userOAuthState[0].usedAt).toBeNull();
  });

  it('DISABLE_OAUTH_STATE_SWEEP=1 thì không bật lịch, không đụng DB', async () => {
    // Cần khuôn này cho môi trường test và cho người chạy local muốn dọn tay.
    const { db, svc } = await seedStates();
    const soDong = db.state.userOAuthState.length;
    process.env.DISABLE_OAUTH_STATE_SWEEP = '1';
    vi.useFakeTimers();
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(db.userOAuthState.deleteMany).not.toHaveBeenCalled();
    expect(db.state.userOAuthState).toHaveLength(soDong);
  });

  it('chu kỳ không hợp lệ thì không bật lịch, không ném', async () => {
    // `setInterval` với NaN/<=0 là lỗi của người vận hành, không được làm app
    // chết lúc boot.
    const { svc } = makeEmptySvc();
    for (const gia of ['abc', '0', '-1']) {
      process.env.OAUTH_STATE_SWEEP_INTERVAL_MS = gia;
      expect(() => svc.onModuleInit()).not.toThrow();
    }
  });

  it('lỗi DB lúc quét không làm chết tiến trình', async () => {
    const { db, svc } = await seedStates();
    db.userOAuthState.deleteMany.mockRejectedValueOnce(new Error('connection terminated'));
    process.env.OAUTH_STATE_SWEEP_INTERVAL_MS = '60000';
    vi.useFakeTimers();
    svc.onModuleInit();
    await expect(vi.advanceTimersByTimeAsync(30_000)).resolves.not.toThrow();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});

describe('điểm danh ngày đầu: streak tài khoản mới', () => {
  /**
   * `keyOf` là `formatKey` mà `ActivityService.getMap` dùng để dựng map
   * mà `calcStreakFromMap` đọc. Test phải đi qua đúng hàm số streak thật —
   * không tự đếm "1 dòng" rồi kết luận "đẳng 1".
   */
  const keyOf = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;

  /** Đầy lệch `offset` so với hôm nay, đề về UTC-midnight. */
  const dayOffset = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };

  function streakOf(db: any, userId: number): number {
    const map: Record<string, number> = {};
    for (const r of db.state.activityDay) if (r.userId === userId) map[keyOf(r.date)] = r.count;
    return calcStreakFromMap(map);
  }

  beforeEach(() => {
    // 10:00 UTC = 17:00 ở VN, nên "hôm nay" không lệch sang ngày khác.
    freezeAt('2026-09-28T10:00:00Z');
  });

  it('đăng ký mới chưa vào app thì chưa có streak — không set lúc ghi bản ghi', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('moi@b.co', 'matkhau123');
    // Tài khoản chưa có phiên: mới là điểm danh, chưa là điểm danh.
    expect(streakOf(db, db.state.user[0].id)).toBe(0);
  });

  it('tài khoản mới xác minh xong, vào app thì streak đúng 1', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    fixVerifyToken();
    await svc.register('moi@b.co', 'matkhau123');

    await svc.verifyEmail(MA, 'UA');
    expect(streakOf(db, db.state.user[0].id)).toBe(1);
  });

  it('đăng nhập lại nhiều lần vẫn là 1, không thành 2', async () => {
    const { db, svc } = await seedVerified('lai@b.co');
    const id = db.state.user[0].id;
    await svc.login('lai@b.co', 'matkhau123', 'UA');
    await svc.login('lai@b.co', 'matkhau123', 'UA');
    await svc.login('lai@b.co', 'matkhau123', 'UA');
    expect(db.state.activityDay.filter((r: any) => r.userId === id)).toHaveLength(1);
    expect(streakOf(db, id)).toBe(1);
  });

  it('tài khoản cũ đã có sẵn ngày thì không bị reset', async () => {
    const { db, svc } = await seedVerified('cu@b.co');
    const id = db.state.user[0].id;
    for (const off of [-2, -1, 0]) {
      db.state.activityDay.push({ id: `seed${off}`, userId: id, date: dayOffset(off), count: 3 });
    }
    expect(streakOf(db, id)).toBe(3);

    await svc.login('cu@b.co', 'matkhau123', 'UA');
    expect(db.state.activityDay.filter((r: any) => r.userId === id)).toHaveLength(3);
    expect(streakOf(db, id)).toBe(3);
    // Dòng hôm nay giữ nguyên count: `update: {}` không ghi đè lên.
    const homNay = db.state.activityDay.find(
      (r: any) => r.date.getTime() === dayOffset(0).getTime(),
    );
    expect(homNay.count).toBe(3);
  });

  it('tài khoản tạo qua Google cũng có streak 1 ngay khi cấp phiên', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any, makePremium());
    const g: GoogleProfile = {
      sub: 'sub-1', email: 'gg@b.co', emailVerified: true, name: 'GG', avatarUrl: null,
    };
    const r = await svc.linkOrCreateFromGoogle(g, null);
    expect(r.kind).toBe('ok');
    const id = (r as { userId: number }).userId;
    expect(streakOf(db, id)).toBe(0);

    await svc.issueSessionForUserId(id, 'UA');
    expect(streakOf(db, id)).toBe(1);
  });

  it('lỗi ghi điểm danh không được làm hỏng phiên', async () => {
    const { db, svc } = await seedVerified('hetphi@b.co');
    const id = db.state.user[0].id;
    await svc.login('hetphi@b.co', 'matkhau123', 'UA');
    const truoc = db.state.activityDay.length;
    db.activityDay.upsert.mockRejectedValueOnce(new Error('db chết'));

    // Cấp phiên phải còn; mất dòng điểm danh thì tài khoản vẫn đăng nhập được.
    await expect(svc.login('hetphi@b.co', 'matkhau123', 'UA')).resolves.not.toBeNull();
    expect(db.state.activityDay.filter((r: any) => r.userId === id)).toHaveLength(truoc);
  });
});
