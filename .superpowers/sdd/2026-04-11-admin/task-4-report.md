# Task 4 Report — FE admin deps + middleware + login

**Plan:** `docs/superpowers/plans/2026-04-11-admin.md` Task 4
**Spec:** `docs/superpowers/specs/2026-04-11-admin-design.md`
**Date:** 2026-04-11
**Status:** DONE

## Summary
Implemented admin frontend auth guard: `jose` dep, `lib/api.ts` helper, edge `middleware.ts` JWT verification, and credential-only login page with no SignUp. Verified `pnpm build` passes.

## Changes

### Modified
- `admin/package.json:12` — added `jose@^6.2.12`
- `admin/pnpm-workspace.yaml:2` — set `unrs-resolver: true` to unblock `pnpm build` (ignored-builds policy introduced in pnpm 10+; `unrs-resolver` is transitive via Next/Turbopack)
- `admin/app/layout.tsx` — no change required (already compatible; retains Geist fonts, global CSS, `LayoutProps<"/">`)

### Created
- `admin/lib/api.ts` — exports `API_URL = NEXT_PUBLIC_API_URL || http://localhost:4000` and `adminFetch(path, init)` wrapper with `credentials:"include"` and JSON header merge
- `admin/middleware.ts` — edge middleware:
  - `isLogin = pathname.startsWith("/login")` → `NextResponse.next()`
  - `token = req.cookies.get("admin_token")?.value`; if missing → `redirect /login`
  - `jose.jwtVerify(token, TextEncoder.encode(JWT_SECRET))` → on success `next()`, on fail or missing `JWT_SECRET` → `redirect /login`
  - `config.matcher = ["/((?!_next|favicon.ico|login).*)"]`
- `admin/app/(auth)/layout.tsx` — passthrough layout for auth group
- `admin/app/(auth)/login/page.tsx` — `"use client"`:
  - state: `email`, `password`, `error`, `loading`, `useRouter`
  - inputs: `type=email` + `type=password`, required, placeholders "Email"/"Mật khẩu"
  - centered card `min-h-screen flex items-center justify-center bg-zinc-950 p-6` with `max-w-sm rounded-2xl border bg-white p-6`
  - `handleSubmit` posts via `adminFetch("/api/admin/login", {method:"POST", body:JSON.stringify({email,password})})`, parses error `data?.message` fallback "Sai tài khoản hoặc mật khẩu", catch → "Lỗi kết nối...", finally `setLoading(false)`
  - on ok: `router.push("/dashboard"); router.refresh()`
  - button disabled when loading shows "Đang đăng nhập..." else "Đăng nhập"
  - error `<p className="text-sm text-red-600">`, no SignUp/Register link anywhere
  - file `admin/app/(auth)/login/page.tsx:1` verified no `SignUp`/`register`/`Đăng ký`

## Verification

### Build
- `pnpm add jose` in `admin/` — installed jose 6.2.12, updated lockfile
- `pnpm exec next build` — Compiled successfully in 12.2s, TypeScript passed, 3 static routes (`/`, `/_not-found`, `/login`) + Middleware (`ƒ Proxy (Middleware)`)
- `pnpm build` — PASS after fixing `pnpm-workspace.yaml` allowBuilds:
```
✓ Lockfile passes supply-chain policies
$ next build
▲ Next.js 16.3.5 (Turbopack)
✓ Compiled successfully in 884ms
Route (app)
┌ ○ /
├ ○ /_not-found
└ ○ /login
ƒ Proxy (Middleware)
○  (Static) prerendered as static content
```
- Note: Next 16.3 emits warning `The "middleware" file convention is deprecated. Please use "proxy" instead.` Build still succeeds and middleware executes as proxy; kept `middleware.ts` per plan/spec (codemod to `proxy.ts` is optional, behavior identical).

### Manual checks
- `grep -r "SignUp|signUp|register|Đăng ký" admin/app/(auth)/login` — no matches
- `admin/lib/api.ts` — `credentials:"include"` present
- `admin/middleware.ts` — imports `jose`, checks `admin_token`, allows `/login`, verifies with `JWT_SECRET`, matcher excludes `_next|favicon.ico|login`

## Deviations / Decisions
- Kept `admin/app/layout.tsx` unchanged — already satisfies Next 16 App Router requirements.
- Fixed `pnpm-workspace.yaml` to allow `unrs-resolver` build — required for `pnpm build` to pass under supply-chain policy; no behavioral impact.
- Login error handling surfaces `data?.message` from BE before fallback, matching spec generic 401 message.

## Next Steps
- Task 5: dashboard/problems/qna pages under `admin/app/(dashboard)/*` consuming `adminFetch` and guarded by middleware.

## References
- `admin/package.json:12`
- `admin/lib/api.ts:1`
- `admin/middleware.ts:1`
- `admin/app/(auth)/layout.tsx:1`
- `admin/app/(auth)/login/page.tsx:1`
- `admin/pnpm-workspace.yaml:1`
