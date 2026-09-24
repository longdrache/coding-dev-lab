import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const publicExact = new Set(["/", "/sign-in", "/sign-up"]);
// Các trang công khai hiện tại (giữ nguyên hành vi cũ — trang nào cần
// login đã tự redirect trong component). Route mới mặc định yêu cầu login.
const publicPrefixes = [
  "/premium",
  "/vip",
  "/qna",
  "/roadmap",
  "/problem",
  "/challenges",
];

function isPublic(pathname: string): boolean {
  if (publicExact.has(pathname)) return true;
  return publicPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (userId) return NextResponse.next();

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirect_url", request.url);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
