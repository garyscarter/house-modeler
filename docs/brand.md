# Storey brand

The app is called **Storey** (British spelling: a floor of a house, and a nod to the house's story). Write it "Storey", never "Story" or "House Modeler". The built-in house is still "listing 91770873".

## The mark

Three stacked shapes: the roof (a triangle), the first floor and the ground floor (two rounded bars). One source of truth for its shapes and colours: `src/lib/brand.ts` (`MARK`, `markSvg`, `BRAND_TEAL`, ...).

- In React: `<BrandMark size={…} />` (`src/components/BrandMark.tsx`), in `currentColor`. `outline` draws a still, dashed blueprint version for empty states.
- In SVG or HTML strings (exports): `markSvg(BRAND_TEAL)`.
- App icons in `public/` are rendered by `node scripts/make-icons.mjs`; rerun it if the mark changes.
- `server/page.mjs` (passcode page) and `scripts/make-icons.mjs` keep their own copies of the paths because they are plain `.mjs`. Keep them in step with `brand.ts`.
- The wordmark is lowercase **storey** in Bricolage Grotesque at weight 250 with 0.05 em letter spacing, always drawn from outlines, never typed: `<Wordmark height={…} />` in React, `wordmarkSvg(color, height)` in exports, `WORDMARK` paths for canvas. It has two optical sizes, chosen by height (`small` under 40 px). Regenerate with `python3 scripts/make-wordmark.py` (needs `pip install fonttools brotli uharfbuzz`) if the weight or spacing changes; it writes `src/lib/wordmark.json`, which the app and `server/page.mjs` both read.
- Lockup: the teal mark, then the wordmark in ink, with the wordmark's x-height level with the mark. In running text, write the name as "Storey".

## Colour and type

- Brand teal `#0f6e66` (`--brand` in `styles.css`; `--accent` is the same teal). Neutrals: page `#eef0ec`, panel `#fff`, ink `#1d2422`, muted `#5f6864`, lines `#dde1dc`. Use the CSS tokens in the app, never new hex values.
- Display: Bricolage Grotesque (`--font-display`) for headings and the wordmark, used sparingly. UI: IBM Plex Sans. Numbers and codes: IBM Plex Mono.

## Floating chrome

The canvas is full-bleed on every device, and all chrome floats over it.

- The top bar is not a bar: transparent, with pointer events off, and a few **islands** on it (the mark and house menu on the left, the modes in the middle, the layout switch, undo, redo and the palette on the right). An island is `var(--panel)` with a 1px `var(--line)` border, `var(--shadow-card)` and a `var(--pill)` radius, `--island-h` (44 px) tall.
- Everything else that floats (inspector card, tool rail, view cube, plan zoom, coach strip, compare style segment, badges) starts at `var(--float-top)`, which is the islands' height plus the gap, so nothing sits under them. The dock floats at the bottom.
- Horizontal insets use `--inset-l` and `--inset-r` (the 12 px gap, or the device's `env(safe-area-inset-*)` if larger), never a bare `--float-gap`, so nothing hides behind a notch.
- On a phone, chrome fades to 15% while a finger drags or pinches the canvas, and comes back 400 ms after it lifts.
- Cards are solid: `var(--panel)`, `1px solid var(--line)`. There is no translucent or blurred look.

## Loading and busy states

Never show bare "Loading…" text. Use `<Loader>` (`src/components/Loader.tsx`) next to a short plain label:

| Kind | What it does | Where |
|---|---|---|
| `blueprint` | outlines draw in, then fill | waits people watch: startup, the 3D view (40–56 px) |
| `lift` | a light runs up the floors | busy buttons and status lines (14–16 px) |
| `fill` with `progress` (0–1) | the mark fills from the ground up | anything with a real count or percentage; without `progress` it loops |

The loader is decorative (`aria-hidden`); the label says what's loading, and the container has `role="status"`. With reduced motion it becomes a gentle fade.

## Names and files

- Downloads start with `downloadPrefix(slug(houseName(model)))`, e.g. `storey-listing-91770873-report-2026-10-23.html`.
- The browser tab reads "{house} · Storey".
- Exports (report, plan title block) carry the mark and the name.

## Empty states

An empty panel gets the outline mark (`<BrandMark outline size={72} />`) in teal above its heading, a one-line explanation, and one clear button.
