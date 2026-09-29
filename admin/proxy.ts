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

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/" || path.startsWith(LOGIN_PATH)) {
    return NextResponse.next();
  }
  const token = req.cookies.get("admin_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
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
