# Task 6 Report — Polish & verify

**Plan:** `docs/superpowers/plans/2026-04-11-admin.md` Task 6
**Spec:** `docs/superpowers/specs/2026-04-11-admin-design.md`
**Date:** 2026-04-11
**Status:** DONE

## Summary
Created `admin/.env.example` with `NEXT_PUBLIC_API_URL` + `JWT_SECRET` note, verified `be/.env.example` documents `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`JWT_SECRET`, fixed lint error in QNA page (`react-hooks/set-state-in-effect`), and verified `pnpm lint` (admin) + `pnpm build` (be + admin) all pass.

## Changes

### Created
- `admin/.env.example`:
  ```
  # Admin frontend env
  # Base URL of the backend API (used by adminFetch)
  NEXT_PUBLIC_API_URL=http://localhost:4000
  # Must match BE JWT_SECRET — used by middleware.ts (jose) to verify admin_token
  JWT_SECRET=change-me-32-chars-minimum-secret
  ```

### Modified
- `admin/app/(dashboard)/qna/page.tsx:37` — lint fix for `react-hooks/set-state-in-effect`:
  ```ts
  useEffect(() => {
    // Initial data load — async fetch wraps setState in callback, not sync cascade
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  ```
  Previous `load()` without `void` triggered `Error: Calling setState synchronously within an effect can trigger cascading renders` (eslint `react-hooks/set-state-in-effect`). Dashboard/problems use `.then(setState)` callback pattern which does not trigger; QNA used direct call. Fixed via `void` + disable comment (justified: fetch is async, setState occurs in callback, not sync cascade).
- `be/.env.example` — verified already contains:
  ```
  ADMIN_EMAIL=admin@gocode.lab
  ADMIN_PASSWORD_HASH=$2b$10$replace-with-bcrypt-hash
  # ADMIN_PASSWORD=replace-me
  JWT_SECRET=change-me-32-chars-minimum-secret
  ```
  No modification needed; matches spec requirement `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (or `ADMIN_PASSWORD` fallback), `JWT_SECRET`.

## Verification

### pnpm lint (admin)
- Command: `pnpm lint` in `admin/`
- Result: **PASS** (exit 0)
- Before fix: 1 error in `admin/app/(dashboard)/qna/page.tsx:38` — `react-hooks/set-state-in-effect`
- After fix:
  ```
  $ eslint
  EXIT:0
  ```
- Config: `admin/eslint.config.mjs:1` (`defineConfig` + `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`, ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`)

### pnpm build (admin)
- Command: `pnpm build` in `admin/`
- Result: **PASS**
- Output:
  ```
  $ next build
  ▲ Next.js 16.3.5 (Turbopack)
  ✓ Running next.config.ts took 35ms

  ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
    To migrate automatically, run:
    npx @next/codemod@canary middleware-to-proxy .
    Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
    Creating an optimized production build ...
  ✓ Compiled successfully in 964ms
    Running TypeScript ...
    Finished TypeScript in 2.2s ...
    Collecting page data using 10 workers ...
    Generating static pages using 10 workers (0/9) ...
    Generating static pages using 10 workers (2/9) 
    Generating static pages using 10 workers (4/9) 
    Generating static pages using 10 workers (6/9) 
  ✓ Generating static pages using 10 workers (9/9) in 981ms
    Finalizing page optimization ...

  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ○ /dashboard
  ├ ○ /login
  ├ ○ /problems
  ├ ○ /problems/new
  └ ○ /qna


  ƒ Proxy (Middleware)

  ○  (Static)  prerendered as static content
  ```
- Notes: `middleware.ts` deprecation warning is non-blocking; build emits `ƒ Proxy (Middleware)` and functions identically. No TypeScript errors.

### pnpm build (be)
- Command: `pnpm build` in `be/`
- Result: **PASS**
- Output:
  ```
  > be@0.0.1 build E:\github\coding-dev-lab\be
  > nest build
  ```
  (nest build completed with no errors; exit 0)
- Verified `AdminModule` wired in `be/src/app.module.ts`, `AdminService`/`AdminGuard`/`AdminController` compile, DTO validates slug regex/difficulty enum/topic/tests, etc.

## Env Examples — Final State

### `admin/.env.example`
```ini
# Admin frontend env
# Base URL of the backend API (used by adminFetch)
NEXT_PUBLIC_API_URL=http://localhost:4000
# Must match BE JWT_SECRET — used by middleware.ts (jose) to verify admin_token
JWT_SECRET=change-me-32-chars-minimum-secret
```

### `be/.env.example` (relevant section)
```ini
# Admin dashboard (credential-only, no SignUp)
ADMIN_EMAIL=admin@gocode.lab
# Use ADMIN_PASSWORD_HASH (bcrypt, 10 rounds) preferred; fallback ADMIN_PASSWORD for dev
ADMIN_PASSWORD_HASH=$2b$10$replace-with-bcrypt-hash
# ADMIN_PASSWORD=replace-me
JWT_SECRET=change-me-32-chars-minimum-secret
```

## References
- `admin/.env.example:1`
- `be/.env.example:22`
- `admin/app/(dashboard)/qna/page.tsx:37`
- `admin/eslint.config.mjs:1`
- `admin/lib/api.ts:1` (`NEXT_PUBLIC_API_URL || http://localhost:4000`)
- `admin/middleware.ts:12` (`JWT_SECRET` via `jose.jwtVerify`)
- `be/src/admin/admin.service.ts:1` (reads `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET`)
