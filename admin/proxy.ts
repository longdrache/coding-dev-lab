import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";

function getPublicKeyPem(): string | null {
  const raw =
    process.env.ADMIN_JWT_PUBLIC_KEY ?? process.env.ADMIN_PUBLIC_KEY;
  if (!raw) return null;
  return raw.replace(/^"|"$/g, "").replace(/\\+n/g, "\n").replace(/\\\r?\n/g, "\n").trim();
}

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/" || path.startsWith("/login")) {
    return NextResponse.next();
  }
  const token = req.cookies.get("admin_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    const pem = getPublicKeyPem();
    if (!pem) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const key = await jose.importSPKI(pem, "RS256");
    await jose.jwtVerify(token, key);
    return NextResponse.next();
  } catch {
    // Fallback HS256 chỉ cho dev — production bắt buộc RS256
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
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
  // /api/* đi qua BFF proxy — login chưa có cookie nên phải loại trừ,
  // các route API tự guard bằng JWT phía BE
  matcher: ["/((?!_next|favicon.ico|login|api).*)"],
};
