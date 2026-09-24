---
version: alpha
name: gocode
description: Light minimal dev-tool aesthetic for a Vietnamese coding-practice platform. Near-black text on white, single emerald accent, mono labels, generous radius.
colors:
  primary: "#09090b"
  surface: "#ffffff"
  muted: "#fafafa"
  border: "#e4e4e7"
  accent: "#10b981"
  accent-strong: "#059669"
  accent-soft: "#ecfdf5"
  warning: "#f59e0b"
  danger: "#f43f5e"
  terminal: "#09090b"
typography:
  display:
    fontFamily: Inter, Geist Sans, system-ui, sans-serif
    fontSize: 60px
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter, Geist Sans, system-ui, sans-serif
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  body:
    fontFamily: Inter, Geist Sans, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  mono-label:
    fontFamily: Geist Mono, ui-monospace, monospace
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0.04em
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-primary-hover:
    backgroundColor: "#27272a"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
---

# GoCode Design System

## Overview

GoCode is a Vietnamese platform for practicing data structures and algorithms.
The visual language is a **light, minimal dev-tool aesthetic**: white canvas,
near-black text, one emerald accent, and monospace micro-labels that nod to
code editors. Marketing pages may add restrained 3D; app pages stay flat and
fast. Vietnamese copy sets in sentence case, never all-caps (except mono kicks).

## Colors

- Canvas is always white (`surface`) or near-white (`muted` `#fafafa`) for page washes.
- Text is near-black (`primary`); secondary text is zinc-500/600.
- **One accent only**: emerald (`accent`) for success, CTAs on dark, active states,
  and progress. Never introduce a second brand hue on the same screen.
- `warning` amber and `danger` rose are reserved for verdicts and destructive actions.
- Code/terminal surfaces are near-black (`terminal`) with emerald text.
- Borders are hairline zinc (`border`); avoid heavy dividers.

## Typography

- Display (hero): Inter/Geist 800, tight tracking, `text-4xl→6xl` responsive.
- Section titles (`h2`): bold, tracking-tight, `text-3xl→4xl`, centered with a
  mono kicker above (`// 01 — features`, `$ ls ./topics`).
- Body: 15px relaxed zinc-600/700.
- Mono labels: 11–12px, used for kickers, stats, status bars, and eyebrows only —
  never for paragraphs.

## Layout

- 8px spacing grid; max content width 1400px (`max-w-[1400px]`), sections `py-16→20`.
- Cards sit on white with hairline borders over tinted page washes; page
  backgrounds may carry one faint grid + up to three low-opacity glows.
- Dark blocks (final CTA, code editor) are deliberate anchors, max one per viewport.

## Elevation & Depth

- Elevation via border + one soft shadow (`shadow-sm`), hover lifts
  (`-translate-y-1`, `shadow-md`). No multi-layer stacks.
- Motion is transform/opacity only (framer-motion `ease [0.22,1,0.36,1]`,
  0.7s reveals; GSAP scrub for scroll fades). Respect `prefers-reduced-motion`.
- 3D (R3F) is reserved for hero backgrounds and loaders: transparent canvas,
  capped DPR, paused off-screen, pointer-events-none behind content.

## Shapes

- Buttons `rounded-xl`, cards `rounded-2xl/3xl`, pills `rounded-full`.
- Status dots and avatars are circular; icons sit in gradient tiles (`rounded-2xl`).

## Components

- Primary button: near-black bg, white text, `rounded-xl`, hover zinc-800,
  tap scale 0.97.
- Cards: white, hairline border, `rounded-2xl`, hover border-tint + lift.
- Forms: `rounded-xl` inputs, zinc-200 borders, white focus.
- Tables (problem list): hairline rows, mono uppercase micro-headers.
- Loader: dark premium splash, 3D core + progress ring, fake % with phases.

## Do's and Don'ts

- Do keep one accent per screen; do use mono labels for code flavor.
- Do keep code editors dark; do keep everything else light.
- Don't add gradients to text (except loader brand glow); don't add card shadows
  beyond hover; don't use emojis in UI; don't ship mock numbers as real data.
