import { generateKeyPairSync } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { SignJWT, importPKCS8 } from 'jose';
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

  // `role` là thứ duy nhất quyết định quyền xem đề VIP
  // (`problems/vip-problem.policy.ts`), nên claim mang role ngoài allowlist phải bị
  // từ chối chứ không phải "role lạ thì coi như user".
  it('role ngoài allowlist thì null, không đoán bừa', async () => {
    const bad = await new SignJWT({ role: 'superuser' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('1')
      .setIssuer('gocode')
      .setAudience('gocode-api')
      .setIssuedAt()
      .setExpirationTime('900s')
      .sign(await importPKCS8(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'RS256'));
    expect(await verifyAccessToken(bad)).toBeNull();
  });

  // Không có `sub` thì guard không biết đang xác minh cho ai; trả payload sẽ khiến
  // `Number(undefined)` ra NaN và mọi truy vấn theo user im lặng sai.
  it('token không có `sub` thì null', async () => {
    const noSub = await new SignJWT({ role: 'user' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('gocode')
      .setAudience('gocode-api')
      .setIssuedAt()
      .setExpirationTime('900s')
      .sign(await importPKCS8(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'RS256'));
    expect(await verifyAccessToken(noSub)).toBeNull();
  });

  it('sai `iss` hoặc `aud` thì null', async () => {
    const saiIss = await new SignJWT({ role: 'user' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('1')
      .setIssuer('ke-khong')
      .setAudience('gocode-api')
      .setIssuedAt()
      .setExpirationTime('900s')
      .sign(await importPKCS8(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'RS256'));
    expect(await verifyAccessToken(saiIss)).toBeNull();
  });
});

describe('khoá: nạp lazy, đổi khoá là nạp lại, thiếu khoá thì fail closed', () => {
  const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const priv = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  it('thiếu cả hai khoá thì ký ném lỗi nói rõ, xác minh trả null', async () => {
    setEnv({ ADMIN_JWT_PRIVATE_KEY: undefined, ADMIN_JWT_PUBLIC_KEY: undefined });
    await expect(signAccessToken(1, 'user')).rejects.toThrow('Thiếu ADMIN_JWT_PRIVATE_KEY');
    expect(await verifyAccessToken(await (async () => {
      setEnv({ ADMIN_JWT_PRIVATE_KEY: priv, ADMIN_JWT_PUBLIC_KEY: pub });
      return signAccessToken(1, 'user');
    })())).not.toBeNull();
  });

  it('đổi cặp khoá thì token cũ không còn xác minh được', async () => {
    setEnv({ ADMIN_JWT_PRIVATE_KEY: priv, ADMIN_JWT_PUBLIC_KEY: pub });
    const tokenMoi = await signAccessToken(7, 'user');
    expect(await verifyAccessToken(tokenMoi)).toEqual({ sub: '7', role: 'user' });

    // Cặp khoá khác: token đã ký phải chết. Nếu `tokens.ts` chỉ đọc khoá **một
    // lần** rồi giữ mãi, token của khoá cũ vẫn xanh — tức thu hồi khoá không có
    // tác dụng.
    const kp2 = generateKeyPairSync('rsa', { modulusLength: 2048 });
    setEnv({
      ADMIN_JWT_PRIVATE_KEY: kp2.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      ADMIN_JWT_PUBLIC_KEY: kp2.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
    expect(await verifyAccessToken(tokenMoi)).toBeNull();
  });

  // `ADMIN_PRIVATE_KEY` là tên cũ vẫn được đọc khi khi ký. Nhưng **không** có
  // nhánh tương ứng cho khoá công khai: `importSPKI` không nạp được PEM pkcs8, nên
  // thiếu `ADMIN_JWT_PUBLIC_KEY` thì mọi token fail closed — đăng nhập chết âm
  // thầm. Ghim lại để đổi tên biến sau này là có chủ đích.
  it('chỉ có `ADMIN_PRIVATE_KEY` thì ký được nhưng xác minh fail closed', async () => {
    setEnv({ ADMIN_JWT_PRIVATE_KEY: undefined, ADMIN_PRIVATE_KEY: priv, ADMIN_JWT_PUBLIC_KEY: undefined });
    const token = await signAccessToken(7, 'user');
    expect(await verifyAccessToken(token)).toBeNull();
  });

  // PEM một dòng (`\\n` là hai ký tự, không phải newline) là dạng biến môi
  // trường trên Vercel; nếu không sửa thì `importPKCS8` ném.
  it('PEM chứa `\\n` dạng chuỗi hai ký tự vẫn nạp được', async () => {
    const motDong = (priv as string).replace(/\n/g, '\\n');
    setEnv({ ADMIN_JWT_PRIVATE_KEY: motDong, ADMIN_JWT_PUBLIC_KEY: pub });
    const token = await signAccessToken(7, 'user');
    expect(await verifyAccessToken(token)).toEqual({ sub: '7', role: 'user' });
  });

  it('giá trị không phải PEM thì xác minh trả null chứ không ném', async () => {
    setEnv({ ADMIN_JWT_PUBLIC_KEY: 'khong-phai-pem' });
    expect(await verifyAccessToken(await (async () => {
      setEnv({ ADMIN_JWT_PRIVATE_KEY: priv });
      return signAccessToken(7, 'user');
    })())).toBeNull();
  });
});
