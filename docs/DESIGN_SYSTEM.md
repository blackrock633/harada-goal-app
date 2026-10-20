# Design System — Harada Goal App

> **Status: CANONICAL** for visual language. Implemented as CSS custom properties + Tailwind v4
> `@theme` tokens in `src/app/globals.css`, and React primitives in `src/ui/primitives/`.

## 1. Character

**Calm, editorial, focused, in the spirit of a well-made Japanese paper planner.** The product
should feel like a serious personal tool, not a SaaS dashboard or a game.

- Ink on warm paper. One accent colour (**vermilion / 朱色**), used sparingly for primary actions, focus, and progress.
- Typography does the work: a confident serif for headings, a precise sans for UI.
- Structure comes from whitespace and hairline rules, **not** from boxes, shadows, and cards.
- Motion is functional (≤ 200 ms, ease-out) and is disabled under `prefers-reduced-motion`.

**Never:** gradients, glows, glassmorphism, emoji as UI, neon, drop-shadow-heavy cards, giant in-app hero
sections, decorative illustrations, gamification chrome (XP bars, badges, confetti), text below 12 px.

## 2. Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F7F5F0` | `#131311` | page background |
| `--surface` | `#FFFFFF` | `#1B1A18` | raised areas (dialogs, inputs, the 64 grid cells) |
| `--surface-sunken` | `#EFECE5` | `#0E0E0D` | wells, hover rows |
| `--ink` | `#1B1A17` | `#EEEBE4` | primary text |
| `--ink-muted` | `#5E5A52` | `#A6A196` | secondary text (≥ 4.5:1 on paper) |
| `--ink-faint` | `#8A857B` | `#78746B` | placeholders, disabled, meta (large text / non-essential only) |
| `--rule` | `#E2DED4` | `#2C2A26` | hairlines, borders |
| `--rule-strong` | `#CBC6BA` | `#3D3A35` | stronger hairlines, focused containers (decorative) |
| `--rule-input` | `#857F74` | `#77726A` | input/select/textarea boundaries (≥ 3:1, WCAG 1.4.11) |
| `--accent` | `#C2401C` | `#EB6A45` | primary buttons, links, progress fill, focus ring |
| `--accent-ink` | `#FFFFFF` | `#1B0B05` | text on accent |
| `--accent-soft` | `#F5E2DA` | `#3A1E15` | selected states, accent backgrounds |
| `--success` | `#2F6B43` | `#6FBF8A` | completed, ahead |
| `--warning` | `#8F5A0B` | `#E0A64A` | behind, overdue |
| `--danger` | `#B0261B` | `#F07A6E` | destructive, errors |

All text/background pairs must meet WCAG AA (4.5:1 body, 3:1 large/UI). Dark mode follows
`prefers-color-scheme`, with an override in Settings stored in a cookie (`light | dark | system`).

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| Display / headings | **Fraunces** (variable, opsz) via `next/font/google` (self-hosted at build) | weights 400–600, `font-optical-sizing: auto` |
| UI / body | **Inter** (variable) via `next/font/google` | `font-feature-settings: 'cv11','ss01'`; tabular numbers (`tnum`) for figures |

Scale (rem at 16 px root): `xs 0.75` (meta only) · `sm 0.875` · `base 1` · `lg 1.125` · `xl 1.375` · `2xl 1.75` · `3xl 2.25` · `4xl 3`.
Body line-height 1.55; headings 1.15–1.25; max line length ~68ch for prose. Body text is **16 px**; never use the xs size for interactive labels.

## 4. Space, radius, elevation

- Spacing: 4 px base (`1 = 4px`). Section rhythm 32/48 px; component padding 12/16 px.
- Radius: `--radius-sm 6px` (inputs, buttons), `--radius-md 10px` (dialogs, grid cells), `--radius-full` (pills, check circles).
- Elevation: none by default. Dialogs/popovers get one soft shadow `0 8px 30px rgb(0 0 0 / .12)` plus a 1 px rule.
- Layout: app shell = left rail (≥ 1024 px) or top bar plus bottom tab bar (< 768 px). Content max-width 1120 px; reading views 720 px.

## 5. Components (primitives in `src/ui/primitives/`)

| Primitive | Requirements |
|---|---|
| `Button` | variants `primary` (accent fill), `secondary` (rule border), `ghost`, `danger`; sizes `sm 32px`, `md 40px`; min touch target 44 px on mobile; `loading` state keeps width and shows a spinner + `aria-busy` |
| `IconButton` | requires `label` (aria-label + tooltip) |
| `Input` / `Textarea` / `Select` / `DateInput` | visible label (via `Field`), hint, error text linked with `aria-describedby`, `aria-invalid`; char counter when near the limit |
| `Field` | label + control + hint + error |
| `Dialog` / `ConfirmDialog` | Radix; focus trap; Escape closes; destructive confirm can require typed text |
| `Menu` | Radix dropdown for overflow actions (Edit / Archive / Move …) |
| `Tabs` | link-based tabs for goal sections (real URLs), `aria-current="page"` |
| `ProgressBar` / `ProgressRing` | `role="progressbar"` with `aria-valuenow`; `null` progress renders as "—" with "Not measurable yet" |
| `CheckCircle` | the routine/task toggle: 28 px circle, 44 px hit area, `aria-pressed`, label = action title |
| `Badge` | status (Draft / Active / Achieved / Archived), pace (Ahead / On track / Behind / Overdue) — text, not just colour |
| `Toast` | polite live region; success/error; auto-dismiss 4 s; never the only error signal for forms |
| `Skeleton` | loading placeholders matching final layout (route `loading.tsx`) |
| `EmptyState` | short headline, one sentence, one primary action. No illustrations. |
| `ErrorState` | for `error.tsx`: what happened + retry |

## 6. Signature views

- **Today:** a single column. Date heading (serif). "Next up" list of `CheckCircle` rows (action title, goal · outcome meta, due/overdue tag). A collapsible "Done today" section. A right column (desktop) with active goals: title, progress bar, pace badge.
- **Open Window 64 (Plan):** desktop ≥ 1024 px: a 9×9 grid of 3×3 blocks; the centre block is the goal plus 8 outcomes; the outer blocks are each outcome plus its 8 actions. Empty slots show a faint "+" affordance to add. Cells show title (2-line clamp), a kind glyph (task ○ / routine ↻), and completion state. Keyboard: arrow keys move between cells, Enter opens the editor. Mobile/tablet: an accordion list of outcomes with their actions (same data, same actions).
- **Routine check sheet:** month grid per routine; scheduled days outlined, checked days filled with accent, today ringed; click/tap toggles (past days only).
- **Journal:** reverse-chronological reflections plus a timeline of plan changes (GoalEvents), interleaved by date.

## 7. Interaction rules

- Every mutation gives feedback: inline state change plus a toast for non-obvious results.
- Pending buttons are disabled to prevent double-submission.
- Destructive actions: Archive = immediate with an "Undo" toast. Permanent delete = typed confirmation.
- Forms keep user input on error; errors appear next to fields; focus moves to the first invalid field.
- Visible focus ring everywhere: `outline: 2px solid var(--accent); outline-offset: 2px`.
- All icons from `lucide-react` at 16/20 px, stroke 1.75; icons never carry meaning alone.
