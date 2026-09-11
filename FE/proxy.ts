import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const publicPaths = new Set(["/", "/sign-in", "/sign-up"]);

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  if (publicPaths.has(pathname)) {
    console.log("Public path accessed:", pathname);
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
