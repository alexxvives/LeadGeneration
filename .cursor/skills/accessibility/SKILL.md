---
name: accessibility
description: >-
  Design, implement, and audit inclusive digital products using WCAG 2.2 Level
  AA. Use when generating ARIA, auditing accessibility barriers, or implementing
  keyboard/focus/contrast requirements for Web (and native trait mapping).
---

# Accessibility (WCAG 2.2)

Ensure interfaces are Perceivable, Operable, Understandable, and Robust (POUR).

## When to Use

- Specifying or auditing UI components for WCAG 2.2 AA
- Adding ARIA roles/labels/live regions
- Fixing keyboard navigation, focus traps, or target sizes
- Contrast, reflow, and non-color meaning checks

## Core checklist

- Prefer native elements (`button`, `a`, `label`) over div-buttons
- Contrast: 4.5:1 normal text, 3:1 large/UI
- Target size ≥ 24×24 CSS px (SC 2.5.8)
- Visible focus indicator (SC 2.4.11); modals trap focus + Escape closes
- Icon-only controls need accessible names
- Errors include text suggestions (SC 3.3.3)
- Do not convey meaning with color alone
- Avoid redundant alt text ("Image of…")

## Web patterns

```html
<form role="search">
  <label for="search-input" class="sr-only">Search products</label>
  <input type="search" id="search-input" placeholder="Search..." />
  <button type="submit" aria-label="Submit Search">…</button>
</form>
```

Use `aria-live="polite"` for toasts/status. Restore focus to the trigger when closing menus/modals.

## Lodestar note

Studio Pipeline (DnD), Search forms, Settings, and Lead drawer are the highest-risk surfaces — verify keyboard reachability and focus return on drawer close.
