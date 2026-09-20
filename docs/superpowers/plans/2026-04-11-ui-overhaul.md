# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all FE + admin pages vivid and consistent using shadcn base-nova + Linear/Vercel/Stripe/Notion inspirations, fixing all faded (mờ) parts efficiently.

**Architecture:** Unified design tokens (neutral, zinc-950, amber, violet), shared Card/Table/Input components, layout max-w 1480/6xl, hero gradients, mono micro-copy.

**Tech Stack:** Next 16.3.5, shadcn base-nova neutral, Tailwind 4, lucide, Geist

**Spec:** `docs/superpowers/specs/2026-04-11-ui-overhaul-design.md`

## Global Constraints

- Use shadcn components where possible (Card, Table, Input, Badge, Button) — already installed in FE and admin
- Keep existing functionality, only visual contrast changes (border-zinc-200→300, text-zinc-500→600/700 font-medium, placeholder:text-zinc-500)
- No new dependencies beyond shadcn
- Each task must keep `pnpm build` PASS

---

### Task 1: FE homepage hero + StatsStrip

**Files:**
- Modify: `FE/app/page.tsx`
- Modify: `FE/app/ui/StatsStrip.tsx`
- Modify: `FE/app/ui/TopicCard.tsx` (if needed)

**Interfaces:**
- Consumes: existing Reveal, FeatureCard, Logo
- Produces: vivid homepage

- [ ] **Step 1: Update homepage hero contrast**

In `FE/app/page.tsx` change eyebrow `bg-zinc-100/90 border-zinc-200/80 text-zinc-600` → `bg-white border-zinc-300 text-zinc-700 font-medium shadow-sm`, h1 keep `text-zinc-950`, p `text-zinc-600 → text-zinc-700`, buttons keep solid, mono footer `text-zinc-500 → text-zinc-600 font-medium`.

- [ ] **Step 2: Update StatsStrip**

In `FE/app/ui/StatsStrip.tsx` change wrapper `border-zinc-200/80 bg-white shadow-[0_1px_2px]` → `border-zinc-300 bg-white shadow-sm`, stat value `text-zinc-950` keep, label `text-zinc-500 → text-zinc-600 font-medium`.

- [ ] **Step 3: Verify**

Run: `pnpm build` in `FE` Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add FE/app/page.tsx FE/app/ui/StatsStrip.tsx
git commit -m "style(fe): vivid homepage + stats"
```

### Task 2: FE premium Pricing

**Files:**
- Modify: `FE/app/premium/page.tsx` (trust banner)
- Modify: `FE/app/ui/Pricing.tsx` (cards)

**Interfaces:**
- Consumes: pricingPlans
- Produces: vivid pricing

- [ ] **Step 1: Trust banner contrast**

In `Pricing.tsx` trust banner `border-neutral-800 bg-neutral-900/40 text-neutral-400` → `border-neutral-700 bg-neutral-900/60 text-neutral-300`, p-4 keep.

- [ ] **Step 2: Header premium page**

In `premium/page.tsx` ensure subtitle `text-neutral-400 → text-neutral-300 font-medium`.

- [ ] **Step 3: Verify**

Run: `pnpm build` in `FE` Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add FE/app/premium/page.tsx FE/app/ui/Pricing.tsx
git commit -m "style(fe): vivid premium"
```

### Task 3: FE problem list + qna

**Files:**
- Modify: `FE/app/problem/page.tsx`
- Modify: `FE/app/qna/page.tsx`

**Interfaces:**
- Consumes: problems, topics, EXTENDED_FAQS
- Produces: vivid lists

- [ ] **Step 1: Problem list**

Change header `border-zinc-200/80 → border-zinc-300`, search input `border-zinc-300 focus:border-zinc-900`, pills `border-zinc-300 text-zinc-700` keep, card `border-zinc-200/80 → border-zinc-300 shadow-sm`.

- [ ] **Step 2: QNA editorial**

Change HelpCircle badge `border-zinc-200/80 text-zinc-600 → border-zinc-300 bg-white text-zinc-700 font-medium shadow-sm`, h1 keep, p `text-zinc-600 → text-zinc-700`, search `border-zinc-200 → border-zinc-300`, accordion `border-zinc-200 → border-zinc-300`.

- [ ] **Step 3: Verify**

Run: `pnpm build` in `FE` Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add FE/app/problem/page.tsx FE/app/qna/page.tsx
git commit -m "style(fe): vivid problem + qna"
```

### Task 4: FE problem detail tabs

**Files:**
- Modify: `FE/app/problem/[slug]/page.tsx` (test tabs)

**Interfaces:**
- Consumes: LANGUAGES, tests

- [ ] **Step 1: Test tabs contrast**

Find pill tabs for tests: `bg-zinc-900 text-white` active keep, inactive `border-zinc-300 bg-white text-zinc-700 font-medium` (was faint).

- [ ] **Step 2: Verify**

Run: `pnpm build` in `FE` Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add FE/app/problem/[slug]/page.tsx
git commit -m "style(fe): vivid problem detail tabs"
```

### Task 5: Final verification

**Files:**
- Check: `FE/app/globals.css`, `admin/app/globals.css` already have cssVariables

- [ ] **Step 1: Run builds**

Run: `pnpm build` in `FE` and `admin` Expected: PASS

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "chore(ui): final vivid polish"
```
