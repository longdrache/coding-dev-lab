import { generateKeyPairSync } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
 * `{id:{in}}`, `{userId,type}`, `{tokenHash}`, `{prevTokenHash}`, `{OR:[...]}`.
 * Các điều kiện đứng cạnh nhau phải **và** với nhau, nếu không `logoutAll` sẽ
 * xoá nhầm cả dòng `verify_email` và test thành xanh sai.
 */
function tokenMatches(t: any, where: any): boolean {
  if (!where) return true;
  if (where.id?.in) return where.id.in.includes(t.id);
  const scalar = (w: any) =>
    (w.userId === undefined || t.userId === w.userId)
    && (w.type === undefined || t.type === w.type)
    && (w.tokenHash === undefined || t.tokenHash === w.tokenHash)
    && (w.prevTokenHash === undefined || t.prevTokenHash === w.prevTokenHash);
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
      // `createdAt`/`lastUsedAt` có default ở schema, db giả phải dựng y như DB.
      // `id` đệm 4 chữ số để thứ tự chuỗi trùng thứ tự tạo, giống cách `cuid()`
      // của Prisma xếp theo thời điểm sinh — nhờ vậy tie-break `id` của service
      // được mô phỏng trung thực.
      create: vi.fn(async ({ data }: any) => {
        const r = {
          id: 't' + String(state.userToken.length).padStart(4, '0'),
          createdAt: new Date(), lastUsedAt: new Date(), ...data,
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
