# Design System Master: Lectern

> Source of truth generated from [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), then overridden for this product.
> Do not mix landing-page patterns into the recording app.

## Product

Local-first lecture transcription studio. Record or upload, transcribe with Whisper on-device, write study notes. Dense dashboard, not a marketing site.

## Design Dials

- **Variance:** 6/10 — Balanced / Modern
- **Motion:** 4/10 — Standard micro-interactions (150–200ms). No GSAP. Respect `prefers-reduced-motion`.
- **Density:** 8/10 — Dense / Dashboard (8–32px spacing)

## Style

**Glassmorphism, dark-forced.** Frosted surfaces, 16px backdrop blur, 1px light borders, layered depth over a teal/ink field.

The catalog’s first `--design-system` hit was Flat Design + a light Productivity Tool mint page (`#F0FDFA` / white cards). That is rejected: the user asked to leave the white HTML page. Dark mode is mandatory.

**Do:** glass panels, teal selection, orange record CTA, Lucide icons, Inter-class sans (Geist).
**Don't:** numbered white cards, landing hero, emoji-as-icons, autoplay, shadows-as-the-only-depth.

## Colors (dark studio)

Productivity Tool teal + orange, inverted onto a Drawing-canvas / community dark structure.

| Role                | Hex                      | Token                                                |
| ------------------- | ------------------------ | ---------------------------------------------------- |
| Primary             | `#2DD4BF`                | `--primary`                                          |
| On Primary          | `#042F2E`                | `--primary-foreground`                               |
| Secondary           | `#14B8A6`                | `--secondary` (tint; UI secondary surface is darker) |
| Accent / Record CTA | `#EA580C`                | `--cta`                                              |
| On CTA              | `#FFFFFF`                | `--cta-foreground`                                   |
| Background          | `#070F0E`                | `--background`                                       |
| Foreground          | `#F0FDFA`                | `--foreground`                                       |
| Card / glass        | `#111C1B` @ 72%          | `--card`                                             |
| Muted foreground    | `#A8C5C0`                | `--muted-foreground` (≥4.5:1)                        |
| Border              | `rgba(255,255,255,0.10)` | `--border`                                           |
| Destructive         | `#DC2626`                | `--destructive`                                      |
| Ring                | `#2DD4BF`                | `--ring`                                             |

Light `:root` is not used. `html` always has `.dark`.

## Typography

**Modern Dark Cinema (Inter System)** — Heading: Geist (Inter-class, local `next/font`). Body: Geist. Mono: Geist Mono for timestamps and timers.

- Display / H1: 600, tracking −0.02em
- Body: 16px, line-height 1.5
- Labels: 12px, medium, slight tracking
- Timestamps: mono, tabular-nums

## Layout

App studio, not a landing page:

1. Left sidebar (desktop): brand, past lectures, on-device storage
2. Sticky status rail: engine chips
3. Work surface: capture deck → transcript | notes

Mobile: brand + status, then work surface, history below. No horizontal scroll. Safe-area padding.

## Motion

- Hover / focus: 150–200ms color/opacity
- Recording pulse: `motion-safe:animate-ping` only
- No `back.out` overshoot on lists (skill: sloppy on dense data)

## Anti-patterns

- Complex onboarding
- Slow performance
- Numbered 1–4 white setup cards
- Mixing Product Demo + Features landing pattern into the tool
- Emoji as icons
- Muted text below 4.5:1 on dark

## Stack notes

- Next.js App Router, Tailwind v4, shadcn base-nova, Lucide
- Keep e2e accessible names and `stt.lectures.v1` / IndexedDB `stt-audio`
- Primary actions ≥44px. Icon deletes in dense lists keep ≥24px (WCAG 2.2 web)
- `cursor-pointer` on every operable control
