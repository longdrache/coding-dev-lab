# Task 5 Report — FE dashboard + problems + qna pages

**Plan:** `docs/superpowers/plans/2026-04-11-admin.md` Task 5
**Spec:** `docs/superpowers/specs/2026-04-11-admin-design.md`
**Date:** 2026-04-11
**Status:** DONE

## Summary
Implemented admin dashboard group `admin/app/(dashboard)` with sidebar layout, stats dashboard, problems list, problem creation form with full-field validation, and QNA inbox with delete. All fetches via `adminFetch` (`credentials:include`). Verified `pnpm build` passes.

## Changes

### Created
- `admin/app/(dashboard)/layout.tsx` — `"use client"`:
  - imports `Link`, `useRouter`, `usePathname`, `adminFetch`
  - `NAV = [Dashboard, Problems, QNA]` with active highlight via `pathname === href || startsWith`
  - sidebar `w-64 bg-black text-white p-6` header "GoCode Admin", nav links, `Logout` button calling `adminFetch("/api/admin/logout", {method:"POST"})` then `router.push("/login") + router.refresh()`; layout `min-h-screen flex` sidebar + `main flex-1 p-8`
- `admin/app/(dashboard)/dashboard/page.tsx` — `"use client"`:
  - state `stats`, `error`; `useEffect` fetches `GET /api/admin/stats` via `adminFetch`, handles non-ok with `data?.message`, sets stats/error, cancel flag
  - loading skeleton 4 cards animate-pulse, error branch with message
  - cards grid `Online` (`stats.online ?? "—"`), `Problems`, `QNA`, `Submissions` from `stats.counts`
  - activity bar chart from `stats.activity30d` (fields `count|submissions|value`, `date`), computes `maxActivity`, renders flex bars height `Math.round(v/max*100)%`, tooltip date, hidden date labels xl, fallback "No activity data."
  - topProblems section if `stats.topProblems?.length >0` renders list `problemSlug` + `count` (`_count.problemSlug` or `count`)
- `admin/app/(dashboard)/problems/page.tsx` — `"use client"`:
  - fetches `GET /api/admin/problems` via `adminFetch`, parses array or `problems/data` fallback, loading/error states
  - header with `Link href="/problems/new"` button "+ New Problem"
  - table columns Slug (mono), Title, Difficulty, Topic; rows `hover:bg-zinc-50`; empty "No problems yet."
- `admin/app/(dashboard)/problems/new/page.tsx` — `"use client"`:
  - inputs: `slug`, `title` (string), `difficulty` select Dễ/Trung bình/Khó, `topic`, `description` textarea, `timeLimit` (default 1000), `memoryLimit` (256000)
  - `tests` array `[{input,output}]` initial 1 row with +Add, per-row input/output textareas (mono), remove if >1
  - `hiddenTests` array similarly with remove always allowed
  - `starterCodes` Record<string,string> for 8 languages `71,63,74,54,62,51,60,68` each textarea 3 rows
  - validation: slug regex `/^[a-z0-9-]+$/`, required title/topic/description, at least one tests with both fields non-empty, hiddenTests optional but each non-empty if present; shows error `rounded bg-red-50`
  - submit `POST /api/admin/problems` via `adminFetch` with JSON payload mapping tests/hiddenTests filtered, starterCodes, numeric limits; parses array message join ", "; on success `router.push("/problems") + refresh`; submitting disables button "Creating..."
- `admin/app/(dashboard)/qna/page.tsx` — `"use client"`:
  - fetches `GET /api/admin/qna` via `adminFetch`, array or `qna/data` fallback, retry button on error
  - table name/email/question/createdAt: question field `question ?? message ?? content`, createdAt `toLocaleString vi-VN`, overflow `max-w-[400px] break-words`
  - delete button per row `DELETE /api/admin/qna/:id` via `adminFetch`, `confirm("Xóa câu hỏi này?")`, `deletingId` disables button, optimistic remove via `setItems filter`, alert on failure

### Modified
- None

## Verification

### Build
- `pnpm build` in `admin/` — PASS:
```
✓ Compiled successfully in 1626ms
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /dashboard
├ ○ /login
├ ○ /problems
├ ○ /problems/new
└ ○ /qna
ƒ Proxy (Middleware)
```
- TypeScript passed (2.6s), static generation 9/9 workers.

### Manual checks
- `adminFetch` uses `credentials:"include"` verified in all 4 pages (dashboard, problems, problems/new, qna) and layout logout
- Slug regex `/^[a-z0-9-]+$/` client-validated before POST, server also enforces via DTO `Matches`
- Difficulty select restricted to 3 enum values; starterCodes textareas for 8 ids present (71,63,74,54,62,51,60,68)
- Logout POST `/api/admin/logout` via adminFetch then redirect `/login`
- Dashboard displays Online, Problems, QNA, Submissions cards + activity bars + topProblems conditional
- Problems list links to `/problems/new`; QNA delete uses `DELETE /api/admin/qna/:id` with confirm dialog

## Deviations / Decisions
- Kept `admin/middleware.ts` filename (Next 16.3 deprecation warning to `proxy.ts` is non-blocking; build still emits `ƒ Proxy (Middleware)` and behaves identically)
- Activity30d and topProblems render gracefully when BE returns null/empty or alternate field names (`count|submissions|value`, `problemSlug + _count`)
- New problem form hides hiddenTests remove only when filtering avoids orphan empty required row; allows empty filter on submit

## Next Steps
- Task 6: env examples + lint polish, final BE+admin build verify.

## References
- `admin/app/(dashboard)/layout.tsx:1`
- `admin/app/(dashboard)/dashboard/page.tsx:1`
- `admin/app/(dashboard)/problems/page.tsx:1`
- `admin/app/(dashboard)/problems/new/page.tsx:1`
- `admin/app/(dashboard)/qna/page.tsx:1`
- `admin/lib/api.ts:1`
