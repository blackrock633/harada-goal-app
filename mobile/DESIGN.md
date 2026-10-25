---
name: Harada
description: The printed Harada sheet as a native app: ink on paper, hairline rules, square cells, one vermilion for what matters now.
colors:
  paper: "#F7F5F0"
  surface: "#FFFFFF"
  surface-sunken: "#EFECE5"
  ink: "#1B1A17"
  ink-muted: "#5E5A52"
  ink-faint: "#6F6A61"
  rule: "#E2DED4"
  rule-strong: "#CBC6BA"
  rule-input: "#857F74"
  vermilion: "#C2401C"
  vermilion-ink: "#FFFFFF"
  vermilion-soft: "#F6E4DC"
  vermilion-on-soft: "#9E3214"
  success: "#2F6B43"
  warning: "#8F5A0B"
  danger: "#B0261B"
  dark-paper: "#131311"
  dark-surface: "#1B1A18"
  dark-surface-sunken: "#0E0E0D"
  dark-ink: "#EEEBE4"
  dark-ink-muted: "#A6A196"
  dark-ink-faint: "#8E897F"
  dark-rule: "#2C2A26"
  dark-rule-strong: "#3D3A35"
  dark-rule-input: "#77726A"
  dark-vermilion: "#EB6A45"
  dark-vermilion-ink: "#1B0B05"
  dark-vermilion-soft: "#3A1E15"
  dark-vermilion-on-soft: "#F49B7E"
  dark-success: "#6FBF8A"
  dark-warning: "#E0A64A"
  dark-danger: "#F07A6E"
typography:
  display:
    fontFamily: "ShipporiMinchoB1_700Bold"
    fontSize: "34px"
    lineHeight: "42px"
    letterSpacing: "-0.4px"
  title:
    fontFamily: "ShipporiMinchoB1_700Bold"
    fontSize: "28px"
    lineHeight: "35px"
    letterSpacing: "-0.2px"
  heading:
    fontFamily: "ShipporiMinchoB1_700Bold"
    fontSize: "20px"
    lineHeight: "27px"
  headline:
    fontFamily: "System (SF / Roboto)"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
  body:
    fontFamily: "System (SF / Roboto)"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "24px"
  meta:
    fontFamily: "System (SF / Roboto)"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: "System (SF / Roboto)"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "14px"
  full: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.vermilion-ink}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.vermilion}"
    rounded: "{rounded.md}"
    padding: "0 8px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  badge:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: "1px 8px"
  focus-toggle-on:
    backgroundColor: "{colors.vermilion-soft}"
    textColor: "{colors.vermilion-on-soft}"
    rounded: "{rounded.full}"
    height: "32px"
  segmented-control:
    backgroundColor: "{colors.surface-sunken}"
    rounded: "{rounded.md}"
    padding: "2px"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  matrix-cell:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
  matrix-center-cell:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
---

# Design System: Harada

Authority: this file and `src/theme/tokens.ts` describe the native app (iOS, Android, and web for QA). `../docs/DESIGN_SYSTEM.md` describes the older Next.js web app (Fraunces/Inter) and is not the native app's authority.

## Overview

**Creative North Star: "The Printed Harada Sheet"**

The app is a ruled paper form with ink entries. Structure comes from hairline rules, ink weight and type, not from boxes, cards or fills. The 9x9 matrix is drawn as the sheet itself: square cells, a heavy ink frame and heavy ink rules between the nine 3x3 blocks, hairlines inside. Everything else on screen is quiet paper and ink so that the single vermilion (shu) mark reads as "this matters now".

Display is a Mincho (the face of Japanese printed forms) used for the goal and screen-level names. All operational text uses the platform UI face, so Dynamic Type, Roboto metrics and native feel come free. Density is calm and phone-first; reading columns cap at 680 pt on wide screens.

**Key Characteristics:**
- Warm off-white paper, near-black warm ink, one vermilion accent; dark scheme keeps the same hues, lifted.
- Flat: no shadows, no elevation. Depth is rules, sunken tone and the scrim behind a sheet.
- Square cells for form content; small radius for controls; large radius only for the bottom sheet; pills only for the focus toggle and icon-button press.
- Mincho for names, system face for work.

## Colors

Paper, ink and rule neutrals carry nearly everything; vermilion is rare by design. Both schemes are defined in `src/theme/tokens.ts` (`lightColors`, `darkColors`); frontmatter dark-* entries are the dark counterparts.

### Primary
- **Vermilion (shu)** (`vermilion`; dark `dark-vermilion`): the primary action, selected tab, checked mark, focus ring, focused field border, add-cell plus in the matrix, ghost actions. Pressed primary uses `vermilion-on-soft`.
- **Vermilion Wash** (`vermilion-soft`) with **Vermilion Ink-on-Wash** (`vermilion-on-soft`): the "in today's focus" state. Text and icons on the wash use `vermilion-on-soft` (4.5:1 or better), never `vermilion`.

### Neutral
- **Paper** (`paper`): screen and matrix cell ground. **Surface** (`surface`): fields and the bottom sheet. **Sunken** (`surface-sunken`): pressed states and segmented-control track.
- **Ink** (`ink`): text, the matrix frame and block rules, the progress fill. **Ink Muted** / **Ink Faint**: secondary and tertiary text (both at accessible contrast).
- **Rule** (`rule`): row dividers, inner hairlines, progress track. **Rule Strong**: section tops, secondary button outline, pill borders, grabber. **Rule Input** (`rule-input`): field border and unchecked marks, darker so the control boundary meets 3:1.

### Status
- **Success / Warning / Danger**: Badge outline and text, error borders, destructive buttons. Not used as decoration.

### Named Rules
**The One Vermilion Rule.** Vermilion marks what matters now (the one action, the selection, the done mark, focus). If two things on a screen are vermilion and neither is a state, one is wrong.
**The Accent-On-Soft Rule.** On `vermilion-soft`, text is `vermilion-on-soft`; plain vermilion text fails contrast there.

## Typography

**Display Font:** Shippori Mincho B1 (700 Bold; 500 Medium bundled as `displayRegular`), falling back to the system serif if loading fails.
**Body Font:** platform UI face (SF on iOS and web, Roboto on Android).

**Character:** a printed-form Mincho for names against a plain native sans for work. The contrast does the hierarchy; weight changes are few.

### Hierarchy
- **Display** (Mincho 700, 34/42, -0.4): the goal statement.
- **Title** (Mincho 700, 28/35, -0.2): screen titles.
- **Heading** (Mincho 700, 20/27): section names, matrix centre cell, web top-bar wordmark.
- **Headline** (UI 600, 17/22): the name of a row, group or matrix cell.
- **Body** (UI 400, 17/24): default text.
- **Meta** (UI 15/20): secondary lines.
- **Caption** (UI 13/18): smallest supporting text; matrix cell numbers and counts (tabular). Matrix dense cells drop to 12/16, the floor (`MIN_FONT_SIZE` 12).

### Named Rules
**The Mincho-For-Names Rule.** Mincho is only for the goal and screen/section names. Rows, buttons, fields and metadata are the UI face.

## Layout

Phone-first single column inside `Screen`: horizontal padding 16 plus safe-area insets, 16 gap between blocks, 40 bottom padding (or a hairline-topped footer). The column caps at `CONTENT_MAX_WIDTH` 680 and is centred; layouts switch to wide at `WIDE_BREAKPOINT` 768. Spacing is a 4-pt scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64): tight within a group (4 to 8), generous between groups (16 to 24). Sections can be ruled: 20 padding under a strong hairline top. List rows are 56 min (touch minimum + 12), divided by hairlines, not boxes.

Touch targets: `MIN_TOUCH` is 48 on Android, 44 elsewhere; compact buttons are 36 visual with hit slop restoring the target (full height on web). Reduce Motion is honoured everywhere; durations are fast 120, base 200, slow 280 ms.

Navigation: native tabs on iOS and Android (Today, My Goal, Matrix, Review; vermilion tint; SF Symbols / Material icons). Web QA uses its own bar: bottom bar on phone widths, slim top bar with Mincho wordmark when wide; active tab is vermilion with a 2 px underline, inactive is Ink Muted; hairline `rule` separates the bar.

## Elevation & Depth

Flat. No shadows or elevation anywhere. Depth is expressed by hairline rules, the sunken tone for pressed and track states, a hairline-bordered bottom sheet over a scrim (`rgba(27,26,23,0.45)` light, `rgba(0,0,0,0.6)` dark), and weight of rule in the matrix (heavy 1.5 px ink versus hairline).

### Named Rules
**The Rules-Not-Boxes Rule.** Group with a hairline or whitespace. Do not wrap content in bordered or filled cards to group it.

## Shapes

Cells are square (0). Controls (buttons, fields, segmented control) are 8. Badges are 4. The bottom sheet's top corners are 14. Pills (999) appear only on the focus toggle and the circular press state of icon buttons. Check marks are a 26 pt circle (tasks) or 4-radius square (routines) with a 1.5 px border and vermilion fill when done. Borders are 1 px (1.5 on marks, 2 on focused or error fields); dividers are `hairlineWidth`.

## Components

### Buttons
Four variants, 8 radius, 1 px border, 44/48 min height, 20 horizontal padding (12 compact, 8 ghost). **Primary**: solid vermilion with white ink, one per view. **Secondary**: transparent, ink text, strong-rule outline, for real alternatives. **Ghost**: vermilion text, no outline, inline. **Danger**: danger text and outline, destructive confirmation only. Pressed: primary darkens to `vermilion-on-soft`; others take sunken or soft fill. Loading keeps width and shows a spinner. Optional leading icon.

### Fields
`surface` fill, 8 radius, `rule-input` 1 px border, 44/48 min height (112 multiline), 12 horizontal padding. Focus: 2 px vermilion border. Error: 2 px danger border. Placeholder `ink-faint`. DateField has a web variant.

### Rows and Sections
`ListRow`: hairline `rule` bottom divider, 12 vertical padding, optional meta icon and chevron (`forward`, 16, `ink-faint`), pressed at 0.6 opacity. `Section`: optional strong hairline top rule, title and gap 12.

### Marks and Toggles
`CheckCircle`: unchecked `rule-input` outline, checked solid vermilion with white check. `FocusToggle`: 32 pt pill, off is strong-rule outline with muted ink, on is vermilion-soft with `vermilion-on-soft`. `SegmentedControl`: sunken track, selected segment `surface` with hairline `rule`. `Badge`: 4-radius, 1 px outline in tone colour (neutral, accent, success, warning, danger). `ProgressBar`: 3 px track `rule`, ink fill; no vermilion, never labelled as goal progress.

### Bottom Sheet
`surface`, 14 top radius, hairline top border, 36x5 grabber, scrim behind, hairline-topped footer with safe-area padding.

### Icons
One vocabulary in `src/ui/Icon.tsx`: SF Symbols on iOS, Material Symbols on Android and web, one name per meaning (add, edit, close, check, back, forward, expand, routine, task, date, goal, matrix, focus, reflect, account, more, archive, warning, today, measure). Add a name there; never draw glyphs in screens. Default 20, sized to text.

### Matrix Sheet (signature)
`SheetGrid` / `MatrixSheet`: a 9x9 grid of square cells on paper. Heavy 1.5 px ink frame and block separators every 3 cells, `rule` hairlines elsewhere. The centre goal cell is the one warm tint: `accent-soft` fill with centred `accent-on-soft` Mincho, scaled to the cell, identical in light and dark (an ink fill turned into a glaring white block in dark mode). Key-area cells show a caption number (tabular), headline name and a count. Action cells show caption text (3 to 4 lines), a routine or check glyph at 12, and `surface-sunken` on press. Empty positions are an invitation: one grey plus in every empty cell, with only the next key area labelled "Add key area"; never accent, never an error state. Cell size fits the width up to a max, or is fixed.

## Do's and Don'ts

### Do:
- **Do** read colours, spacing, radius and type from `useTheme()` / `tokens.ts`; use `Text` variants rather than raw font sizes.
- **Do** give every control a `MIN_TOUCH` target and an accessible name; icon-only controls take `accessibilityLabel`.
- **Do** keep one primary button per view and spend vermilion only on state or the single action.
- **Do** separate groups with hairlines (`StyleSheet.hairlineWidth`) and 16 to 24 spacing.
- **Do** keep text at 12 or larger and check both light and dark schemes.

### Don't:
- **Don't** wrap content in cards, shadows or tinted panels to create structure.
- **Don't** set vermilion text on `vermilion-soft`; use `vermilion-on-soft`.
- **Don't** use Mincho for rows, buttons or metadata, or ship system-serif display text on purpose.
- **Don't** round matrix cells or apply the 14 or 999 radius to ordinary controls.
- **Don't** label any measure "goal progress"; progress bars show counts honestly in ink.
- **Don't** hand-draw glyph icons or bypass the icon vocabulary.
