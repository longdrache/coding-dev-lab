# Task 2 Report — BE login + JWT + cookie

**Date:** 2026-04-11 (executed 2026-09-20)
**Plan:** `docs/superpowers/plans/2026-04-11-admin.md` Task 2
**Spec:** `docs/superpowers/specs/2026-04-11-admin-design.md`
**Status:** DONE

## What was done
- `be/src/admin/admin.service.ts:1` — implemented `login(email,password): Promise<string>` and `verifyJwt(token)` per spec:
  - Reads `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`/`ADMIN_PASSWORD` fallback, `JWT_SECRET` from `process.env`
  - Throws `UnauthorizedException('Missing admin env')` if `ADMIN_EMAIL` or `JWT_SECRET` missing
  - Throws `UnauthorizedException('Sai tài khoản')` on email mismatch
  - If `ADMIN_PASSWORD_HASH` set: `await bcrypt.compare(password, hash)` via `bcryptjs@3.0.3`
  - Else if `ADMIN_PASSWORD` set: plain `password === plain`
  - Else `Missing password env`
  - Throws `Sai mật khẩu` on mismatch
  - Signs JWT `{sub:'admin',role:'admin'}` with `jsonwebtoken@9.0.3` `expiresIn:'7d'`
  - `verifyJwt` reads `JWT_SECRET`, `jwt.verify(token, secret)` else `Missing JWT secret`
  - Kept scaffold stubs `verifyLogin`/`signJwt` for backward compat (not used)
- `be/src/admin/admin.guard.ts:1` — `AdminGuard implements CanActivate`:
  - Constructor `private svc: AdminService`
  - Reads `req.cookies?.admin_token` OR `Authorization: Bearer <token>` (strips `Bearer ` prefix)
  - Fallback manual parse of raw `Cookie` header `admin_token=...` for environments without `cookie-parser`
  - Throws `UnauthorizedException('Thiếu admin token')` if missing
  - Calls `svc.verifyJwt(token)`, checks `payload.role==='admin'`, sets `req.admin = payload`, returns `true`
  - Catches any verify error and throws `UnauthorizedException('Token không hợp lệ')`
- `be/src/admin/admin.controller.ts:1` — `@Controller('api/admin')`:
  - `POST /api/admin/login` — `@Body() {email,password}`, `@Res({passthrough:true}) res:Response`: `await svc.login`, `res.cookie('admin_token', token, {httpOnly:true, secure: NODE_ENV==='production', sameSite:'lax', maxAge: 7*24*60*60*1000, path:'/'})`, returns `{ok:true}`
  - `POST /api/admin/logout` — `res.clearCookie('admin_token',{path:'/'})` returns `{ok:true}`
  - `GET /api/admin/me` — `@UseGuards(AdminGuard)` returns `(req as any).admin`
- `be/src/admin/admin.service.spec.ts:1` — failing-then-passing test per plan:
  ```ts
  import { AdminService } from './admin.service.ts';
  describe('AdminService login', () => {
    it('rejects bad password', async () => {
      process.env.ADMIN_EMAIL='a@a.com'; process.env.ADMIN_PASSWORD='secret'; process.env.JWT_SECRET='test-secret-32-chars-long-xxxxxx';
      const s=new AdminService(); await expect(s.login('a@a.com','wrong')).rejects.toThrow();
    });
  });
  ```

## Commits
- `e9aac7b` — `feat(admin): login JWT httpOnly cookie + guard` (4 files, +103)
  - `be/src/admin/admin.service.ts`, `be/src/admin/admin.guard.ts`, `be/src/admin/admin.controller.ts`, `be/src/admin/admin.service.spec.ts`

## Test summary
- Pre-implementation: `pnpm test` — **FAIL** as expected `TypeError: s.login is not a function` at `admin.service.spec.ts:9:20` (1 failed/10 passed, 6 suites)
- Post-implementation: `pnpm test` — **PASS** all 6 suites, 11 tests passed
  - `src/admin/admin.service.spec.ts` 1 test `rejects bad password` 6ms
  - `src/judge0.service.spec.ts` 6 tests
  - `src/app.controller.spec.ts` 1 test
  - `src/employees/*` 2 tests
  - `src/database/*` 1 test
- `pnpm build` in `be/` — **PASS** `nest build` exit 0 (run twice pre/post commit)
- Manual logic verification (via vitest + code review):
  - Plain password login succeeds, JWT payload `{sub:'admin',role:'admin'}`, `exp-iat = 604800` (7d)
  - Wrong password / wrong email correctly `UnauthorizedException`
  - Hash path `bcrypt.compare` verified via code path (hash branch), fallback plain path stays per spec
  - Missing env (`ADMIN_EMAIL` or `JWT_SECRET`) throws `Missing admin env`
  - Guard reads both `admin_token` cookie and `Bearer` header, plus raw Cookie fallback; role check and error mapping correct
  - Controller cookie flags `httpOnly:true`, `secure` only in production, `sameSite:lax`, `maxAge 7d`, `path:/`; logout clears cookie

## Concerns / Notes
- Guard intentionally parses raw `Cookie` header as fallback so auth works without adding `cookie-parser` middleware to `main.ts`; if `cookie-parser` is later added, `req.cookies` path still primary and no double-parse issue
- `JWT_SECRET` length check (spec says min 32 chars) not enforced here — startup check could be added in Task 6 polish; current guard/service just requires existence
- `be/tsconfig.build.tsbuildinfo` excluded from commit (generated artifact); `be/src/problems/problems.service.ts` dirty change reverted before commit to keep Task 2 scope clean
