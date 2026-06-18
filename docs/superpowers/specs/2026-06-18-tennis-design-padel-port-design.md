# Dragon Tennis — Padel Design Language Port — Design Spec

**Date:** 2026-06-18
**Scope:** Theme + mobile-first navigation shell + member home redesign + dedicated admin hub. Inner pages inherit theme/shell; their content/layout is unchanged. Light theme only.

## Goal

Bring the Dragon Padel visual identity to the Dragon Tennis app. Padel's home/menu/admin design is built with **Tailwind + a shadcn-style component kit + CSS variables + lucide-react icons** (MUI is legacy, only in one admin transactions page) — so we replicate the look **without** adding MUI/Radix, keeping tennis's clean Tailwind + Convex stack.

## Non-goals

- No dark mode (padel forces `forcedTheme="light"`; we match that).
- No restyle of inner-page content (forms, tables in activate/credits/history/faq/members/stats/admin-faq) — they only gain the theme + shell.
- No new backend/Convex work. Pure frontend.
- No Radix, no MUI, no CVA. Only new dependency: `lucide-react`.

## Design tokens (palette from padel `styles/base.css`)

Light-only CSS variables in `app/globals.css` `:root` (HSL channel values, consumed as `hsl(var(--x))`):

| Variable | Value | Use |
|---|---|---|
| `--background` | `0 0% 100%` | page bg |
| `--foreground` | `222 47% 11%` | text |
| `--card` | `0 0% 100%` | card bg |
| `--card-foreground` | `222 47% 11%` | card text |
| `--primary` | `257 49% 40%` | indigo `#6645ba` |
| `--primary-foreground` | `0 0% 100%` | text on primary |
| `--secondary` | `210 40% 96%` | muted surfaces |
| `--secondary-foreground` | `222 47% 11%` | |
| `--muted` | `210 40% 96%` | |
| `--muted-foreground` | `215 16% 47%` | secondary text |
| `--accent` | `24 67% 50%` | desert sand `#d66e29` |
| `--accent-foreground` | `0 0% 100%` | |
| `--success` | `142 71% 45%` | |
| `--warning` | `38 92% 50%` | |
| `--destructive` | `0 84% 60%` | |
| `--destructive-foreground` | `0 0% 100%` | |
| `--border` | `214 32% 91%` | |
| `--input` | `214 32% 91%` | |
| `--ring` | `257 49% 40%` | |
| `--radius` | `0.5rem` | base radius |

`tailwind.config.ts` `theme.extend`: map `colors` (background, foreground, card{DEFAULT,foreground}, primary{DEFAULT,foreground}, secondary{…}, muted{…}, accent{…}, success, warning, destructive{…}, border, input, ring) to `hsl(var(--x))`; `borderRadius` lg=`var(--radius)`, md=`calc(var(--radius) - 2px)`, sm=`calc(var(--radius) - 4px)`; `fontFamily.sans` includes Inter. Keep `darkMode: "class"` (unused but harmless).

`app/layout.tsx`: load Inter via `next/font/google`, apply to `<html>`; `<body>` → `bg-background text-foreground` (replaces `bg-gray-50 text-gray-900`).

## Components

### `lib/utils.ts`
`cn(...classes)` — small class-name joiner (truthy-filter + join). No `clsx`/`tailwind-merge` dependency.

### `components/ui/` (Tailwind-only, no Radix)
- **`card.tsx`** — `Card`, `CardHeader`, `CardTitle`, `CardContent`. Base: `rounded-lg border bg-card text-card-foreground shadow-sm`.
- **`button.tsx`** — `Button` with `variant` (default | secondary | outline | ghost | accent | destructive) and `size` (default | sm | lg | icon), implemented via a plain variant→class map + `cn()`. Forwards props, supports `asChild`-free usage (plain `<button>`). For links, callers wrap with Next `<Link>` or pass `className`.
- **`badge.tsx`** — `Badge` pill, `variant` (default | secondary | success | warning | destructive | outline). Base `rounded-full border px-2.5 py-0.5 text-xs font-semibold`.
- **`avatar.tsx`** — circular initials fallback (plain div, no image needed).

### `components/app/` (the shell)
- **`BrandMark.tsx`** — rounded square `bg-primary text-primary-foreground` with a lucide icon (e.g. `Zap`/tennis vibe) + "Dragon Tennis" wordmark.
- **`AppNavbarDesktop.tsx`** — `hidden md:block`, header `h-14`, brand left; links right. Member links: Accueil `/dashboard`, Activer `/activate`, FAQ `/faq`. Admin adds: Admin `/admin`. Active state `bg-primary/10 text-primary`, inactive `text-muted-foreground hover:bg-muted`. Right: balance badge (from `getMe`) + `SignOutButton`. Role via `api.users.getMe`.
- **`BottomTabBar.tsx`** — `fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden`. Tabs (lucide icon + label, `min-h-14`): Accueil, Activer, FAQ, and Admin (admin only). Active `text-primary`, inactive `text-muted-foreground`. Uses `usePathname()` for active state.
- **`AppShell.tsx`** — `{ title?, children }`: renders `<AppNavbarDesktop/>`, `<main className="mx-auto max-w-screen-lg min-h-screen px-4 pb-24 pt-4 md:pb-8">` with optional `<h1>` title, then `children`, then `<BottomTabBar/>`. Role-aware (reads `getMe`). Replaces the current `NavBar`.

## Page changes

- **`MemberDashboard.tsx`** (redesign, same Convex data — `getMe`, `listForUser`, `listMine`):
  - Top **summary card**: "Solde actuel" + balance `text-3xl font-extrabold text-accent`.
  - **CTA** button → `/activate` ("Activer une lumière", primary).
  - **Activations récentes** — card with styled list (court, durée, date, statut badge), first 5.
  - **Historique** — card with styled list (type, comment, signed amount), first 10.
- **`app/admin/page.tsx`** (NEW, `AdminGate` + `AppShell`): admin hub.
  - Icon-link row (lucide): Stats `/stats`, Membres `/members`, Créditer `/credits`, Historique `/history`, Gérer FAQ `/admin/faq` — each `rounded-lg border p-4 hover:bg-muted` tile with icon + label.
  - Below: overview = reuse `<StatsPanel/>`.
- **Shell swap on the 8 authed pages**: `dashboard`, `activate`, `credits`, `history`, `faq`, `members`, `stats`, `admin/faq`. Each page wrapper changes from `<AuthGate|AdminGate><main…><NavBar title=…/>{panel}</main></…>` to `<AuthGate|AdminGate><AppShell title=…>{panel}</AppShell></…>`. **Inner panel content unchanged.**
- **`components/NavBar.tsx`** — removed (superseded by `AppShell`).
- **`app/page.tsx`** — unchanged (redirect to `/dashboard`).
- Public pages (`/signin`, `/accept-invite/[token]`, `/forgot-password`) — unchanged (no shell; they still get the new theme via globals).

## Dependencies

Add `lucide-react` (tree-shakeable icon set). No other new deps.

## Verification

- `npx tsc --noEmit` clean, `npm run lint` clean, `NODE_OPTIONS=--max-old-space-size=2560 npm run build` succeeds.
- Visual: rebuild + `pm2 restart tennis`; load `https://dragontennis.aidigitalassistant.cloud` — themed shell, redesigned home, `/admin` hub, bottom-tab on mobile width, admin-only links gated by role.
- No regression: all existing routes still render their panels; auth/admin gating intact.

## Risks / notes

- Active-link detection uses `usePathname()` — shell components are client components (`"use client"`).
- Balance badge / role come from `getMe`; shell renders gracefully while `me === undefined` (skeleton/placeholder, no crash).
- Build OOM mitigated with raised `NODE_OPTIONS` (known on this host).
