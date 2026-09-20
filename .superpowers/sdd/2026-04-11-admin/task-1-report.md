# Task 1 Report — BE deps & AdminModule scaffold

**Date:** 2026-04-11 (executed 2026-09-20)
**Plan:** `docs/superpowers/plans/2026-04-11-admin.md` Task 1
**Spec:** `docs/superpowers/specs/2026-04-11-admin-design.md`
**Status:** DONE

## What was done
- Added BE deps in `be/` via pnpm:
  - `jsonwebtoken@9.0.3`, `bcryptjs@3.0.3`, `jose@6.2.12`
  - devDeps `@types/jsonwebtoken@9.0.10`, `@types/bcryptjs@3.0.0` (stub, `bcryptjs` provides own types but added per plan)
  - Updated `be/package.json:27-31` and `be/pnpm-lock.yaml`
- Created stub admin module:
  - `be/src/admin/admin.service.ts:1` — `Injectable` with stubs `verifyLogin(e,p)=>false`, `signJwt()=>''`, `verifyJwt(t)=>null` exactly per plan
  - `be/src/admin/admin.guard.ts:1` — `CanActivate` returning `true` exactly per plan
  - `be/src/admin/admin.controller.ts:1` — `@Controller('api/admin')` empty class per plan
  - `be/src/admin/admin.module.ts:1` — provides `AdminService, AdminGuard`, controllers `AdminController`, exports both
  - `be/src/admin/dto/create-problem.dto.ts:1` — `CreateProblemDto` with fields slug/title/description/difficulty/topic/tests/hiddenTests/starterCodes/timeLimit/memoryLimit per plan
- Wired `AppModule`:
  - `be/src/app.module.ts:18` added `import { AdminModule } from './admin/admin.module.ts'`
  - `be/src/app.module.ts:22` inserted `AdminModule` into imports array before other modules
- Updated env example:
  - `be/.env.example:22-27` added `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, commented `ADMIN_PASSWORD` fallback, `JWT_SECRET` with exact env names required by global constraints
- No SignUp code introduced; credential-only auth preserved

## Commits
- `cfae9dc` — `feat(admin): scaffold AdminModule with deps` (9 files, +193)
  - `be/package.json`, `be/pnpm-lock.yaml`, `be/.env.example`, `be/src/app.module.ts`, `be/src/admin/*`

## Test summary
- Verification: `pnpm build` in `be/` — **PASS** (nest build, exit 0, run twice: pre-commit and post-commit)
- No unit tests required for Task 1 (stub only); `pnpm test` not run for this task (spec defers to Task 2)
- Manual checks:
  - `Test-Path be/src/admin` true, 5 files created
  - `Import AdminModule` resolves; no TS errors with `rewriteRelativeImportExtensions:true`

## Concerns / Notes
- `@types/bcryptjs@3.0.0` is deprecated stub warning (`pnpm` warned deprecated); `bcryptjs` ships own types. Kept per plan verbatim but could be removed in cleanup.
- Pre-existing dirty files not committed: `be/src/problems/problems.service.ts` and `be/tsconfig.build.tsbuildinfo` were modified before Task 1 and intentionally excluded from commit.
- `AdminModule` currently stub-only; `verifyLogin/signJwt/verifyJwt` will be implemented in Task 2 with real `bcryptjs`+`jsonwebtoken` logic and env checks for `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` fallback `ADMIN_PASSWORD`/`JWT_SECRET`.
- Import style uses `*.ts` extensions matching existing `app.module.ts` pattern and `nodenext` rewrite; Task 2 should keep same.
