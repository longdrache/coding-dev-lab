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
});

/** Mã xác minh cố định để test biết trước; các lần sinh mã sau vẫn ngẫu nhiên. */
const MA = 'M'.repeat(64);
const realNewToken = tokens.newToken;

// `any` cố ý: đây là db giả, không phải DatabaseService thật.
function makeDb(): any {
  const state: Record<string, any[]> = { user: [], userToken: [] };
  return {
    state,
    user: {
      findUnique: vi.fn(async ({ where }: any) => state.user.find((u) => u.email === where.email) ?? null),
      findFirst: vi.fn(async ({ where }: any) => state.user.find((u) => u.id === where.id) ?? null),
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
      create: vi.fn(async ({ data }: any) => { const r = { id: 't' + state.userToken.length, ...data }; state.userToken.push(r); return r; }),
      findFirst: vi.fn(async ({ where }: any) => state.userToken.find((t) => t.tokenHash === where.tokenHash) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const t = state.userToken.find((x) => x.id === where.id)!; Object.assign(t, data); return t;
      }),
    },
  };
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
});
