import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";

function getPublicKeyPem(): string | null {
  const raw =
    process.env.ADMIN_JWT_PUBLIC_KEY ?? process.env.ADMIN_PUBLIC_KEY;
  if (!raw) return null;
  // PEM trong env có thể ở 3 dạng: newline thật, "\n" hoặc "\\n" — chuẩn hóa tất cả
  return raw
    .replace(/^"|"$/g, "")
    .replace(/\\+n/g, "\n")
    .replace(/\\\r?\n/g, "\n")
    .trim();
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Cho phép truy cập tự do các route public: / , /login , _next, favicon, api health
  if (path === "/" || path.startsWith("/login")) {
    return NextResponse.next();
  }
  const token = req.cookies.get("admin_token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Verify RS256 bằng PUBLIC key — FE không bao giờ giữ private/secret.
  try {
    const pem = getPublicKeyPem();
    if (!pem) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const key = await jose.importSPKI(pem, "RS256");
    await jose.jwtVerify(token, key);
    return NextResponse.next();
  } catch {
    // Fallback: cookie HS256 cũ (giai đoạn chuyển đổi) nếu còn JWT_SECRET
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("no fallback secret");
      await jose.jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|login).*)"],
};
