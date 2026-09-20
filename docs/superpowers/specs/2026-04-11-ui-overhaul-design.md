# UI Overhaul Design — GoCode FE + Admin (Linear/Vercel/Stripe/Notion/Raycast/Framer)

Date: 2026-04-11
Status: Approved PA1 (Unified shadcn + Linear/Vercel)
Scope: Redesign all pages to fix "quá mờ" — make UI vivid, consistent, and efficient using shadcn base-nova neutral as design system, inspired by Linear (grid, hero dark), Vercel (stark typography/mono), Stripe (gradient trust), Notion (soft hierarchy), Raycast (compact blurred), Framer (subtle motion).

## 1. Design Tokens

- Base: shadcn base-nova, neutral, cssVariables true, rsc true, icon lucide (already in FE/components.json & admin/components.json)
- Colors: background white, foreground zinc-950, border zinc-200/300, muted zinc-100, card white, primary zinc-950 (Vercel), accent violet-600 (Linear), premium amber-500→orange-600 (Stripe), destructive red-600
- Typography: Geist Sans + Geist Mono (already admin/app/layout.tsx), FE will use same via next/font; h1 30-36px extrabold tracking-tight, body 14-15px leading-relaxed, mono 11-12px for meta
- Radius: 0.75rem (xl), shadow-sm for cards, shadow-lg for premium hero, ring-white/10 for dark
- Motion: Reveal (existing) + hover -translate-y-0.5, duration-300, no heavy Framer Motion to keep efficient

## 2. Layout & Navigation

- FE: Sticky header white/80 backdrop-blur border-zinc-200/80 (Linear), Logo left, nav center (Problem, Dạng bài, Hỏi đáp, Premium), right cluster (OnlineCounter, VIP badge, greeting, UserButton with VIP ring) — same as homepage SignedIn nav, reused via FE/app/ui/VipCluster (previously removed but will reintroduce as shared). Max width 1480px for premium, 6xl for homepage.
- Admin: Sidebar zinc-950 + main zinc-100 (already fixed for contrast), header consistent. Card-based content (border-zinc-300 bg-white shadow-sm).
- All pages: max-w, px-4 sm:px-6 lg:px-8, py-8-12, consistent spacing scale 4/6/8.

## 3. Page-by-Page (Faded Fixes)

- **FE homepage (page.tsx)**: Hero keep terminal but increase contrast: eyebrow bg-zinc-100 border-zinc-200 text-zinc-700 (was 100/90 faint), h1 text-zinc-950 stronger, p text-zinc-600 → text-zinc-700, buttons solid zinc-950 + outline zinc-300. StatsStrip cards border-zinc-300 bg-white shadow-sm (was zinc-200/80 faint). FeatureCard already vivid (gradient tile) keep. TopicCard increase border contrast.
- **FE premium (premium/page.tsx + ui/Pricing.tsx)**: Already dark hero gradient, but Pricing cards will use shadcn Card with border-zinc-800 vs amber/emerald, trust banner border-zinc-800 bg-zinc-900/40 -> border-zinc-700 bg-zinc-900/60 for vivid. Fee: ensure monthly/yearly/daily prices font-black remains.
- **FE problem list (problem/page.tsx)**: Header border-zinc-200/80 → border-zinc-300, search input border-zinc-300 focus:border-zinc-900, filter pills border-zinc-300 text-zinc-700 font-semibold (was 300/600 faint), problem card border-zinc-200/80 → border-zinc-300 shadow-sm hover:shadow-md.
- **FE problem detail ([slug]/page.tsx)**: Editor dark theme already vivid, but test tabs (pill) increase contrast: bg-zinc-900 text-white for active, border-zinc-300 for inactive.
- **FE qna (qna/page.tsx)**: Editorial header increase contrast: HelpCircle bg-zinc-900 text-white, h1 text-zinc-950, p text-zinc-700. Search bar border-zinc-200 → border-zinc-300, FAQ accordion border-zinc-200 → border-zinc-300, hover:bg-zinc-50.
- **FE not-found (not-found.tsx)**: Already hacker vivid, keep.
- **FE sign-in/up (Clerk)**: Clerk appearance variables will be set to zinc-950 primary, border-zinc-300.
- **Admin login**: Already fixed placeholder text-zinc-500 opacity-100, Card border-zinc-800, now vivid.
- **Admin dashboard/problems/qna**: Already updated to border-zinc-300 bg-white shadow-sm via shadcn Card/Table, but will refine: dashboard cards already vivid, problems Table header bg-zinc-100 border-b border-zinc-300 font-bold, qna same. problems/new: hero gradient dark + Cards for each section with colored headers (emerald/amber/violet) already vivid, will keep.
- **Global faded fixes**: Replace all `text-zinc-500` → `text-zinc-600/700 font-medium`, `border-zinc-200` → `border-zinc-300`, `bg-zinc-50/50` → `bg-white` or `bg-zinc-50` solid, `placeholder:text-zinc-400` → `placeholder:text-zinc-500`.

## 4. Motion

- Keep Reveal IntersectionObserver threshold 0.15, delay 0/120/240 for FeatureCard. Add hover lift `hover:-translate-y-1 hover:shadow-lg` for TopicCard/ProblemCard (Framer-inspired) already present, keep duration-300.
- No extra JS animation for efficiency.

## 5. Testing

- Visual: `pnpm build` FE + admin PASS (9/9 and 6/6 routes), `pnpm lint` PASS, manual check each page light/dark contrast ratio ≥ 4.5:1 for text.
- Interaction: admin login admin/admin, create problem 3/10 tests validation, qna delete, stats load.

## 6. Implementation Order (Efficient)

1. Tokens sync (FE globals.css already has cssVariables, ensure)
2. FE homepage hero + StatsStrip + FeatureCard contrast
3. FE premium Pricing trust banner + header
4. FE problem list + qna editorial
5. FE problem detail tabs (if needed)
6. Admin remaining polish (already done 80%, just verify)
- Each batch independent, shippable.
