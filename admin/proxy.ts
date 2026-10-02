import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";

function getPublicKeyPem(): string | null {
  const raw =
    process.env.ADMIN_JWT_PUBLIC_KEY ?? process.env.ADMIN_PUBLIC_KEY;
  if (!raw) return null;
  return raw.replace(/^"|"$/g, "").replace(/\\+n/g, "\n").replace(/\\\r?\n/g, "\n").trim();
}

/**
 * Đường dẫn màn đăng nhập admin. Phải khớp `app/(auth)/sign-in/page.tsx` — lúc
 * trang này còn tên `login/page.tsx` thì đường dẫn là `/login`. Đổi tên trang mà
 * quên sửa ở đây làm mọi request bị đẩy tới một trang không tồn tại => 404 (kể
 * cả chính `/sign-in`), vì `/sign-in` cũng bị matcher bắt và đá về `/login`.
 * `proxy-redirect-targets.test.mjs` canh đúng lệch này.
 *
 * `matcher` ở dưới buộc phải là chuỗi tĩnh để Next phân tích lúc build, nên nó
 * không lấy từ hằng số này được — hai chỗ phải sửa cùng nhau.
 */
const LOGIN_PATH = "/sign-in";

/**
 * Đọc `exp` mà **không** xác minh chữ ký.
 *
 * Cần vì phần dưới đã xác minh rồi; ở đây chỉ cần biết "token này còn hạn hay
 * không" để quyết định có đá người dùng không. Không xác minh ở đây là an toàn
 * vì giá trị trả về chỉ dùng để **cho qua**, còn mọi route thật vẫn bị
 * `AdminGuard` ở BE chặn.
 */
function expiryOf(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Cookie làm mới còn hạn không? Đây là thứ quyết định admin có bị đá giữa chừng
 * khi F5 không.
 *
 * Trước đây proxy chỉ nhìn `admin_token`. Sau 30 phút token đó chết, nên **mọi**
 * lần F5 — kể cả khi phiên 7 ngày còn nguyên — đều bị đẩy về `/sign-in`, và
 * không có client JS nào kịp chạy để làm mới. Phiên dài hạn trở nên vô dụng.
 *
 * Cố ý **không** kiểm tra `typ`: `refresh` lẫn `access` đều là hợp lệ ở đây —
 * điều cần biết chỉ là *phiên còn hay không*, và route thật sẽ tự phân biệt.
 */
function hasLiveSessionCookie(req: NextRequest): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const name of ["admin_token", "admin_refresh"]) {
    const value = req.cookies.get(name)?.value;
    if (!value) continue;
    const exp = expiryOf(value);
    if (exp === null || exp > now) return true;
  }
  return false;
}

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/" || path.startsWith(LOGIN_PATH)) {
    return NextResponse.next();
  }
  const token = req.cookies.get("admin_token")?.value;
  if (!token) {
    // Chưa có access token nhưng còn refresh token thì phiên **vẫn sống**: cho
    // qua để client làm mới. Đẩy thẳng ra `/sign-in` ở đây là chặn người dùng
    // giữa chừng mỗi 30 phút — đúng lỗi đang sửa.
    return hasLiveSessionCookie(req)
      ? NextResponse.next()
      : NextResponse.redirect(new URL(LOGIN_PATH, req.url));
  }
  try {
    const pem = getPublicKeyPem();
    if (!pem) {
      return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
    }
    const key = await jose.importSPKI(pem, "RS256");
    await jose.jwtVerify(token, key);
    return NextResponse.next();
  } catch {
    // Fallback HS256 chỉ cho dev — production bắt buộc RS256
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
    }
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("no fallback secret");
      await jose.jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
    }
  }
}

export const config = {
  // /api/* đi qua BFF proxy — sign-in chưa có cookie nên phải loại trừ,
  // các route API tự guard bằng JWT phía BE. Giữ khớp `LOGIN_PATH` ở trên.
  matcher: ["/((?!_next|favicon.ico|sign-in|api).*)"],
};
