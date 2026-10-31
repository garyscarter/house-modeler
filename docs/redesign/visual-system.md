# A tighter visual system and a cinematic first impression

Status: proposal, not started. Written 31 Oct 2026. Source findings: VIS12, VIS14, VIS13 (the house-render part; hiding the mode bar is a quick win), VIS15 (the type and motion parts of brand.md), the remainder of VIS9 (fixture labels), and review-2026-10's open "Visual system" and "3D view" canvas items (docs/review-2026-10.md lines 74-86: Bricolage only at 18 px and up, card titles, "a ground that fades into the page").

Author: Lana Del Rey (planning). The house is "listing 91770873" throughout.

## Why (the problem, with numbers and evidence)

Counts were taken at HEAD (07e5fa8) across all 35 CSS files under `src/`.

**Type.** There are 20 distinct font sizes in 223 declarations.

| px | uses | px | uses | px | uses |
|---|---|---|---|---|---|
| 12 | 61 | 16 | 12 (+1 `!important`) | 22, 26, 13.5, 9, 17, 18 | 2 each |
| 13 | 49 | 12.5 | 8 | 28, 20, 19, 11.5 | 1 each |
| 11 | 21 | 10 | 4 | | |
| 14 | 18 (+5 in `font:`) | 24, 14.5 | 3 each | | |
| 15 | 17 (+2 in `font:`) | | | | |

- The half sizes (12.5, 13.5, 14.5, 11.5) are all in `PlanningPanel.css`, `ReportPanel.css` and `ReviewPage.css`.
- Bricolage (`--font-display`) shows up below 18 px:
  - the global rule `h1, h2, h3, .summary-line, .display` (styles.css:186) turns every `.panel h3` (15 px), `.review-dialog h3` (15 px) and `.inspector-card-head h2` (15 px, styles.css:227) into Bricolage;
  - `.house-menu-btn` and `.hm-name` set it explicitly at 15 px (HouseMenu.css:4, 25);
  - Inspector.css:48 then sets the card head back to Plex 14. The same element is styled two ways.
- Card headings vary. In desktop-plan-build.png the inspector card has "Build" (Plex 14/600), "Rooms, walls…" (12), "Kitchen (galley)" (Bricolage 18, `.stat-title`, Inspector.css:60) and "Shape & size" (14/600). In desktop-3d-garden.png "Garden" is 15 while the item title is 13 bold.
- Font weights in use: 400 ×7, 500 ×18, 600 ×46, 700 ×8.
- SVG plan text is sized in TS, not CSS: 41 `fontSize` sites in 11 files (plan layers, `StairsSymbol`, `ElectricGlyph`, `SiteLayers`, `plan/chrome/EdgeLengthInput.tsx`, `core/components.tsx`, `PlanEditor.tsx`). Examples: `px * 13 * 1.2` and `* 0.82` in `Rooms.tsx`, `px * 13 * 0.85` in `Fixtures.tsx`, and `px * 8/10/11` in `Electrics.tsx`.

**Radii.** There are 10 raw values beside the four tokens (`--radius-s` 6, `--radius` 10, `--radius-l` 14, `--pill`).

| Value | Uses | Where |
|---|---|---|
| 4px | 13 | inputs, tags, keycaps, `.room-label` |
| 6px | 8 | raw copies of `--radius-s` |
| 0 | 3 | keep (square corners; also inside composites like `.kit-chip`'s `0 var(--radius-s) var(--radius-s) 0`) |
| 8px | 4 | `.icon-btn`, `.piece-row` and `.piece-form`, a cmdk item |
| 12px | 2 | CommandPalette.css:16 and :94 |
| 10px | 2 | Dialogs.css:10, `.rv-count` |
| 999px | 2 | should be `--pill` |
| 20px, 5px, 3px, 2px, 1px | 1 each | |
| `16px 16px 0 0` | 1 | the phone sheet, mobile.css:23 |
| `var(--radius-s, 6px)` | 1 | a stale fallback |

**Motion.** There are 12 ad-hoc transitions: 0.12s, 0.14s ease, .15s, .2s, .25s, .25s ease-out and `.25s cubic-bezier(.2,.8,.2,1)`.
- The only entrance animation is `walk-hint-in` (walk.css:50).
- Popovers (`.popover`, styles.css:230), menus, cards, the palette and modals appear in one frame.
- Six files have their own `prefers-reduced-motion` block. No shared rule covers them.

**First impression.**
- desktop-welcome.png: a white card on `--bg`, and two line footprints are the only pictures. There is no house.
- phone-welcome.png: the second tile is cut off at 844 px, so the page has to scroll (Welcome.css:42 makes `main` scroll).
- phone-3d-build.png: the first 3D frame is a blank page that says "Preparing the 3D view" for several seconds while shaders compile.

**3D canvas.**
- At HEAD the home pitch is 35° (`HOME_ELEVATION_DEG`, cameraViews.ts:81) and the fov is 45 (Viewer.tsx:203). The quick win lowers the pitch to about 25°.
- Even at 25°, no sky shows in the home view. With a vertical fov of 45 the top ray is 25 − 22.5 = 2.5° *below* the horizon, and with a fov of 35 it is 7.5° below.
- What fills the top of the frame (desktop-3d-build.png) is therefore far ground in fog. The fog colour is the backdrop horizon `#e2e9f0` (`DAY_BACKDROP`, Lighting.tsx:324; Quiet fog 60–220 m, `QUIET_FOG`, :333), over a ground toned only 20% towards the page (`GROUND_TONE`, Site.tsx:768). It reads as a pale lime band that is neither the sky nor the page.
- Contact darkening where the house meets the ground comes only from N8AO (Effects.tsx:51), which runs only at High quality. With the quick win's `auto` quality, phones and tablets render Balanced, so the house floats.
- Boundary walls already get a contact strip (Site.tsx:695-751). The house does not.

**Plan.**
- There are about 120 raw hex literals in `src/editor/**/*.tsx` (17 files). Two kinds:
  - **inks** (this spec): `#111` and `#374151` for room labels (Rooms.tsx:98, 103), canopy cyans `#0e7490` and `#155e75` (Canopies.tsx), pink `#db2777`, measure purple `#7c3aed` and draw green `#16a34a` (Overlays.tsx, Walls.tsx:110), `INK #1f2937` and `SELECTED #d97706` (OpeningSymbol.tsx:7-8), LockGlyph's inks;
  - **data colours** (stay as they are): the door's own colour `o.color ?? "#b3202e"` (OpeningSymbol.tsx:105, 178; this is the "red garage door"), a wall's `w.color` (Walls.tsx:67), paint and plant swatches in `GardenSymbol.tsx`, `DecoratePanel.tsx`, `Inspectors.tsx`, `site/GardenInspectors.tsx`.
- Only 7 `--plan-*` tokens exist (PlanEditor.css:5-11).
- Line weights and inks do not follow one hierarchy. Walls, fixtures, stairs, the canopy hatch and the red garage door all compete (desktop-plan-build.png).

**Already done (not in this spec).**
- Every item in docs/visual-review-2026-10.md is built. Spot checks: `FixtureThumb` (AddItem.tsx), `RoundedBoxGeometry` soft parts (Fixtures.tsx), `brick-top` and `breakUp(` (siteTextures.ts, Site.tsx), `cone8`/`cylLo` (SiteItems.tsx), plan `SurfacePatterns` (SiteLayers.tsx:26), and the wall contact strip.
- The `--muted #5f6864` fix is in, and the input focus ring is visible (styles.css:196).
- Photo pins are gone from `src/three`.
- Rooms.tsx:102 already hides the area line when the room is under 60 px on screen.
- Fixtures.tsx:160 already prints only a custom `fx.label`, never the catalogue name.
- Not done and out of scope here: review-2026-10's "auto-collapse the card in side by side and wipe" and the overlay legend (one-renderer-compare.md).

## Goal and non-goals

Goal:
- **One type scale**: 6 UI sizes plus 1 display size, all as tokens. Bricolage only at 18 px and up. One rule for card titles.
- **One radius set**: 5 tokens. Raw `px` radii are gone.
- **One motion language**: 3 durations and 3 easings. Entrances for popovers, menus, cards, modals and the sheet. Chrome fades while orbiting on desktop. One reduced-motion rule.
- **A cinematic Welcome**: a real still of the house fills the screen behind the two tiles, on phone and desktop. The same still is the poster while the 3D view prepares.
- **A calmer 3D canvas**:
  - a seamless "studio sweep" where the ground fades into the page colour;
  - sky only where the camera can actually see it;
  - contact darkening under the house at every quality.
- **A plan hierarchy**: four inks and tokenised text, with no raw hex in plan layers.
- **Lint guards**: tests that keep all of the above from drifting.

Non-goals:
- New colours or a new brand. docs/brand.md stays the source of truth.
- Layout or chrome changes beyond the Welcome screen. Those belong to phone-shell.md and modes-and-top-bar.md.
- New render features: no bloom, no SSR, no HDRI download.
- Changing the Walk HUD.

## Decisions already made (by the owner; do not reopen)

1. **Phones are for showing, walking and measuring**, plus light Decorate and Furnish edits. Build, Electrics, Garden and Plot are view-only on phones.
2. **The devices that matter** are the iPhone (390×844) and laptop/desktop (1440×900, 1920×1080). iPad must keep working but is not optimised for.
3. **The look** is a full-bleed canvas with floating chrome everywhere, in the same brand (docs/brand.md). There is no Glass look.
4. **Quick wins are being built now.** This spec is for later.

## Assumptions (including which quick wins have landed)

Landed at HEAD (merges a809222 and 07e5fa8):
- Glass is gone and the canvas is full-bleed. The top bar is islands (`--island-h` 44, `--float-top`).
- There is one three-way LayoutSwitch.
- The phone sheet has a `hidden` detent.
- `canEdit` gates editing.
- `useGestureFade` (src/components/useGestureFade.ts) sets `data-gesture` on `.app` directly on the DOM, on phones only (mobile.css:52-59).

Assumed to land before this starts (they are being built in parallel):
- **Mode bar and coach.** No mode bar on the Welcome screen. The coach strip is one line.
- **Dock.** The dock holds Measure, Show, Cameras and Capture. The phone gets a 44 px compass in place of the view cube.
- **Render quality.** `useQuality()` resolves `auto`: Balanced on phones and tablets, High on desktop. Balanced uses DPR 1.25. three.js has its own chunk.
- **Home view and site.** The home camera sits at about 25°. Neighbours are darker. The listing image is off by default.
- **Plan labels.** The ft² line is gone and edge chips are clamped.
- **CSS colours are on tokens.** This spec does **not** assume the same for the TSX hex values in `src/editor`.
- **Code tidy-ups.** Inspectors.tsx is split by subject. NumberField replaces raw inputs. CI runs `npm run check` and `npm run build`.
- **Line numbers will move.** Builders re-grep by selector and value; the tables below are keyed by selector, not by line.
- **The review screenshots predate the quick wins** (they still show "View", "Compare: Single" and the coach card). Builders take fresh baselines before starting.
- **`scripts/shoot-chassis.cjs` shoots phone and iPad only** at HEAD (no desktop sizes, no CLI flags; `PORT` and `OUT` env). Chunk A adds desktop sizes (below).
- **Quiet canvas is the default** (`usePanelPrefs.quiet: true`, panelPrefs.ts:43, persisted). Full keeps today's look.
- **Space for the Welcome.** With the mode bar hidden, the Welcome screen shows only the left island (mark and house menu). Undo and redo are disabled there anyway.

## Design (what the user sees and does, per chassis: phone, desktop; iPad notes; every state: empty, selected, busy, error; before/after sketches in ASCII where they help)

### (a) Type scale and radii

Tokens go in `:root` in styles.css. Line heights: `--lh-tight 1.2` for titles and `--lh 1.4` for body.

| Token | px | Font and weight | Used for |
|---|---|---|---|
| `--fs-xs` | 11 | Plex 500/600; caps with 0.07em tracking for eyebrows | eyebrows, table heads, keycaps, units, legends, tags |
| `--fs-s` | 12 | Plex 400/500 | secondary text, hints, chips, field labels, captions |
| `--fs-m` | 13 | Plex 400/500 | card body, controls, rows, buttons in cards |
| `--fs-base` | 14 | Plex 400/600 | default body (`:root`), section heads in cards, desktop inputs |
| `--fs-l` | 16 | Plex 400/600; Mono for big values | touch inputs (stops iOS zoom), Review page body, emphasised numbers, Welcome lede |
| `--fs-xl` | 20 | **Bricolage** 600, tracking −0.01em | the selected object's title in a card, modal titles, empty-state h2, the Review bar title |
| `--fs-2xl` | 28 | **Bricolage** 600, tracking −0.015em | Welcome title, house picker title, Review tile numbers |

Rules:
- **Bricolage only at `--fs-xl` and up.** The global rule becomes `h1, .display { font-family: var(--font-display) }`. Every other heading is Plex.
- **Weights: 400, 500 and 600 only.** Every 700 becomes 600. The 700 inside the SVG plan's pink badge (Overlays.tsx:22) also becomes 600.
- **Card title rule** (inspector card, panels, the sheet):
  - **eyebrow**: the mode or section name, `--fs-xs` 600 caps, `--muted`;
  - **title**: the selected thing, `--fs-xl` Bricolage, with its key value right-aligned in Mono `--fs-l`;
  - **section head**: `--fs-base` 600 Plex;
  - **label**: `--fs-s` `--muted`;
  - **body**: `--fs-m`.
  - With nothing selected the card shows only the eyebrow and the mode's one-line summary (`--fs-m` `--muted`). No second heading.

Card head, before and after (desktop inspector, a room selected):
```
BEFORE                                 AFTER
Build                (Plex 14/600)     BUILD · ROOMS                (11 caps, muted)
Rooms, walls, doors and stairs (12)    Kitchen (galley)      5.2 m² (Bric 20 | Mono 16)
Kitchen (galley)  5.2 m² (Bric 18)     Shape & size                (Plex 14/600)
56 ft²                                 Size on this plan           (12 muted)
Shape & size         (Plex 14/600)
```

Mapping from current sizes to tokens. The builder re-greps; these groups cover every one of the 223 declarations at HEAD.

| Current | Selector groups (files) | Token | Note |
|---|---|---|---|
| 9 | `.view-cube` face letters (ViewCube.css:15, 33) | exempt | Glyph inside an 84 px cube. Moves to the `--cube-glyph: 9px` local var with a `/* glyph */` comment. The cube is desktop-only after the quick wins. |
| 10 | `.pl-*` tag (PlanningPanel.css:27), `.rp-tag`, `.gap-note`, `.site-dial .dial-l` | `--fs-xs` | +1 px |
| 11, 11.5 | `kbd.keycap`, `.hm-group h3`, `.rp-areas thead th`, `.electrics-counts thead th`, `.room-label span`, `.measure-label span`, `.walk-lens small`, `.sun-legend-scale`, `.rp-warn` (11.5) and the other 21 | `--fs-xs` | |
| 12, 12.5 | all 61 at 12 (Inspector.css 17, PlanEditor.css 7, SunControls.css 6, styles.css 6, …), plus `.pl-wing`, `.pl-rule`, `.pl-row-head`, `.rp-cost`, `.rp-notes dt/dd`, `.pl-ref` at 12.5 | `--fs-s` | |
| 13, 13.5 | all 49 at 13 (`.panel h4`, `.garden-row`, `.instruction`, `.compare-style button`, `.hm-row`, …), plus `.rp-cost-total` and `.review-page .rp-warn` at 13.5 | `--fs-m` | |
| 14, 14.5 | `:root`, `button.big`, `.cmdk-*` rows, `.house-picker-lede`, `.house-opening`, `.app[data-touch] .edge-input` and `.picker-rows button`, `.sl-table`, `.stat-value`, `.site-gaps b`, `.sheet-title h2`, `.pl-headline` (14.5) | `--fs-base` | |
| 14 (Review page) | `.review-page .small`, `h4`, `.rp-sub`, `.rv-tile-detail`, `.rp-table td`, `.rp-areas .rp-floor th`, `.rp-export .row button`, `.pl-verdict .small`, plus `.review-page .pl-wing/.pl-rule` (14.5) | `--fs-base` | The Review page keeps two reading sizes: base for detail, l for body. |
| 15 (cards, panels) | `.inspector-card-head h2`, `.panel h3`, `.review-dialog h3`, `.decor-head`, `.sl-garden`, `.house-menu-btn`, `.hm-name`, `.house-picker-name` | `--fs-base` 600 Plex | These lose Bricolage. The card head becomes the eyebrow (`--fs-xs`) per the card title rule. |
| 15 (Review page, Welcome) | `.review-page` body (ReviewPage.css:3), `.rp-table`, `.rp-check p`, `.rp-changes li`, `.rp-cost`, `.rp-money input`, `.rp-notes`, `.pl-section h4`, `.pl-row-head`; `.welcome-lede`, `.welcome-title` | `--fs-l` | Reading pages go up 1 px. |
| 16 | every `.app[data-touch] … input` rule (Dialogs, Modal, CommandPalette, PlanEditor, SiteEditor, styles.css:284, 304), `.ctx-sheet button`, `.rv-tile`, `.rp-grand td`, `.sv-review-view h3`, `.stat-row b` | `--fs-l` | Touch inputs must stay at 16 px exactly (iOS zoom). The `!important` at styles.css:304 stays. |
| 17 | `.review-page .pl-headline`, `.rp-cost-total` | `--fs-l` 600 | |
| 18, 19 | `.stat-title` (Bricolage), `.panel-problem h3`, phone `.rv-bar h1`, ReviewPage.css:43 | `--fs-xl` | |
| 20, 22 | `.modal-head h2`, `.review-page .rv-bar h1`, phone `.house-picker h1` | `--fs-xl` | |
| 24 | `.empty h2` | `--fs-xl` | Empty states are quiet. |
| 24, 26, 28 | `.rv-tile-value`, `.house-picker h1`, `.welcome h1`, phone `.welcome h1` | `--fs-2xl` | |
| 26 | `.review-page .rv-close` (a "×" character) | exempt | Becomes an SVG icon button, 20 px glyph (Review chunk). |

SVG plan text (TS): a new `PLAN_FS` constant in `src/lib/typeScale.ts` uses the same scale. Each value is multiplied by `px` as now.

| Plan text | Now | Token value |
|---|---|---|
| Room name | 13 | `m` 13 |
| Room area | 10.7 | `xs` 11 |
| Fixture label | 11.05 | `xs` 11 |
| Edge chip, measure | 13 | `xs` 11, Mono |
| Canopy name and size | 13 / 10.7 | `s` 12 / `xs` 11 |
| Electrics number | 11 | `xs` 11 |
| Electrics link text | 8–10 | `xs` 11, or hidden below zoom 1 |
| Lock glyph | — | 10, as a glyph |
| Handle badge (Rooms.tsx:12) | 15.6 | `l` 16 |

Radius set. The scale is `--radius-xs 4`, `--radius-s 6`, `--radius 10`, `--radius-l 14`, `--pill 999px`, plus `50%` for true circles.

| Current | Token |
|---|---|
| 1, 2, 3, 4, 5 px (inputs, tags, keycaps, strips, legend bar) | `--radius-xs` |
| `.sheet-handle` 2 px | `--pill` |
| 6 px, `var(--radius-s, 6px)` | `--radius-s` |
| 8 px (`.icon-btn`, `.piece-row/form`, cmdk item) | `--radius-s` |
| 10 px (Dialogs, `.rv-count`) | `--radius`; `.rv-count` becomes `--pill` |
| 12 px (cmdk panel, CommandPalette.css:94) | `--radius-l` |
| `16px 16px 0 0` (sheet) | `var(--radius-l) var(--radius-l) 0 0` |
| 20 px (SiteEditor.css:47 pill) and 999 px | `--pill` |
| `50%` (19 uses) | keep |

- **Phone:** the same tokens. No phone-only sizes except the touch-input 16 px rule.
- **iPad:** no change.

### (b) Motion language

Tokens in `:root`:

| Token | Value | Used for |
|---|---|---|
| `--dur-1` | 120ms | hover, press, colour, focus ring |
| `--dur-2` | 180ms | popover, menu, coach strip, toast and card entrances; chrome fade out |
| `--dur-3` | 260ms | sheet detents, modal, Welcome image fade, chrome fade back |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | everything that enters (the sheet's current curve) |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | fades out |
| `--ease-move` | `cubic-bezier(.4,0,.2,1)` | things that move while on screen (sheet height, wipe handle) |

Rule: **entrances animate, exits are instant.** React unmounts popovers, so there are no exit animations to build. Exits feel snappy, and nothing lingers over the canvas. The exceptions are opacity fades of persistent chrome and the sheet's height.

| Element | Entrance |
|---|---|
| `.popover` (all users: View/Show, Cameras, Capture, compare segment, Info, ImageOptions, AddItem, HouseMenu) | fade in plus a 4 px rise from the anchor side (`pop-up` rises from +4 px, `pop-down` drops from −4 px), `--dur-2 --ease-out` |
| `.rail-pop`, `.add-pop` (rail flyouts) | fade in plus a 4 px slide from the rail (x −4 px) |
| `.ctx-menu` | fade in plus `scale(.98)` from the pointer corner, `--dur-2` |
| `.cmdk-panel` | fade in plus an 8 px drop; the backdrop fades over `--dur-2` |
| `.modal` and dialogs | backdrop fade `--dur-2`; panel rises 8 px over `--dur-3`. On phone the bottom-sheet modal rises from 100%. |
| `.inspector-card` | Only when it appears (first selection, or uncollapse): fade and 4 px rise. **Never** when its content changes, so fast picking doesn't flicker. |
| Coach strip, save notice, walk hint | fade and 4 px rise; the coach strip leaves with an `--dur-2` fade (its own timer) |
| Phone sheet | `hidden → peek`: translateY(100% → 0) over `--dur-3`; peek, half and full keep the height transition, with tokens |
| Welcome | The still fades in over `--dur-3` once loaded. Tiles rise 8 px, staggered 40 ms. |

Implementation detail that matters: `.popover.pop-center` already uses `transform: translateX(-50%)` (ViewMenu.css:10). The keyframes animate the individual `translate` and `scale` properties, so they compose with `transform` and do not fight it:
```css
@keyframes enter { from { opacity: 0; translate: var(--enter-x, 0) var(--enter-y, 4px); scale: var(--enter-scale, 1); } }
.popover, .rail-pop, .ctx-menu, .cmdk-panel, .coach-strip, .save-notice { animation: enter var(--dur-2) var(--ease-out) both; }
.popover.pop-down { --enter-y: -4px; }
```

**Chrome fade while orbiting (desktop and tablet).** Today `useGestureFade` returns early unless `chassis === "phone"`. It becomes one hook for every chassis:
- **Phone:** unchanged. Any drag or pinch on the canvas or drawing fades chrome to 0.15.
- **Desktop and tablet:** only a drag that starts on the **3D canvas** (an `HTMLCanvasElement` inside `.viewer`, not the plan or site SVG, where you watch the card's live numbers) and moves more than 8 px. It sets `data-gesture="orbit"`.
  - The inspector card, dock, coach strip, compass or view cube, and sun panel fade to **0.35** with `pointer-events: none`. The top islands stay: they never cover the house.
  - Wheel zoom and trackpad pans do not fade.
  - Walk does not fade (the walk HUD is its own chrome). The hook skips when `.walk-bar` is mounted.
- Fade out: `--dur-2 --ease-in`. Back: `--dur-3 --ease-out`, 250 ms after release on desktop and 400 ms on phone, as now.
- The attribute is still written straight onto `.app`. There is no React state and no store write.
- Why pointer events and not OrbitControls `start`/`end` (VIS14's idea): three-stdlib's OrbitControls fires `start` on every wheel tick and on a plain click, so the chrome would flicker on zoom and on select. The pointer hook already has the 8 px threshold.
- **iPad:** touch drags keep today's behaviour (no fade on tablet; the hook's touch path stays phone-only). A mouse or pencil on iPad gets the orbit fade.
- **Phone landscape:** same as phone portrait (chassis is still `phone`).
- **Keyboard:** keyboard orbit and focus never fade anything.
- **Compare:** works in Side by side and Wipe (both canvases are inside `.viewer` or `.wipe`).

**Reduced motion.** One block in styles.css replaces the six per-file ones, except the loader's (styles.css:53-59, which swaps to a pulse) and Viewer's JS `reducedMotion()` for camera glides:
```css
@media (prefers-reduced-motion: reduce) { :root { --dur-1: 0ms; --dur-2: 0ms; --dur-3: 0ms; } }
```
- Chrome still fades while orbiting, but instantly, because opacity is not motion.
- The Welcome drift (below) is off.

### (c) Welcome: a real still of the house

What the user sees on **desktop (1440×900, 1920×1080)**:
```
BEFORE                                         AFTER
┌[■ storey | House ▾]──[Build Decorate …]──┐   ┌[■ storey | Listing 91770873 ▾]───────────┐
│                                           │   │░░░░ still of the house, full bleed ░░░░░░│
│         ┌──────── white card ────────┐    │   │░░░░ home view, studio sweep,     ░░░░░░░░│
│         │        (outline mark)      │    │   │░░░░ soft afternoon sun           ░░░░░░░░│
│         │     Listing 91770873       │    │   │░░░░        [ the house ]         ░░░░░░░░│
│         │  ┌────────┐ ┌────────┐     │    │   │▒▒▒▒ scrim rises from bottom 45% ▒▒▒▒▒▒▒▒▒│
│         │  │ plan   │ │ plan   │     │    │   │ Listing 91770873             (Bric 28)   │
│         │  └────────┘ └────────┘     │    │   │ See the house in 3D, then plan…  (16)    │
│         └────────────────────────────┘    │   │ ┌────────────┐ ┌────────────┐            │
│                                           │   │ │ plan  thumb│ │ plan  thumb│ Open       │
└───────────────────────────────────────────┘   │ │ As listed  │ │ Extension  │ layouts…   │
                                                │ └────────────┘ └────────────┘            │
                                                └──────────────────────────────────────────┘
```
- **The still.** It is the As listed house at the home view, rendered at High quality in the studio sweep (d), with the house framed in the upper 55% of the frame. It is shown with `object-fit: cover` and an `object-position` taken from the house's focal point.
- **The scrim** is `linear-gradient(to top, var(--bg) 0, color-mix(in srgb, var(--bg) 85%, transparent) 30%, transparent 55%)`, so the title and tiles sit on page colour while the house stays clear.
- **The content block** is left-aligned, its left edge on `--inset-l` plus 24 px, its bottom 32 px above the viewport bottom, max-width 720.
  - The tiles keep their solid `--panel` cards and their footprint drawings. The footprints explain the difference between the layouts (the extension in teal); the still shows the house.
- **The outline mark** leaves the Welcome. The mark is already in the top-left island.
- **Drift.** The still scales 1.00 → 1.04 over 24 s, once, with `transform` on the `<img>` only. It is off under reduced motion.

**Phone (390×844).** Everything fits without scrolling.
```
BEFORE (scrolls)              AFTER (fits 844)
┌[■ House ▾]────────────┐     ┌[■ Listing 91770873 ▾]┐  56
│┌─────────────────────┐│     │░░░ still (tall crop) │
││   (outline mark)    ││     │░░░  house upper half │
││  Listing 91770873   ││     │░░░                   │
││ ┌─────────────────┐ ││     │▒▒▒ scrim ▒▒▒▒▒▒▒▒▒▒▒▒│ ~470
││ │      plan       │ ││     │ Listing 91770873 (28)│
││ │ house as listed │ ││     │ See the house in 3D… │ ~550
││ └─────────────────┘ ││     │┌──┬────────────────┐ │
││ ┌─────────────────┐ ││     ││▢ │As listed  119m²│ │ 88
││ │      plan  …    │ ││     │└──┴────────────────┘ │
└┴─┴─────────────────┴┴┘     │┌──┬────────────────┐ │
                              ││▢ │Extension  146m²│ │ 88
                              │└──┴────────────────┘ │
                              │    Open layouts…     │ 44
                              └──────────────────────┘ ≤ 810 + safe area
```
- The phone tiles become rows: a 96×64 footprint on the left, then title and caption. Each row is 88 px high, which is at least the 44 px touch target.
- The still uses the tall crop.

**Phone landscape (844×390).** It cannot fit; do not try.
- Wide crop; the content block sits in the left 55% with the two rows stacked; `.welcome` scrolls inside itself (not `main`) if the rows overflow.
- Check it in the acceptance shots; nothing else is optimised.

**iPad.**
- Portrait uses the tall crop and the phone layout with a 560 px column.
- Landscape uses the desktop layout.
- Nothing iPad-specific is built.

**States.**

| State | What shows |
|---|---|
| Loading | The 32×20 placeholder from `meta.json` is inlined as a data URL. It paints in the first frame, upscaled with `filter: blur(24px)` and `scale: 1.1`. The full still fades in over `--dur-3` on `load`. There is no spinner: the page is usable at once. |
| Busy (tile pressed) | As now: `<Loader kind="lift">` "Opening" over the tile. The other tile is disabled. |
| 3D preparing (new) | After a tile is pressed, and on every cold start into 3D, `.viewer-loading` shows the same still behind its `<Loader kind="blueprint">` "Preparing the 3D view", blurred 8 px with a 30% `--bg` wash. It shows in both waits: App.tsx's `Suspense` fallbacks (lines 195-200 and 279-284, while the three.js chunk downloads) and Viewer.tsx:192 (while shaders compile), so there is no blank frame between them. When shaders compile it cross-fades out over `--dur-3`. Framing differs a little by aspect; the blur makes that read as a focus pull. In Wipe, each half's poster clips with its `.viewer-loading` (Wipe.css:8-9). The poster is always As listed, even when Proposed is opening; under the blur that is acceptable. "Restoring the 3D view" (context lost) shows it too. |
| Empty (house has no still, e.g. `_template` or a new house) | **Fallback**: the house's `Footprint` drawn large (cover-fit) in `--line` strokes on `--bg`, with a soft radial `--surface-3` glow behind it. This costs 0 bytes, and the layout is the same as with a still. |
| Error (the image fails to load) | `onError` switches to the fallback silently. The console logs once in dev. |
| Reduced motion | No drift, no fade, no stagger. |

**How a still is made: a prebuilt asset (recommended).**
- A new script, `npm run house:hero -- <id>` (scripts/house/hero.mjs), uses the same plumbing as `house:shot`: its own Vite server with `VITE_HOUSES=<id>`, and `launchBrowser`.
- Steps:
  1. Open the As listed tile.
  2. Set `settings.quality = "high"` and Quiet canvas on, with the **sun study off**. With the sun study on, `SkyBackdrop` swaps the gradient dome for the physical sky (Lighting.tsx:375-395), so the still would lose the sweep. The default key light is what a first-time visitor sees in 3D anyway.
  3. Set `data-still` on `.app`, which hides every chrome element (one CSS rule).
  4. Press Home.
  5. Wait for compile plus 6 s.
  6. Screenshot the canvas at **1600×1000** (wide) and **900×1400** (tall) viewports.
  7. Encode to WebP in the page: pass the PNG bytes in with `page.evaluate`, then `createImageBitmap` → `OffscreenCanvas.convertToBlob({ type: "image/webp", quality: 0.72 })`, and return the bytes. No new dependencies.
  - Not `captureAt()` (src/three/capture.ts:74): it skips post-processing, so the still would lose N8AO, and it does not re-frame for the tall aspect.
  8. Make the 32×20 placeholder the same way.
- Output:
  - `src/houses/<id>/assets/hero-wide.webp` and `hero-tall.webp`;
  - in `meta.json`: `"hero": { "placeholder": "data:image/webp;base64,…", "focus": [0.5, 0.38], "preset": "<main preset id>", "version": <main preset version> }`.
- **Budget**: wide ≤ 140 KB, tall ≤ 110 KB, placeholder ≤ 600 B. A device downloads one size (`<picture>` with `media="(orientation: portrait)"`). The repo grows by about 250 KB per house.
- **Alternatives considered** (open question 1):
  - **Render at first load.** It needs the three.js chunk and a shader compile before the Welcome can paint. That is exactly the wait the still is meant to hide, and it would cost about 2–8 s on phones.
  - **Blurred plan only.** This is the fallback above, and it is not cinematic.

**/eras-tour.** In `.claude/skills/eras-tour/SKILL.md`:
- **"Reputation: checks, and the choice"**, after step 2 (screenshots): "Make the Welcome still: `npm run house:hero -- <id>`. Read `hero-wide.webp` and check that the house is centred, the front is lit and no chrome shows. Commit 'Add the <id> Welcome still'."
- **Fidelity pass**: "Re-run `house:hero` after each tier (the preset version changes)."
- **Soundcheck**: `npm run soundcheck` warns (it does not fail) when `meta.json`'s `hero.version` is behind the main preset's version, or when a house has no still.

### (d) The 3D canvas

**Studio sweep, not a painted sky, in the home view.**
- At a 25° pitch the camera cannot see the horizon (see Why).
- So the default canvas is an architectural-model look: the plot sits on a ground that fades radially into the page colour, and the backdrop horizon and lower dome are the page colour too.
- The top of the frame therefore matches the `--bg` that the islands float on. The canvas edge disappears and the house is the only object.
- The fade runs from `R0` (the plot's bounding radius plus 8 m) to `R1 = R0 + 35 m`, done in the ground shader as distance from the plot centre, not from the camera. Inside `R0` the ground keeps today's toned grass.
  - The ground is a lit `MeshStandardMaterial`, so the mix goes at the **end** of the fragment (after lighting, before `tonemapping_fragment`), to the same pre-tone-map sweep value as the dome. Mixing the albedo would leave a lit, darker ring.
  - The no-plot fallback ground (Site.tsx:42, `QUIET_FALLBACK_GROUND`) gets the same fade, centred on the house.
- Fog is kept for neighbours and the far ground, with its colour set to the sweep colour. **Its distances stay as they are** (`QUIET_FOG` 60–220 m). three.js fog is measured from the camera, not the plot, and the home camera sits 30–60 m from the house, so a fog that starts at `R0` would fog the house itself. The radial ground fade does the work; fog only mops up beyond `R1`.
- **Sky** appears only when the camera can see it:
  - the backdrop's upper half keeps a soft blue gradient (`DAY_BACKDROP[0]` to the sweep colour at the horizon);
  - it shows when the user orbits low, in Cameras' front, side and rear elevations, and in Walk;
  - with the sun study on, the physical sky takes over as today.
- **Colour matching.** The backdrop shader runs through `tonemapping_fragment` (Neutral, Viewer.tsx:200). The sweep colour is therefore stored as the *pre*-tone-map value that comes out as `#eef0ec`. `sweepInput()` in `canvasLook.ts` computes it once with a tested inverse of three's Neutral curve.
  - At High the composer does the tone mapping instead (`ToneMapping` NEUTRAL, Effects.tsx:55; three skips `tonemapping_fragment` when drawing into a render target). Same curve, so the same input works, but the acceptance checks sample both Balanced and High. The exposure effect before it (Effects.tsx:24) must be 1 outside Walk, or the sweep shifts.
- The Quiet/Full canvas pref (`usePanelPrefs.quiet`) stays. Full keeps today's look.

Canvas, before and after:
```
BEFORE (desktop-3d-build)              AFTER
┌───────────────────────────────┐      ┌───────────────────────────────┐
│▓▓▓ pale lime far ground ▓▓▓▓▓│      │ page colour (#eef0ec)          │ ← islands float on the same tone
│▓▓ white neighbour ▓  house ▓▓│      │      ░ grey neighbours ░       │
│▓▓  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (floats) ▓│      │   ░░░[ house ]░░░  ← contact   │
│ road ▓▓▓▓▓▓▓ plot ▓▓▓▓▓▓▓▓▓▓ │      │    ░░ plot ░░░░       shadow   │
└───────────────────────────────┘      │ ground fades to page colour    │
                                       └───────────────────────────────┘
```

**Contact darkening.**
- A baked footprint shadow under the house at **every** quality.
  - The ground-floor outline (all `roomWorldPolygon`s of the lowest floor, unioned by drawing) is drawn into a 256² canvas, filled black, `ctx.filter = "blur(Npx)"` with N equal to 0.5 m in texels.
  - It lies on one quad at `GROUND_Y + 0.008`, padded 1 m.
  - Material: `MeshBasicMaterial` with black colour, alpha map, `depthWrite: false` and polygon offset, the same recipe as `contactShadowMaterial` (Site.tsx:750).
  - Opacity 0.35 at Balanced and Low, 0.18 at High (N8AO adds its own).
  - It is rebuilt only when the lowest floor's polygons change (memo key: the polygon hash).
- Neighbour masses get the same, at 0.2 opacity, built from their footprints.
- Shadows: the sun's PCF shadows are unchanged. The key light keeps `castShadow`. Neighbours keep casting onto the house and garden (the review's verifier kept this for the sun and shade study; the quick win only darkens them).
- The baked contact shadow is static, so it shows the same under the sun study and at night; at night (sun below `NIGHT_ALTITUDE`) its opacity halves so lit rooms are not ringed in black.

**Plan hierarchy (Build, Decorate, Furnish, Electrics).** There are four inks, from strongest to weakest:

| Level | What | Token (in the PlanEditor.css scope) | Value |
|---|---|---|---|
| 1 | walls (poché), selection | `--plan-wall`, `--plan-sel` | `--text`, `--accent` (2 px) |
| 2 | openings, door swings, stairs, room labels | `--plan-line`, `--plan-label` | `--text` at 1 px, `--text` |
| 3 | fixtures, canopy hatch, area text | `--plan-fixture`, `--plan-fixture-fill`, `--plan-canopy`, `--plan-label-sub` | `--muted` 0.75 px, `--surface-2`, `color-mix(--accent 35%, transparent)` hatch, `--muted` |
| 4 | dims and chips, grid, the listing image | `--plan-dim`, `--plan-chip-bg` | `--accent` ink on `--panel` |
| — | warnings (clash) | `--plan-warn` | `--danger` |
| — | tool inks while a tool is live (measure, draw, the pink knock-through badge) | `--plan-measure`, `--plan-draw`, `--plan-badge` | keep today's hues (`#7c3aed`, `#16a34a`, `#db2777`) as tokens; they are transient, so they may out-shout level 1 |

- **Data colours stay.** A door's own colour (`o.color`, the red garage door included), a wall's `w.color`, paint and plant swatches are the user's data, not inks. Only their hard-coded fallbacks move to tokens. The garage door keeps its colour but is drawn at level-2 weight. (The original draft made it a grey line; that would lose the door colour on the plan.)
- **Labels.** The room name is `PLAN_FS.m` 600 in `--plan-label`. The area is `PLAN_FS.xs` in `--plan-label-sub`, still hidden under 60 screen px (already built, Rooms.tsx:102).
- **Fixture labels** (custom `fx.label` only, Fixtures.tsx:160) show only when the fixture is selected or the zoom is above 1 (the remainder of VIS9; the verifier's figure, tune by eye).
- Every ink hex in the plan and site layers becomes `var(--plan-*)` or `var(--site-*)` (`fill="var(--plan-handle)"` already works in Rooms.tsx:12). `#fff` halos and the opening "cut" fills become `var(--plan-paper)`.
- **Phone:** the same hierarchy. Labels are already sized in screen px.
- **States** follow the rule "selection is the only teal fill": hover is a 1 px `--plan-sel` stroke at 50%, the selection is `--plan-sel-soft` fill with a 2 px stroke, and an error or clash uses `--plan-warn` hatch.

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

**Tokens and CSS**
- `src/styles.css` `:root`:
  - add `--fs-xs … --fs-2xl`, `--lh-tight`, `--lh`, `--radius-xs`, `--dur-1..3`, `--ease-out/in/move`;
  - add the `@keyframes enter` and the one reduced-motion block;
  - change line 186 to `h1, .display`;
  - set `font-size: var(--fs-base)` on `:root`.
- Every CSS file under `src/` is swapped to tokens per the tables above.
- `docs/brand.md` gets "Type", "Motion" and "Welcome still" sections (VIS15).

**`src/lib/typeScale.ts` (new)**
- `export const FS = { xs: 11, s: 12, m: 13, base: 14, l: 16, xl: 20, "2xl": 28 } as const;` and `PLAN_FS = { m: FS.m, s: FS.s, xs: FS.xs, l: FS.l }`.
- `typeScale.test.ts` reads `src/styles.css` with `fs` and asserts that each `--fs-*` equals `FS`, so the TS and CSS cannot drift.

**`src/lib/cssLint.test.ts` (new): the guard.** It globs `src/**/*.css` and fails on:
- `font-size:` or `font:` with a raw number that is not on a line marked `/* glyph */`, and not inside `.app[data-touch]` rules where the value is `var(--fs-l)`;
- `border-radius:` with raw px;
- `transition:` or `animation:` with raw durations (except `none`, and the loader keyframes);
- `font-weight: 700`;
- `--font-display` on a selector whose `font-size` token is below `--fs-xl`. This is a best-effort parse of single-line rules; the Playwright check below catches the rest.

**Motion**
- `src/components/useGestureFade.ts`:
  - drop the phone-only early return;
  - add `mode = chassis === "phone" ? "touch" : "orbit"`;
  - for `orbit`, accept only `e.target instanceof HTMLCanvasElement && e.target.closest(".viewer, .wipe")` with `e.pointerType === "mouse" || e.pointerType === "pen"` and `e.button === 0 || e.button === 2` (orbit and pan);
  - keep the existing `onCanvas` exclusions (`.float-card, .sheet, .island, button, .popover, .tab-bar`), so the wipe divider (a DOM element) never fades;
  - write `data-gesture="orbit"`, with a restore delay of 250 ms;
  - skip when `document.querySelector(".walk-bar")` exists.
  - Rename it to `useChromeFade`; the one call site is App.tsx:71.
- The CSS rules move from mobile.css:52-59 to styles.css as two selectors: `.app[data-gesture=""]` (touch, 0.15) and `.app[data-gesture="orbit"]` (0.35, the card, dock, coach and view-cube or compass only).

**Welcome still**
- `src/houses/types.ts`: `HouseDef` gains `hero?: { wide: string; tall: string; placeholder: string; focus: [number, number] }`. The house's `index.ts` fills it from `assets.ts` (Vite `import heroWide from "./assets/hero-wide.webp"`, which gives URLs, not bytes) and `meta.json`.
- `src/lib/hero.ts` (new, pure): `heroFor(house): HeroSpec | null` and `objectPosition(focus)`, with tests.
- `src/components/Welcome.tsx`:
  - a new `HeroBackdrop` (`<picture>` with two `<source>` and an `<img decoding="async" fetchPriority="high" alt="">` (React 19 spelling), so it is decorative);
  - `Footprint` takes a `size` prop for the large fallback and the phone row thumb;
  - layout classes only.
- `Welcome.css` is rewritten: `.welcome` becomes `position:absolute; inset:0`, and the phone `main` scroll rule at line 42 goes.
- **3D poster.** A new `src/components/ViewerLoading.tsx` (`<ViewerLoading label>`: the poster when `useCurrentHouse().hero` exists, plus `<Loader kind="blueprint">` and the label) replaces the three hand-written `.viewer-loading` blocks: App.tsx's two `Suspense` fallbacks and Viewer.tsx:192. `.viewer-loading` itself stays in styles.css:138; the poster CSS goes in `ViewerLoading.css` (it must load before the three.js chunk, so not Viewer.css).
- **`data-still`.** One rule in Viewer.css (loaded with the 3D view, where the still is taken; keeps C out of styles.css): `.app[data-still] :is(header.topbar, .dock, .float-card, .view-cube, .view-compass, .coach-strip, .viewer-title, .tab-bar, .sheet, .sun-panel) { visibility: hidden }`. `coveredRight()` (Viewer.tsx:357) returns 0 when `.app[data-still]`, so the home framing is not offset.
- `scripts/house/hero.mjs` (new):
  - factor the server, browser and ready3d boilerplate out of `shot.mjs` into `_lib.mjs` as `openHouse(id, { viewport })`;
  - add `"house:hero"` to package.json.
- **Soundcheck.** `scripts/house/soundcheck.mjs` gets the stale-still warning (via `soundcheckLines` in `_lib.mjs`).

**3D canvas**
- `src/lib/canvasLook.ts` (new, pure, tested):
  - `sweepRadii(plotBounds) → { r0, r1 }`;
  - `sweepInput(hex) → linear RGB` (the inverse Neutral tone map; the test checks the round trip within 1/255);
  - `contactPad(footprint) → { x0, y0, x1, y1, texel }`.
- `src/three/Lighting.tsx` `SkyBackdrop`:
  - in Quiet, the `DAY_BACKDROP` horizon and bottom become `sweepInput(PAGE_TONE)`, and the day fog colour is the same (night and sun-study fog unchanged);
  - fog distances unchanged (see Design (d));
  - `SkyBackdrop()` takes no props and is mounted straight from Viewer.tsx:220, and it needs no plot data after this change, so Viewer.tsx is not touched.
  - `PAGE_TONE` moves from Site.tsx:767 into `canvasLook.ts`, as the one place.
- `src/three/Site.tsx`:
  - `quietGround()` gets an `onBeforeCompile` radial mix to the sweep colour at the end of the fragment (uniforms `uCentre`, `uR0`, `uR1`; `customProgramCacheKey = "sweep"`). Today it is a module singleton (`quietGroundMat ??=`, Site.tsx:773-775); Side by side and Wipe draw two scenes whose plots can differ (per-variant sites), so it becomes one material per `SiteContent` (`useMemo` keyed on the site, disposed on unmount) with `uCentre` from `centre` (Site.tsx:59);
  - new `HouseContactShadow` (in a new `src/three/contactShadow.ts`, which holds the texture builder), mounted inside `SiteContent`, so Viewer.tsx is not touched by this chunk.
- **Plan:**
  - `src/editor/PlanEditor.css` gets the token block above;
  - `src/editor/plan/layers/*.tsx`, `{StairsSymbol,ElectricGlyph,FixtureSymbol,OpeningSymbol,LockGlyph}.tsx` and `src/editor/site/SiteLayers.tsx` swap ink hex for `var()` and sizes for `PLAN_FS` (data colours stay);
  - `Fixtures.tsx` hides custom labels unless selected or `zoom > 1`.

**Store and persistence**
- No store changes and no migration. Undo and redo are untouched (nothing here writes the model).
- Persisted prefs read but not changed: `usePanelPrefs.quiet`, `coachDone`, `settings.quality` (its `auto` value and migration belong to the quick win).
- `data-still` and `data-gesture` live only on the DOM.
- `meta.json` gains an optional `hero` object. The Vite registry plugin (vite.config.ts:52-56) reads only `name`, so it needs no change.

**Performance**
- Type and motion: CSS only.
  - Entrance animations use opacity and translate, which the compositor handles.
  - `animation` runs once on mount.
- The orbit fade adds no React renders.
- Welcome: one WebP of 110–140 KB on cold start; the placeholder is inline.
  - LCP on the Welcome goes from the text (now) to the image. Target LCP ≤ 1.5 s on the Render deploy over cable, measured with Playwright's `PerformanceObserver`.
  - The hero is **not** imported from the app shell. `Welcome` itself is in the main bundle (App.tsx:33), but the house definition loads lazily (`HouseEntry.load()`, src/houses/types.ts:43), so the hero URLs and the placeholder arrive with the house chunk and the image bytes only when `<picture>` asks.
- Canvas:
  - the sweep adds one `smoothstep` per ground fragment;
  - the contact shadow is one 256² texture (256 KB of GPU memory) plus one quad: under 0.1 ms per frame;
  - with `shadowMap.autoUpdate=false` (Viewer.tsx:207), nothing extra runs per frame.

**Accessibility**
- The still is decorative (`alt=""`).
- The tiles stay buttons, with titles as their accessible names.
- Contrast:
  - scrim text sits on at least 85% `--bg`, so `--text` stays above 12:1 and `--muted` above 5:1;
  - eyebrows in `--fs-xs` caps use `--muted` at 600 weight (5.6:1 on `--panel`).
- Reduced motion is honoured through the tokens.
- While chrome is faded on desktop it has `pointer-events: none` only during the drag.
- Keyboard focus never triggers the fade.

## Build plan (chunks for parallel Sonnet builders in separate worktrees: for each chunk the files it owns, the files it must stay out of, the steps, and how to verify; note the order and dependencies)

**Order.** Wave 1 runs A, C and D in parallel. Wave 2 runs B and E after A (and, for B, C) merge, because they rely on A's tokens and `typeScale.ts`. F is done by the merger. C's final still is re-shot after D merges (step 1).

**A. Type and radius tokens: Sonnet, medium**
- **Owns:** `src/styles.css` (all but B's motion block, added later), every `src/**/*.css` except `Welcome.css`, `Viewer.css` and the `PlanEditor.css` token block (lines 4-12); `src/lib/typeScale.ts` (+ test); `src/lib/cssLint.test.ts` (with the motion and duration checks behind `it.todo` until B lands, and `Welcome.css`/`Viewer.css`/`ViewerLoading.css` skipped until C lands); `scripts/shoot-chassis.cjs` (adds `desktop` 1440×900 and `desktop-wide` 1920×1080, non-touch, plus a `SIZES=phone,desktop` env filter).
- **Stays out of:** TSX files, `Welcome.*`, `Viewer.css`, `src/three/*.tsx`.
- **Steps:**
  1. Add the tokens.
  2. Map every declaration per the tables, re-grepping by selector.
  3. Fix the double card-head rule (styles.css:227 vs Inspector.css:48) into the eyebrow and title rule.
  4. Change the global display rule.
  5. Turn 700 into 600.
  6. Add the radius tokens and map them.
  7. Add the lint test.
- **Verify:**
  - `npm run check`;
  - `grep -rhoE 'font-size: *[0-9.]+px' src --include=*.css | grep -v glyph` is empty;
  - first, before any change: `PORT=<n> OUT=<scratch>/before SIZES=phone,desktop node scripts/shoot-chassis.cjs` (with the new sizes added); after: the same into `<scratch>/after`. Compare by eye: no layout shifts larger than 2 px in cards apart from the intended card heads.

**B. Motion language: Sonnet, medium (after A)**
- **Owns:** the motion block in `src/styles.css`, transition lines in all CSS files (rebase on A and C; includes `Welcome.css`'s tile transition once C has merged), `src/components/useGestureFade.ts` → `useChromeFade.ts`, `App.tsx` (the import and call at lines 15 and 71 only), the gesture rules in `mobile.css`, and the motion checks in `cssLint.test.ts`.
- **Stays out of:** `Viewer.tsx`, `src/three/*.tsx`, the `PlanEditor.css`/`SiteEditor.css` token blocks (E).
- **Steps:**
  1. Add the tokens and keyframes.
  2. Add the entrances per the table.
  3. Collapse the reduced-motion blocks.
  4. Generalise the hook.
  5. Add `scripts/test-motion.cjs` (see Acceptance).
- **Verify:** `npm run check`, then (dev server on `<n>`) `PORT=<n> node scripts/test-motion.cjs`, then `PORT=<n> node scripts/test-touch-plan.cjs` (the phone gesture fade still passes).

**C. Welcome still and 3D poster: Sonnet, medium (Opus reviews the script)**
- **Owns:** `src/components/Welcome.tsx`, `Welcome.css`, new `src/components/ViewerLoading.{tsx,css}`, `src/lib/hero.ts` (+ test), `src/houses/types.ts`, `src/houses/listing-91770873/{index.ts,assets.ts,meta.json,assets/hero-*.webp}`, the `.viewer-loading` block in `src/three/Viewer.tsx` (line 192) and the two `Suspense` fallbacks in `App.tsx` (lines 195-200, 279-284), the `data-still` rule and its one font size in `Viewer.css`, `coveredRight()` in Viewer.tsx, `scripts/house/{hero.mjs,shot.mjs,_lib.mjs,soundcheck.mjs}`, `package.json` (script line), `.claude/skills/eras-tour/SKILL.md`, `src/houses/hero.test.ts`.
- **Stays out of:** `Lighting.tsx`, `Site.tsx`, `styles.css` and every other CSS file, App.tsx outside the two fallbacks.
- **Steps:**
  1. Write the script and run it for listing 91770873 *after D merges*, so the still has the sweep. Until then, use a temporary still made from HEAD's look, and re-run before C's merge.
  2. Build the Welcome layout per chassis and the fallback.
  3. Add the poster.
  4. Update the eras-tour and soundcheck notes.
  5. Add `src/houses/hero.test.ts`: for each house with `assets/hero-wide.webp`, check the sizes against the budget and that `meta.hero.placeholder` is 600 B or less.
- **Verify:**
  - `npm run check`, `npm run build`;
  - `npm run house:hero -- listing-91770873` prints both files within budget;
  - `npm run house:hero -- _template` falls back with a message (the template has no still);
  - `PORT=<n> node scripts/test-welcome.cjs` (new, see Acceptance), which also takes the Welcome shots at all five sizes plus phone landscape.

**D. Canvas look: Sonnet, medium (Opus high reviews the shader patch and the tone-map inverse)**
- **Owns:** `src/lib/canvasLook.ts` (+ test), `src/three/Lighting.tsx` (`SkyBackdrop` only), `src/three/Site.tsx` (`quietGround`, `PAGE_TONE`, `SiteContent` mount), `src/three/contactShadow.ts` (new).
- **Stays out of:** `Viewer.tsx` (no prop is needed), `Effects.tsx`, all CSS.
- **Steps:**
  1. Add `canvasLook.ts` with tests.
  2. Add the sweep backdrop and fog.
  3. Add the radial ground fade.
  4. Add the house and neighbour contact shadows.
  5. Check the quality levels.
- **Verify:** `npm run check`; `PORT=<n> SIZES=phone,desktop node scripts/shoot-chassis.cjs` (once A's sizes land; until then the phone shots plus `npm run house:shot -- listing-91770873 --views home,front`); the canvas pixel checks below (new `scripts/test-canvas.cjs`, owned by D); a Side by side shot to check both plots fade.

**E. Plan hierarchy: Sonnet, medium (after A)**
- **Owns:** `src/editor/plan/layers/*.tsx`, `src/editor/{StairsSymbol,ElectricGlyph,FixtureSymbol,OpeningSymbol,LockGlyph}.tsx`, `src/editor/plan/chrome/EdgeLengthInput.tsx` and `src/editor/core/components.tsx` (font sizes only), `src/editor/site/SiteLayers.tsx`, the `PlanEditor.css` token block (lines 4-12), `SiteEditor.css` `--site-*` tokens.
- **Stays out of:** `PlanEditor.tsx` logic, `src/lib/*` except reading `typeScale.ts`, and the data-colour files: `Inspectors*` (split by the quick win), `DecoratePanel.tsx`, `GardenSymbol.tsx`, `site/GardenInspectors.tsx`, `MyFurniture.tsx`, `FeatureWalls.tsx`.
- **Steps:**
  1. Add the tokens.
  2. Replace the hex values.
  3. Switch to `PLAN_FS`.
  4. Gate the fixture labels.
  5. Draw the garage door (and every door's own colour) at level-2 weight, keeping `o.color`.
  6. Add `src/lib/planInk.test.ts` (vitest's environment is `node`, so `fs` works) that reads the owned TSX files and expects no `#[0-9a-fA-F]{3,6}` outside a `?? ` fallback of a data colour (allow-list by line content).
- **Verify:**
  - `npm run check`;
  - `npm run regress:editors -- --port <n>`;
  - `PORT=<n> node scripts/test-electrics.cjs`, `PORT=<n> node scripts/test-garden.cjs`;
  - plan-build, plan-furnish and plan-electrics shots at phone and desktop.

**F. Brand doc and final shots: the merger**
- Update `docs/brand.md`: type scale, card title rule, motion tokens, Welcome still and `house:hero`.
- Run the full acceptance list below and push to `main`.

## Acceptance checks (runnable: npm run check and build, which Playwright scripts or new checks, which screenshots at which sizes, and measurable targets)

- `npm run check` and `npm run build` pass, and CI is green. The new tests:
  - `typeScale.test.ts`;
  - `cssLint.test.ts`;
  - `hero.test.ts` (lib) and `src/houses/hero.test.ts`;
  - `canvasLook.test.ts`;
  - `planInk.test.ts`.
- **Type and radius counts** (shell):
  - distinct `font-size` values in CSS: 7 tokens plus 1 `/* glyph */` exemption;
  - raw px `font-size` lines: 0;
  - raw px `border-radius` lines: 0 (`50%` allowed);
  - `font-weight: 700`: 0.
- **`scripts/check-type.cjs` (new, Playwright, owned by A; `PORT=<n> node scripts/check-type.cjs`).** For welcome, 3d-build, 3d-build-room, plan-build, plan-electrics, plan-garden and review at 390×844 and 1440×900, walk every visible element with its own text. Each `getComputedStyle().fontFamily` that starts with "Bricolage" must have `fontSize ≥ 18`. Each `fontSize` must be in {11, 12, 13, 14, 16, 20, 28} or be SVG text or a `/* glyph */` element. Form controls must inherit (`select`, `input`, `small` defaults are the usual leaks). The target is 0 violations.
- **`scripts/test-motion.cjs` (new, Playwright, 1440×900; `PORT=<n> node scripts/test-motion.cjs`):**
  - open the Show popover; its computed `animation-duration` is 0.18s;
  - with `emulateMedia({ reducedMotion: "reduce" })` it is 0s;
  - in 3D, mouse down at the canvas centre, move 40 px: `.app[data-gesture="orbit"]` is set and `.inspector-card` opacity is ≤ 0.4; mouse up, wait 400 ms: the opacity is 1 and the attribute is gone;
  - in Plan, a room drag sets no attribute;
  - a wheel zoom and a plain click on the canvas set no attribute;
  - in Walk, a drag sets no attribute;
  - at 390×844 (touch), a one-finger drag still sets `data-gesture=""` (the phone path is unchanged).
- **Welcome** (new `scripts/test-welcome.cjs`, owned by C; `PORT=<n> node scripts/test-welcome.cjs`). Shots of the Welcome at 390×844, 844×390, 1440×900 and 1920×1080 (plus a smoke at 820×1180 and 1180×820).
  - On the phone in portrait, `.welcome.scrollHeight ≤ innerHeight` (no scroll), and both tiles and "Open layouts…" have bounding boxes inside the viewport. In landscape, both tiles are reachable by scrolling `.welcome`.
  - The `<img>` `currentSrc` ends `hero-tall…webp` on the phone and `hero-wide…webp` on desktop.
  - `naturalWidth > 0`.
  - The transfer size of the hero is ≤ 140 KB (from `performance.getEntriesByType("resource")`).
  - Fallback: with `page.route("**/hero-*.webp", r => r.abort())`, `.welcome-fallback svg` is visible and there are no page errors.
- **3D poster.** On a cold start into 3D at 390×844 (software GL), `.viewer-loading picture` is visible within 500 ms of `.viewer-loading` appearing.
- **Canvas** (`scripts/test-canvas.cjs`, owned by D; `PORT=<n> node scripts/test-canvas.cjs`). In 3d-build at the home view, Quiet canvas, sun off, coach dismissed (`setPrefs({ coachDone: true })`), read with `page.screenshot` of the canvas and sampled in Node. Run at 1440×900 (High) and 390×844 (Balanced):
  - the mean of a 40×40 px block in the top-left of the canvas, below the islands and clear of the house (desktop (240, 100); phone (40, 130)), is within ±4 per channel of `#eef0ec`;
  - in the top 15% of the canvas, the left and right 10% strips have no pixel more than 6 per channel from `#eef0ec` (no lime band, no seam).
- **Contact shadow** (same script). At 390×844 (Balanced), project two ground points in front of the front wall's midpoint (0.3 m and 3 m out) with `window.__houseCamera.camera` (the dev hook, Viewer.tsx:568) and `Vector3.project`; the luminance at 0.3 m is ≥ 8% lower than at 3 m.
- **Performance.** `PORT=<n> QUALITY=balanced LABEL=before node scripts/perf-render.cjs` on main before D and `LABEL=after` after: the orbit render ms are within +3%, and the shader program count rises by at most 2 (the sweep ground and the contact shadow).
- **Plan.**
  - `planInk.test.ts` passes (no ink hex in E's files, data-colour fallbacks allow-listed);
  - in plan-build at 1440×900 and 390×844 at fit zoom, a fixture with a custom label shows it only when selected;
  - `npm run regress:editors` passes.
- **Screenshots for the owner** (before and after, side by side): welcome, 3d-build, plan-build and 3d-decorate-room at 390×844, 1440×900 and 1920×1080.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The type pass shifts many panels at once and something wraps or clips | A runs alone in wave 1 for CSS. Shots before and after at phone and desktop, checked by eye per mode. Most moves are ±1 px. The 15 → 14 card heads are the only intentional shrink. |
| Tone mapping makes the sweep miss `#eef0ec`, leaving a visible seam | `sweepInput()` has a round-trip test, and the acceptance pixel check catches it. Fallback: render the backdrop dome with `toneMapped = false` and the colour given in sRGB. |
| The contact shadow doubles with N8AO at High, so the base looks dirty | The opacity drops to 0.18 at High. The Opus review compares the High and Balanced shots. |
| The still goes stale after a preset bump, so the Welcome shows an old house | `meta.hero.version` plus a soundcheck warning, and eras-tour re-runs it after each tier. A slightly stale, blurred-scrimmed still is acceptable. |
| WebP encoding differs between Chromium versions, so binary churn shows up in diffs | Only re-run `house:hero` deliberately; the script never runs in CI. |
| The poster's framing doesn't match the live view | The 8 px blur and the cross-fade make it read as a focus pull. Accept. |
| The orbit fade hides the card when someone clicks on the canvas to select | It needs at least 8 px of movement, as the phone does. A click never fades. |
| Entrance animations on `pop-center` fight `transform` | The individual `translate` and `scale` properties are used, which Safari 14.1+ and Chrome 104+ support. |
| A merge conflict between A and B on single-line CSS rules | B starts only after A merges. |
| The sweep ground, once a singleton, now one per scene: more materials, more compiles | One per `SiteContent` (at most two, in Compare), same program via `customProgramCacheKey`; the perf check caps new programs at 2. |
| Fog tuned against the plot would fog the house (three.js fog is camera-distance) | Fog distances are left alone; the fade is radial in the ground shader. |
| The 3D poster shows As listed while Proposed is opening | Blurred and brief; a per-variant still is open question 2(b). |
| The orbit fade annoys desktop users who watch the card while orbiting | Only the card, dock, coach and cube fade, to 0.35 not 0.15, and only during a mouse drag; open question 6 lets the owner say no. |

## Open questions for the owner (each with options and a recommendation; only real decisions, not things the code can answer)

1. **How is the Welcome still made?**
   - (a) A prebuilt WebP per house via `npm run house:hero`, about 250 KB in the repo per house.
   - (b) Rendered live on first load.
   - (c) No image, just a large drawn footprint.
   - **Recommend (a).** It is the only one that is instant on a phone. (c) stays as the fallback.
2. **Which house is in the still?**
   - (a) As listed only.
   - (b) As listed, cross-fading to the Proposed still while the Proposed tile is hovered or focused (a second pair of images, +250 KB).
   - **Recommend (a)** now. The tiles' footprints already show the extension; (b) can follow.
3. **Sky or studio sweep in the home view?**
   - (a) Studio sweep: the ground fades into the page colour, and the sky shows only when you orbit low or walk.
   - (b) Drop the home camera to about 12° with a wider lens so a strip of sky shows. Roofs read less well, and there is more distortion.
   - **Recommend (a).**
4. **A slow drift on the Welcome still** (4% over 24 s, off under reduced motion)?
   - **Recommend yes.** It is the one bit of life on the first screen and costs nothing.
5. **Card title style.**
   - (a) A small caps eyebrow (BUILD · ROOMS) plus the Bricolage object title.
   - (b) A sentence-case Plex 14 head, as now, plus the title.
   - **Recommend (a).** It is the clearest hierarchy, and it matches the Review tiles and house-menu group heads. Note: (a) drops the mode's sub-line ("Rooms, walls, doors and stairs", `.mode-sub`) from the card head; the empty-state summary replaces it.
6. **Should desktop chrome fade while orbiting?** (The phone fade is already decided and built.)
   - (a) Yes: the card, dock, coach and view cube go to 35% during a mouse drag on the 3D canvas; the top islands stay.
   - (b) No: desktop chrome stays put; only the motion tokens and entrances land.
   - **Recommend (a).** It gives the house the whole screen while you look at it, and costs one hook branch. The review's verifier rated it low value, so it is the first thing to drop if time is short.

## Out of scope

- Layout of the top bar, dock, sheet and tab bar: see phone-shell.md and modes-and-top-bar.md.
- A compare legend, Wipe styling and compare modes: see one-renderer-compare.md.
- Dark mode, a new palette, icon redesign, or a new loader.
- HDRI environments, bloom, SSR, or path-traced stills (Render already exists).
- House picker thumbnails using the still (a cheap follow-up once C lands).
- The Walk HUD and the Review page layout, beyond the token mapping.

## Effort (S/M/L per chunk and in total)

| Chunk | Effort | Notes |
|---|---|---|
| A Type and radius tokens | M | Mechanical but wide: 35 CSS files, 223 size and about 60 radius declarations, plus the lint test. |
| B Motion | S | Tokens, keyframes and one hook generalised. |
| C Welcome still and poster | M | The script, the layout for two chassis, the fallback and the eras-tour notes. |
| D Canvas look | M | A shader patch, a tone-map inverse and the contact shadows. Needs an Opus review. |
| E Plan hierarchy | M | About 70 ink hex literals (the data colours stay), 41 `fontSize` sites, the label gating. |
| F Brand doc and shots | S | |
| **Total** | **L** | About 2 waves; wave 1 (A, C, D) in parallel. |
