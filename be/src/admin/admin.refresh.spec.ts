import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { AdminGuard } from './admin.guard.ts';
import { ADMIN_ACCESS_TTL, ADMIN_REFRESH_TTL, AdminService } from './admin.service.ts';

/**
 * Phiên admin: access token 30 phút, refresh token 7 ngày.
 *
 * Trước khi có `refresh()`, admin **không có** đường nào quay lại sau 30 phút:
 * `AdminService.login` chỉ phát một JWT 30 phút, không có token thứ hai. Nên
 * "hết hạn" ở app admin là **đăng xuất cứng** — người quản trị phải gõ lại mật
 * khẩu mỗi nửa tiếng. Đây là cùng một triệu chứng với app chính, chỉ khác hạn.
 *
 * Test dùng đồng hồ giả (`vi.setSystemTime`) vì hạn là điều duy nhất đang kiểm:
 * không có `sleep` nào ở file này.
 */

const OLD = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function rsaKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    pub: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** Service admin đã cấu hình khoá, sẵn sàng đăng nhập. */
function makeSvc(priv: string, pub: string) {
  setEnv({
    ADMIN_EMAIL: 'admin',
    ADMIN_PASSWORD: 'admin',
    ADMIN_PASSWORD_HASH: undefined,
    ADMIN_JWT_PRIVATE_KEY: priv,
    ADMIN_JWT_PUBLIC_KEY: pub,
    NODE_ENV: 'test',
    VERCEL: undefined,
  });
  return new AdminService({} as never);
}

beforeEach(() => {
  // `jsonwebtoken` đóng dấu thời gian bằng `Date.now()`, nên phải giả cả đồng hồ
  // chứ không chỉ timer — nếu không mọi so sánh hạn trong test là vô nghĩa.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...OLD };
});

describe('AdminService.refresh — làm mới access token', () => {
  it('refresh token còn hạn thì cấp access token mới', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { refreshToken } = await svc.login('admin', 'admin');

    const r = svc.refresh(refreshToken);

    expect(r).not.toBeNull();
    expect((svc.verifyJwt(r!.token) as { typ: string }).typ).toBe('access');
  });

  /**
   * Test quan trọng nhất của cơ chế này. Nếu `refresh()` chấp nhận **access**
   * token thì hạn 30 phút mất tác dụng hoàn toàn: kẻ đánh cắp được một access
   * token lúc 0 phút sẽ tự làm mới nó mãi, và "đăng xuất 30 phút" trở thành vô
   * nghĩa. Access token không phải refresh token, dù nó cùng khoá và cùng role.
   */
  it('access token KHÔNG dùng để làm mới được — nếu không hạn 30 phút mất tác dụng', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { token } = await svc.login('admin', 'admin');

    expect(svc.refresh(token)).toBeNull();
  });

  it('token rỗng, token hỏng, hoặc token ký bằng khoá khác thì trả null chứ không ném', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);

    expect(svc.refresh('')).toBeNull();
    expect(svc.refresh('khong-phai-jwt')).toBeNull();

    // Khoá khác: chữ ký hợp lệ về hình thức nhưng không phải của ta.
    const khoaKhac = rsaKeys();
    const tokenNgoai = jwt.sign(
      { sub: 'admin', role: 'admin', typ: 'refresh' },
      khoaKhac.priv,
      { algorithm: 'RS256', expiresIn: '7d' },
    );
    expect(svc.refresh(tokenNgoai)).toBeNull();
  });

  it('refresh token hết hạn thì trả null, không phát token mới', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { refreshToken } = await svc.login('admin', 'admin');

    // Vượt mốc 7 ngày.
    await vi.advanceTimersByTimeAsync((ADMIN_REFRESH_TTL + 60) * 1000);

    expect(svc.refresh(refreshToken)).toBeNull();
  });

  it('quá mốc 30 phút thì access token cũ chết, NHƯNG refresh token vẫn cứu được phiên', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { token, refreshToken } = await svc.login('admin', 'admin');

    await vi.advanceTimersByTimeAsync((ADMIN_ACCESS_TTL + 60) * 1000);

    // Access token đã chết — đây chính là lúc admin bị đá nếu không có refresh.
    expect(() => svc.verifyJwt(token)).toThrow();
    expect(svc.refresh(refreshToken)).not.toBeNull();
  });

  it('mỗi lần refresh đều cấp lại refresh token mới với hạn đầy đủ 7 ngày', async () => {
    // Khác hẳn app chính, admin **không** lưu phiên ở DB nên không thể thu hồi
    // token đã phát. Đổi token mỗi lần refresh là biện pháp duy nhất — nên nó
    // phải thật, và phải nói ra chứ không giấu: token cũ vẫn sống tới hạn của nó.
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { refreshToken } = await svc.login('admin', 'admin');

    // Sang giây kế tiếp, nếu không hai lần ký cho ra **cùng một chuỗi** (cùng
    // payload, cùng `iat`) và test so sánh chuỗi sẽ xanh vì lý do sai.
    await vi.advanceTimersByTimeAsync(1000);
    const r = svc.refresh(refreshToken)!;

    expect(r.refreshToken).not.toBe(refreshToken);
    expect((svc.verifyJwt(r.refreshToken) as { typ: string }).typ).toBe('refresh');
    // Hạn được tính lại từ thời điểm refresh, không kế thừa hạn cũ.
    const claims = svc.verifyJwt(r.refreshToken) as { exp: number };
    expect(claims.exp).toBe(Math.floor(Date.now() / 1000) + ADMIN_REFRESH_TTL);

    // Token cũ vẫn xác minh được — không có store để thu hồi. Ghi rõ để không ai
    // sau này tưởng nó đã chết.
    expect(() => svc.verifyJwt(refreshToken)).not.toThrow();
  });
});

/** Request tối thiểu mà `AdminGuard.canActivate` đọc. Trả về chính `req` để test kiểm `req.admin`. */
function ctxOf(req: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as never;
}

function ctx(headers: Record<string, string>, cookies?: Record<string, string>) {
  return ctxOf({ headers, cookies });
}

describe('AdminGuard — không lấn token loại này cho loại kia', () => {
  it('access token thật thì qua và dựng `req.admin`', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { token } = await svc.login('admin', 'admin');
    const guard = new AdminGuard(svc);
    const req: Record<string, unknown> = { headers: {}, cookies: { admin_token: token } };

    expect(guard.canActivate(ctxOf(req))).toBe(true);
    // `AdminController.me` trả đúng `req.admin`, nên nó phải được gán.
    expect((req.admin as { role?: string }).role).toBe('admin');
  });

  /**
   * Ranh giới bảo mật của cả cơ chế. Cho refresh token đi qua `AdminGuard` thì
   * hạn 30 phút của access token trở nên vô nghĩa — vì token 7 ngày kia dùng
   * được y như access token trên mọi route.
   *
   * **Phải là token ký thật**, không phải chuỗi bất kỳ: token rác bị chặn ở
   * `verifyJwt`, nên test dùng chuỗi rác sẽ xanh dù guard **không** kiểm tra
   * `typ` — tức xanh vì lý do hoàn toàn khác với cái đang kiểm.
   */
  it('refresh token ký thật bị chặn ở mọi route có AdminGuard', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { refreshToken } = await svc.login('admin', 'admin');
    // Chứng minh chuỗi này **thật sự** xác minh được — nếu không thì test dưới
    // xanh vì lý do sai.
    expect((svc.verifyJwt(refreshToken) as { typ: string }).typ).toBe('refresh');
    const guard = new AdminGuard(svc);

    expect(() => guard.canActivate(ctx({}, { admin_token: refreshToken }))).toThrow(/không hợp lệ/i);
  });

  it('refresh token ký thật đi qua header Bearer cũng bị chặn', async () => {
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { refreshToken } = await svc.login('admin', 'admin');
    const guard = new AdminGuard(svc);

    expect(() => guard.canActivate(ctx({ authorization: `Bearer ${refreshToken}` }))).toThrow();
  });

  it('cookie admin_refresh không bị đọc nhầm thành access token', async () => {
    // BFF proxy gửi cookie `admin_token` thành header `Bearer`. Nếu guard đọc
    // nhầm `admin_refresh` thì refresh token lọt vào mọi route.
    const { priv, pub } = rsaKeys();
    const svc = makeSvc(priv, pub);
    const { refreshToken } = await svc.login('admin', 'admin');
    const guard = new AdminGuard(svc);

    expect(() => guard.canActivate(ctx({}, { admin_refresh: refreshToken }))).toThrow(/admin token/i);
  });
});