import { generateKeyPairSync } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  hashPassword, verifyPassword, newToken, hashToken,
  signAccessToken, verifyAccessToken, ACCESS_TTL_SECONDS,
} from './tokens.ts';

const OLD = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// Khoá tự sinh, không đọc be/.env. Đặt ở cấp module nên có hiệu lực trước mọi
// lời gọi signAccessToken, vì tokens.ts nạp khoá lazy.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
setEnv({
  ADMIN_JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  ADMIN_JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
});

afterAll(() => {
  process.env = { ...OLD };
});

describe('mật khẩu', () => {
  it('hash xong kiểm tra được, và mỗi lần hash cho kết quả khác nhau', async () => {
    const h = await hashPassword('matkhau123');
    expect(h).not.toBe('matkhau123');
    expect(await verifyPassword('matkhau123', h)).toBe(true);
    expect(await verifyPassword('sai', h)).toBe(false);
    expect(await hashPassword('matkhau123')).not.toBe(h);
  });
});

describe('mã một lần', () => {
  it('newToken không lặp lại và đủ dài', () => {
    const a = newToken();
    expect(a).toHaveLength(64);
    expect(newToken()).not.toBe(a);
  });

  it('hashToken ổn định và không lộ token gốc', () => {
    const t = newToken();
    expect(hashToken(t)).toHaveLength(64);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
});

describe('access token', () => {
  it('ký rồi xác minh ra đúng user và vai trò', async () => {
    const t = await signAccessToken(7, 'vip');
    const p = await verifyAccessToken(t);
    expect(p).toEqual({ sub: '7', role: 'vip' });
  });

  it('hết hạn sau 15 phút', () => {
    expect(ACCESS_TTL_SECONDS).toBe(900);
  });

  it('token rác hoặc sai chữ ký trả null chứ không ném', async () => {
    expect(await verifyAccessToken('khong-phai-token')).toBeNull();
    expect(await verifyAccessToken(await signAccessToken(1, 'user') + 'x')).toBeNull();
  });
});
