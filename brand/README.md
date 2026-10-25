# Brand assets

Two logo sets, drawn from the tokens in `src/app/globals.css` (accent `#C2401C` / dark `#EB6A45`,
ink `#1B1A17`, paper `#F7F5F0`).

| Set | Status |
|---|---|
| `open-window/` | **Live.** A 3×3 grid with a vermilion centre: the goal at the centre of its eight outcomes. |
| `hanko/` | Alternate. A vermilion seal with the same grid, like the stamp in a paper planner. |

Each set folder holds the vector masters and 1024 px store artwork at its top level, plus a
`drop-in/` folder with the files Next.js serves by convention:

| `drop-in/` file | Purpose |
|---|---|
| `src/app/favicon.ico` | 16 / 32 / 48 px, drawn on a 16 px grid so edges stay crisp |
| `src/app/icon.svg` | tab icon; switches to dark-mode colors with `prefers-color-scheme` |
| `src/app/apple-icon.png` | 180 px iOS home-screen icon (iOS rounds the corners) |
| `src/app/manifest.ts` | PWA manifest |
| `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | PWA / Android icons |

## Switching sets

```bash
cp brand/hanko/drop-in/src/app/* src/app/ && cp brand/hanko/drop-in/public/* public/
```

Swap `hanko` for `open-window` to switch back. `brand/` is excluded from TypeScript and ESLint,
so the spare `manifest.ts` copies are never compiled.

The `-small` SVGs are the filled versions for anything under ~48 px. The wordmark is
Fraunces 500 set next to the mark; there's no outlined wordmark file.
