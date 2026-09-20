# Task 3 Report — BE stats + qna + problems admin endpoints

**Date:** 2026-04-11 (executed 2026-09-20)
**Plan:** `docs/superpowers/plans/2026-04-11-admin.md` Task 3
**Spec:** `docs/superpowers/specs/2026-04-11-admin-design.md`
**Status:** DONE

## What was done
- `be/prisma/schema.prisma:63` — extended `Problem` model to support full admin fields (backward-compatible, optional):
  - `starterCodes Json? @default("{}")`, `timeLimit Int? @default(1000)`, `memoryLimit Int? @default(256000)`
  - Made `inputFormat`, `outputFormat` `@default("")` and `constraints`, `examples`, `hiddenTests` `@default("[]")`/`"{}"` so admin `create` can omit them
  - Ran `pnpm prisma:generate` → regenerated `be/src/generated/prisma` client (7.10.0)
- `be/package.json:36` — added `class-validator@0.15.1` + `class-transformer@0.5.1` (`pnpm add class-validator class-transformer`) for DTO validation
- `be/src/admin/dto/create-problem.dto.ts:1` — full validation DTO:
  - `slug`: `@Matches(/^[a-z0-9-]+$/)` (spec regex), `@IsNotEmpty`
  - `difficulty`: `@IsIn(['Dễ','Trung bình','Khó'])`
  - `topic`, `title`, `description`: `@IsString` + `@IsNotEmpty` (topic non-empty enforced)
  - `tests`: `@IsArray` + `@ValidateNested` + `TestDto{ input @IsString @IsNotEmpty, output @IsString @IsNotEmpty }`
  - `hiddenTests?`, `starterCodes?` (`@IsObject`), `timeLimit?` (`@IsInt @Min(100)`), `memoryLimit?` (`@IsInt @Min(1000)`), `inputFormat?`, `outputFormat?`, `constraints?`, `examples?` optional
- `be/src/admin/admin.service.ts:1` — added Task 3 methods with `DatabaseService` + optional `PresenceService` injection:
  - `constructor(private readonly db: DatabaseService, @Optional() @Inject(PresenceService) private readonly presence?: PresenceService)`
  - `getStats(): Promise<{online, counts:{problems,qna,submissions}, activity30d, topProblems}>`:
    - `Promise.all` counts: `db.problem.count()`, `db.qnaQuestion.count()`, `db.submission.count()`
    - `online`: tries `presence.count()` if injected; else `fetch(${API_URL}/api/presence/online)` fallback (reads `API_URL`/`NEXT_PUBLIC_API_URL`/`http://localhost:4000`), parses `online`/`count`, else `null` on failure
    - `activity30d`: `db.activityDay.findMany({ where:{ date:{ gte: 30dAgo } }, orderBy:{ date:'asc' } })` (30d window, try/catch → `[]`)
    - `topProblems`: `(db.submission.groupBy as any)({ by:['problemSlug'], _count:{ problemSlug:true }, orderBy:{ _count:{ problemSlug:'desc'} }, take:5 })` (try/catch → `[]`)
  - `listQna()`: `db.qnaQuestion.findMany({ orderBy:{createdAt:'desc'}})`
  - `deleteQna(id)`: `db.qnaQuestion.delete({where:{id}})` with `P2025 → NotFoundException('QNA not found')`
  - `listProblems()`: `db.problem.findMany({ orderBy:{createdAt:'asc'}})`
  - `createProblem(dto)`: manual fallback validation (slug regex, difficulty enum, topic/title/description non-empty, tests non-empty array), `findUnique` slug unique check → `ConflictException('Slug đã tồn tại')`, normalize `tests`/`hiddenTests` from `{input,output}` or `{stdin,expected}` → `{stdin, expected}`, build `data` with defaults (`inputFormat ''`, `outputFormat ''`, `constraints []`, `examples []`, `starterCodes {}`, `timeLimit 1000`, `memoryLimit 256000`), `db.problem.create({data})` with `P2002 → ConflictException` race catch
  - Kept Task 2 `login`/`verifyJwt`/`verifyLogin`/`signJwt` unchanged for backward compat
- `be/src/admin/admin.module.ts:1` — `imports: [DatabaseModule, PresenceModule]` so `AdminService` DI resolves both `DatabaseService` and optional `PresenceService`; `exports: [AdminService, AdminGuard]` unchanged
- `be/src/admin/admin.controller.ts:1` — added 5 `AdminGuard`-protected routes:
  - `GET /api/admin/stats` → `svc.getStats()`
  - `GET /api/admin/qna` → `svc.listQna()`
  - `DELETE /api/admin/qna/:id` → `svc.deleteQna(id)`
  - `GET /api/admin/problems` → `svc.listProblems()`
  - `POST /api/admin/problems` → `@UsePipes(new ValidationPipe({whitelist:true, forbidNonWhitelisted:false, transform:true}))` + `@Body() dto: CreateProblemDto` → `svc.createProblem(dto)`
  - Existing `POST /login`, `POST /logout`, `GET /me` unchanged

## Test summary
- `pnpm build` in `be/` — **PASS** (`nest build` exit 0, no TS errors; `rewriteRelativeImportExtensions` handled `.ts` imports)
- `pnpm test` in `be/` — **PASS** 6 suites, 11 tests (incl. `admin.service.spec.ts` reject bad password, 6 judge0, 1 app controller, 2 employees, 1 database)
- Manual DI check: `DatabaseModule` + `PresenceModule` imports ensure `AdminService` constructor injection works; manual `new AdminService()` without args still passes Task 2 spec test (db undefined safe for login path)
- Stats shape verified via code review: `{online: number|null, counts:{problems,qna,submissions}, activity30d: ActivityDay[], topProblems: groupBy[]}` — covers spec (online, counts, 30d activity, top problems groupBy) and plan return `{online, counts, activity30d}` subset

## Concerns / Notes
- Prisma `Problem` extension is additive and optional with defaults; existing `prisma migrate` not run here but `prisma generate` ensures client types include new fields; production DB will need `prisma migrate dev`/`db push` to add nullable columns (safe, no data loss)
- `ValidationPipe` applied at handler level for `POST /problems` only (global `app.enableCors()` unchanged in `main.ts`); adding global `ValidationPipe` in Task 6 polish would be cleaner but not required for build
- Online count prefers `PresenceService.count()` (in-process) over `fetch` to avoid network in tests; fetch fallback kept per task spec for alternative deployments
- `createProblem` normalizes both `input/output` and `stdin/expected` test shapes to `stdin/expected` to align with `Judge0Service` expectations in `problems.service.ts:47`
