import { generateKeyPairSync } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AuthService } from './auth.service.ts';
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
  const state: Record<string, any[]> = { user: [], userToken: [] };
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
        const keep = state.userToken.filter((t) => !tokenMatches(t, where));
        const count = state.userToken.length - keep.length;
        state.userToken.length = 0;
        state.userToken.push(...keep);
        return { count };
      }),
    },
  };
}

/** Đăng ký rồi xác minh email, trả về db giả + service để test dùng tiếp. */
async function seedVerified(email = 'a@b.co') {
  const db = makeDb();
  const svc = new AuthService(db, { send: async () => {} } as any);
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
    svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    } as any);
    const r = await svcBom.register('a@b.co', 'matkhau123');
    expect(bom.state.user).toHaveLength(1);
    expect(bom.state.userToken).toHaveLength(1);
    expect(r.message).toContain('xác nhận');
  });
});

describe('xác minh email', () => {
  it('mã đúng thì xác minh xong cấp phiên', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
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
    const svc = new AuthService(db, { send: async () => {} } as any);
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');
    expect(await svc.verifyEmail(MA, 'UA')).not.toBeNull();
    expect(db.state.userToken[0].usedAt).not.toBeNull();

    await expect(svc.verifyEmail(MA, 'UA')).resolves.toBeNull();
  });

  it('mã sai trả null và không tạo phiên', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    await svc.register('a@b.co', 'matkhau123');
    await expect(svc.verifyEmail('sai', 'UA')).resolves.toBeNull();
    expect(db.state.userToken.filter((t: any) => t.type === 'refresh')).toHaveLength(0);
  });

  it('mã xác minh sống đúng 24 giờ kể từ lúc đăng ký', async () => {
    freezeAt('2026-01-01T00:00:00Z');
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');
    const row = db.state.userToken[0];
    expect(row.expiresAt.getTime() - Date.now()).toBe(24 * 60 * 60 * 1000);
  });

  it('mã xác minh còn dùng được ở giây thứ 23:59:59', async () => {
    freezeAt('2026-01-01T00:00:00Z');
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    fixVerifyToken();
    await svc.register('a@b.co', 'matkhau123');

    freezeAt('2026-01-01T23:59:59Z');
    expect(await svc.verifyEmail(MA, 'UA')).not.toBeNull();
    expect(db.state.user[0].emailVerifiedAt).not.toBeNull();
  });

  it('mã xác minh hết hạn thì trả null, không cấp phiên', async () => {
    freezeAt('2026-01-01T00:00:00Z');
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
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
    const svc = new AuthService(db, { send: async () => {} } as any);
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
  const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
  await svc.register(email, 'matkhau123');
  quayLai(db);
  // Mail xác minh lúc đăng ký đã nằm trong `sent`; đếm lại từ đây.
  return { db, svc, sent };
}

describe('gửi lại link xác nhận', () => {
  it('bốn trường hợp trả đúng MỘT câu, giống nhau tuyệt đối', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    } as any);
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
    const svc = new AuthService(db, { send: async () => {} } as any);
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
    } as any);
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
    const svc = new AuthService(db, { send: async () => { throw new Error('SMTP chết'); } } as any);
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
    const svc = new AuthService(db, { send: async () => {} } as any);
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
    const svcChuaXacMinh = new AuthService(chuaXacMinh, { send: async () => {} } as any);
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
    expect(r.user).toEqual({ id: db.state.user[0].id, email: 'a@b.co', name: null, role: 'user' });
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
  const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svcBom = new AuthService(bom, { send: async () => { throw new Error('SMTP chết'); } } as any);
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
    } as any);
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
    } as any);
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
    } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
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
      id: db.state.user[0].id, email: 'a@b.co', name: null, role: 'user',
    });
  });

  it('tài khoản không còn thì trả 401', async () => {
    const { svc } = await seedVerified();
    await expect(svc.me(999)).rejects.toMatchObject({ status: 401 });
  });
});
