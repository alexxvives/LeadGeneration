---
name: lodestar-ui
description: >-
  Lodestar brand design system and component patterns. Use whenever building,
  editing, or reviewing any UI component in this project — especially for new
  pages, cards, modals, forms, or anything visual. Encodes the exact tokens,
  CSS utilities, layout conventions, and forbidden patterns for this codebase.
---

# Lodestar UI — Design System Reference

## Brand story
Deep "ink" night-sky base + aurora teal/green primary + warm amber secondary.
Navigation star metaphor. No purple-on-white. No cream/terracotta. Motion is
intentional and minimal (2–3 cues max per screen).

## Fonts
- **Display / headings**: `font-display` → Fraunces (variable serif)
- **UI / body**: default sans → Space Grotesk
- Use `font-display` on `h1`/`h2` (landing) and key numbers/labels in the app.

## Color tokens (Tailwind classes)

| Role | Class | Hex |
|------|-------|-----|
| Page background | `bg-ink-950` | `#060a12` |
| Card/surface bg | `bg-ink-900` → `bg-ink-800` | `#0a1120` → `#131f34` |
| Stroke / border | `border-ink-700` or `border-white/10` | |
| **Primary accent** | `text-aurora-300` / `bg-aurora-400` | `#7ff2c8` / `#43e0a8` |
| Aurora hover/pressed | `aurora-500` / `aurora-600` | `#16c390` / `#0e9d74` |
| **Secondary accent** | `text-amber-300` / `bg-amber-400` | `#ffd48a` / `#f7b955` |
| Body text | `text-mist-100` | `#eaf1fb` |
| Muted text | `text-mist-300` | `#b6c4dc` |
| Placeholder / hint | `text-mist-500` | `#7f92b3` |

## Key utility classes (globals.css)

```css
.glass          /* frosted dark card: gradient bg + backdrop-blur + white/8 border */
.card-hover     /* lift + green shadow on hover */
.aurora-glow    /* multi-radial aurora gradient — hero backgrounds only */
.shimmer        /* loading skeleton animation */
.pulse-ring     /* live-status dot pulse */
.animate-float-up  /* fade-up entrance (hero text) */
.font-display   /* Fraunces font */
```

`rounded-xl2` = `border-radius: 1.25rem` (custom token, use for cards/panels).

## Component patterns

### Cards
```tsx
<div className="glass card-hover rounded-xl2 p-6">
  <Icon className="h-6 w-6 text-aurora-300" />
  <h3 className="mt-4 font-semibold">Title</h3>
  <p className="mt-2 text-sm text-mist-300">Body copy.</p>
</div>
```

### Primary CTA button
```tsx
<button className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-ink-950 transition-all hover:scale-[1.03] disabled:opacity-50">
  Label <ArrowIcon className="h-4 w-4" />
</button>
```

### Ghost / secondary button
```tsx
<button className="glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-mist-100 transition-transform hover:scale-[1.02]">
  Label
</button>
```

### Form inputs
```tsx
<input className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none placeholder:text-mist-500 focus:border-aurora-400/60 transition-colors" />
```

### Segmented control / toggle
```tsx
<div className="inline-flex rounded-full border border-white/10 bg-ink-900/60 p-1">
  <button className="rounded-full px-4 py-1.5 text-sm font-medium bg-aurora-400 text-ink-950">Active</button>
  <button className="rounded-full px-4 py-1.5 text-sm font-medium text-mist-300 hover:text-mist-100">Inactive</button>
</div>
```

### Section layout
```tsx
<section className="mx-auto max-w-6xl px-6 pb-24">
  <h2 className="font-display text-3xl font-semibold sm:text-4xl">…</h2>
  <p className="mt-3 max-w-2xl text-mist-300">…</p>
  <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">…</div>
</section>
```

### Alert / notice strip
```tsx
<div className="rounded-xl border border-amber-400/15 bg-amber-400/5 px-6 py-4">
  <p className="text-sm text-amber-200/80">
    <span className="font-semibold text-amber-300">Note:</span> message here.
  </p>
</div>
```

## Icons
All icons live in `src/components/icons.tsx` — inline SVG, no dependency.
Available: `SearchIcon ArrowIcon MailIcon CheckIcon XIcon GlobeIcon PhoneIcon
SparkIcon StarIcon ShieldIcon SettingsIcon`.
Add new icons there (same pattern: `SVGProps<SVGSVGElement>`, `currentColor`).

## Architecture rules (never break)
- `"use client"` only on components that need browser APIs/hooks.
- UI never imports `service.ts`, DB, or providers directly — use `client-api.ts`.
- Secrets never rendered in UI. Plan/quota gates enforced server-side.
- New pages follow App Router conventions: `src/app/<route>/page.tsx`.

## What NOT to do
- No purple, cream, or terracotta — they clash with the brand.
- No inline `style={}` for colors — use the token classes.
- No magic numbers for spacing/radius — use Tailwind scale + `rounded-xl2`.
- No `any` TypeScript without a comment explaining why.
- No heavy animation libraries (Framer Motion variants etc.) — use CSS keyframes.
