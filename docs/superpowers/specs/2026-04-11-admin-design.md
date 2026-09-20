# Admin Dashboard Design — GoCode (folder `admin/`)

**Date:** 2026-04-11
**Status:** Approved (PA1)
**Scope:** Standalone admin app in `admin/` (Next 16) + BE `be/src/admin` module. Features: login (no register), add problem (full fields), view/delete QNA, stats (online, counts, activity 30d, top problems).

## 1. Architecture

- **BE `be/src/admin`**: `AdminModule` (Global `ConfigModule`). `AdminService` handles `login` (bcrypt compare `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` fallback `ADMIN_PASSWORD`, sign JWT `JWT_SECRET` 7d), `verifyJwt`, `getStats`, `createProblem`, `listQna`, `deleteQna`. `AdminGuard` reads `admin_token` cookie (httpOnly) or `Authorization: Bearer`, verifies with `jsonwebtoken`. Routes `/api/admin/*` use `AdminGuard` only (not Clerk). Endpoints: `POST /login`, `POST /logout`, `GET /stats`, `GET /qna`, `DELETE /qna/:id`, `GET /problems`, `POST /problems`.
- **FE `admin/`**: Next App Router. `middleware.ts` (edge) verifies JWT via `jose` on `JWT_SECRET`; `/login` public, others redirect to `/login`. `app/(auth)/login/page.tsx` form (no SignUp) posts to BE, sets cookie via BE `Set-Cookie`. `app/(dashboard)/layout.tsx` sidebar + header. Pages: `dashboard`, `problems`, `problems/new`, `qna`. `lib/api.ts` helper `adminFetch` with `credentials: 'include'` and `NEXT_PUBLIC_API_URL`.
- **Env**: BE `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`|`ADMIN_PASSWORD`, `JWT_SECRET`, `FRONTEND_ADMIN_URL`; FE `admin/.env.local` `NEXT_PUBLIC_API_URL`.

## 2. Components & Files

**BE:**
- `be/src/admin/admin.module.ts`
- `be/src/admin/admin.service.ts`
- `be/src/admin/admin.guard.ts`
- `be/src/admin/admin.controller.ts`
- `be/src/admin/dto/create-problem.dto.ts` (zod/class-validator: slug regex, difficulty enum, topic enum, description, tests/hiddenTests array {input,output}, starterCodes Record<languageId,string>, timeLimit, memoryLimit)
- `be/src/app.module.ts` add `AdminModule`
- `be/package.json` add `jsonwebtoken`, `bcryptjs`, `jose` (peer)

**FE `admin/`:**
- `middleware.ts`
- `app/(auth)/login/page.tsx`
- `app/(dashboard)/layout.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `app/(dashboard)/problems/page.tsx`
- `app/(dashboard)/problems/new/page.tsx`
- `app/(dashboard)/qna/page.tsx`
- `lib/api.ts`
- `app/globals.css` (keep)

No changes to `FE/` main app or `be/src/qna`/`problems` logic except admin wrapper.

## 3. Data Flow

- **Login**: FE form → `POST /api/admin/login` → BE bcrypt → sign JWT → `Set-Cookie: admin_token` httpOnly → FE redirect `/dashboard`. Subsequent `adminFetch` sends cookie → `AdminGuard` verifies → `req.admin`.
- **Stats**: `dashboard` `GET /api/admin/stats` → BE `Promise.all` counts (prisma problem/qna/submission), presence online, activity 30d, topProblems `groupBy`. FE skeletons → cards + CSS bar chart, poll online 10s.
- **Create Problem**: FE form validate → `POST /api/admin/problems` → BE check slug unique → `prisma.problem.create` → 201 → FE toast + redirect.
- **QNA**: `GET /api/admin/qna` → table → `DELETE /api/admin/qna/:id` → optimistic remove.
- **Logout**: `POST /api/admin/logout` clears cookie → redirect `/login`.

## 4. Error Handling & Security

- **Auth**: 401 on missing/invalid JWT, 403 on wrong role. Login 401 on bad creds (generic message to avoid enumeration). Cookie `httpOnly, Secure (prod), SameSite=Lax, 7d`. `AdminGuard` logs failed verifies without leaking details. No register route.
- **Validation**: DTO 400 on invalid slug/difficulty/topic/tests. 409 on slug duplicate. 404 on qna delete missing. All errors return `{message}` FE shows toast.
- **Security**: `ADMIN_PASSWORD_HASH` bcrypt (10 rounds) preferred over plain. `JWT_SECRET` min 32 chars check on startup. CORS `credentials:true` limited to `FRONTEND_ADMIN_URL`. No Clerk dependency in admin routes.
- **Edge cases**: BE offline → FE shows retry. Stats partial failure → return available counts + `warnings`. Problem create race → unique constraint catch.

## 5. Testing

- **BE**: `admin.service.spec.ts` (login success/fail, JWT verify, createProblem validation, stats counts with mocked Prisma), `admin.controller.spec.ts` (guard integration, 401/409 paths). `vitest`.
- **FE**: `admin/app/(auth)/login` renders no SignUp link, submits and handles 401. `dashboard` shows skeletons then cards. `problems/new` validates slug regex client. Manual: login → dashboard → create problem → verify in FE `/problem` list; QNA delete.
- **E2E**: `pnpm build` BE + `admin` FE pass, `pnpm lint` pass. Smoke: `curl POST /api/admin/login` + `GET /api/admin/stats` with cookie.

## 6. Open Decisions

- StarterCodes: will use languageIds 71,63,74,54,62,51,60,68 matching FE `LANGUAGES`.
- Activity chart: simple div bars, no extra chart lib.
- No email reply for QNA (per A).

## 7. Implementation Order

1. BE `AdminModule` + env + deps
2. FE `admin` middleware + login
3. Dashboard stats
4. Problems list + new
5. QNA list + delete
6. Polish + build verify
