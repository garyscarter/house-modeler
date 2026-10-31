# A lean phone shell

Status: proposal, not started. Written 31 Oct 2026. Source findings: PH1, PH9; phone parts of PH2, PH4, PH6, PH7, PH11, VIS6; missed findings "Phone chrome stacks about 175 px at the bottom", "Two layout switches on phone", "Hiding the empty sheet would orphan the Furnish 'Add' button"; cut verdicts on the phone tab bar, phone top bar, palette button, Keyboard shortcuts, Canvas Quiet/Full and the view cube.

## Why (the problem, with numbers and evidence)

"Review" below = the reviewed commit 8df6020 (the screenshots). "HEAD" = 07e5fa8, after the Dua Lipa and Robbie Williams quick-win merges.

- At review the phone stacked seven layers (phone-3d-build.png, phone-plan-electrics.png): top bar 48, layout pill (to y 104), view cube 84 + measure button, dock 44 (+12 gap), sheet peek 64, tab bar 56 (+ safe area).
- At HEAD the islands float, but the bars are still there: `--topbar-h: 52px; --tabbar-h: 56px; --sheet-peek: 64px` (styles.css:15); dock 52 tall at `bottom: calc(var(--sheet-peek) + 12px)` (Dock.css:24-27); the fit adds `DOCK_CLEAR = 12+44+12` plus `SHEET_PEEK_PX` and measures the rail (`phoneBottomInset`, `phoneLeftInset`, useCameraInsets.ts:6-37); `TabBar` is still mounted (App.tsx:303).
- The empty peek now hides in view-only modes (sheet.ts `restingDetent`) and names the tapped room (InspectorCard.tsx:25-42). In Decorate and Furnish it still rests at peek, repeating the mode name, and the active tab (TabBar.tsx:20-24, `sheet.toggle()`) is the only route to the mode panel (FurnishSummary's Add, the Electrics panel; ModePanel.tsx:34-67).
- Seven tabs at 55 px with 11 px labels (TabBar.tsx, mobile.css:4-17); after owner decision 1, four of them are view-only.
- Landscape 844x390 was never designed (review-mobile-2026-10.md:49). `--inset-l/-r` (styles.css:15) now take the left/right safe areas, but nothing outside walk.css:90-91 takes `safe-area-inset-top`, although index.html sets `viewport-fit=cover` and the app is installable (manifest `orientation: any`, `apple-mobile-web-app-capable`), so in standalone mode the islands sit under the status bar.
- Phone CSS is spread out: **111 lines with `[data-chassis="phone"]` in 18 CSS files** (ReviewPage.css 22, walk.css 20, styles.css 12, Dock.css 11, PlanEditor.css 7, ...; 207 lines in 29 files counting `data-touch`), and **23 `"phone"` tests in TS/TSX**. The sum `var(--sheet-peek) + 12px + 44px + 8px` is copied into PlanEditor.css:121, SiteEditor.css:71/73 and SunControls.css:41, mobile.css:64 has a `+ 52px` variant, and PlanEditor.css:124 adds `--tabbar-h` too.

Clear canvas at review and after the quick wins, computed from the CSS (Playwright, no safe-area insets). **Band** = tallest full-width strip that no chrome crosses. **Area** = viewport minus the union of chrome rects.

| 390x844 portrait | Review band | Review area | After quick wins (est.) band | Design band | Design area |
|---|---|---|---|---|---|
| 3D, nothing selected | 104→669 = 565 px, **67 %** | ~70 % | 56→724 = 668, 79 % (view-only) / 604, 72 % (Decorate, Furnish keep the peek) | 56→780 = 724 px, **86 %** | ~89 % |
| Plan, nothing selected | 67 %, and the rail takes 78 px on the left | ~66 % | 72-79 % | 86 %, no rail | ~89 % |
| View-only, room tapped | 104→418 = 314, 37 % (rises to half) | — | 56→660 = 604, 72 % (peek above dock and tab bar) | 56→716 = 660, **78 %** (one-line peek) | ~84 % |
| Decorate, room tapped | 37 % | — | ~40 % | 56→422 = 366, **43 %** (half = min(50 %, content)) | — |
| Same, iPhone PWA insets 47/34 | 531 px, 63 %, top bar under the status bar | — | — | 99→750 = 651 px, **77 %** | ~85 % |

| 844x390 landscape | Review band | Review area | After quick wins (est.) | Design band | Design area |
|---|---|---|---|---|---|
| 3D, nothing selected | 104→214 = **110 px, 28 %** | ~45 % | 56→270 = 214 px, 55 % | 56→326 = **270 px, 69 %** | ~89 % |
| Room tapped | 104→191 = 87 px | — | ~150 px | 270 px band, canvas width 844 − 332 = 512 px left of the side sheet | ~58 % |

Numbers marked "est." assume the quick-win sizes in Assumptions. Chunk F measures HEAD for real first (the baseline) and replaces the estimates.

## Goal and non-goals

Goals
- Clear band ≥ 83 % portrait and ≥ 65 % landscape at 390x844 / 844x390 with nothing selected; area ≥ 85 % in both.
- One floating top chip, one floating dock, one sheet. No bar spans the screen.
- Every phone feature that exists today stays reachable in at most two taps, except those the owner has already cut.
- Landscape works, with safe areas on all four sides.
- All phone layout values in one place (`--chrome-*` tokens), read by both the CSS and `useCameraInsets`.

Non-goals
- No change to desktop (1440x900, 1920x1080) or the tablet chassis.
- No new mode model in the store. The seven modes stay (see Open question 1).
- No iPad optimisation. It must keep working.

## Decisions already made (by the owner; do not reopen)

1. The phone is for showing, walking and measuring, plus light Decorate and Furnish edits. Build, Electrics, Garden and Plot are view-only on phones.
2. The devices that matter are the iPhone (390x844) and laptop/desktop (1440x900, 1920x1080). iPad must keep working but is not optimised for.
3. The look is a full-bleed canvas with floating chrome everywhere, in the same brand (docs/brand.md). No Glass look.
4. Quick wins are built now. This spec is for later.

## Assumptions (including which quick wins have landed)

Every quick win in the brief has landed on `main` before this work starts. Chunk A checks each at HEAD first and lists gaps; a missing one is built by the chunk that owns its files.

Already on `main` at 07e5fa8 (checked):
- Glass gone; full-bleed canvas; top bar is floating islands (`header.topbar .island`, TopBar.tsx:86-147); `--float-top`, `--inset-l/-r` tokens (styles.css:15).
- Phone top row: `HouseMenu` (mark) | `LayoutSwitch` (only when both layouts exist) | undo redo (TopBar.tsx:110-146). LayoutSwitch is three-way; Compare picks the last style and switches to 3D (TopBar.tsx:46-49); `CompareStyle` floats under the row, side by side filtered by `FEATURES.sideBySide`.
- Measure is a dock button (Dock.tsx:127); the phone view cube is the `view-compass` home button (ViewCube.tsx:33).
- `isCompact` and `canEdit` (chassis.ts:55-60); `useChassis.compact`, `canEditNow`, `useCanEdit` (useChassis.ts:15-54); `ReadOnlyBody` (`<fieldset disabled>`, components/ReadOnly.tsx), with Electrics keeping its Wiring guide live (ModePanel.tsx:71 `skip`, ElectricsPanel.tsx:56-177); SiteEditor keys gated (SiteEditor.tsx:275).
- `useSheet` has `hidden`, `held`, a mode-aware `raise()`, `rest()` and `toggle()` (sheet.ts); half fits content (`detentHeights`, BottomSheet.tsx:17-20); active tab toggles the panel (TabBar.tsx:22).
- Phone plan fit measures the real rail (`phoneLeftInset`).
- Phone House menu: Search… (HouseMenu.tsx:104-109); Keyboard shortcuts and Canvas Quiet/Full hidden on phones (lines 110, 136).
- 3D loading already uses `<Loader kind="blueprint">` (Viewer.tsx:192-195).

Still to land (assumed by this spec): `useQuality()` 'auto'; App not re-rendering per drag frame; gesture fade covering the dock; Capture popover; one-line self-dismissing coach strip; NumberField; Inspectors split; CI workflow.

- This spec moves the "tap the active tab" job to the mode menu's **Panel ›** (see Design).
- The "five modes" proposal (UX11) is separate and not built. If it lands first, the mode menu lists its modes instead; nothing else here changes.

## Design (what the user sees and does, per chassis: phone, desktop; iPad notes; every state)

### The shell (phone chassis)

Two floating islands and one sheet. No bars.

```
REVIEW (390x844)                       DESIGN (390x844)
+----------------------------------+   +----------------------------------+
| = Listing 91770873 v     <- -> Q |   | (S v | <- | ->)  [Listed|Prop|<>]|  top chip  +  layout switch
|      [Listed | Proposed]   [cube]|   |                            ( @ ) |  compass / fit (44)
|                            [rul] |   |                                  |
|                                  |   |                                  |
|            canvas                |   |            canvas                |
|            (565 px)              |   |            (724 px)              |
|                                  |   |                                  |
| [Plan 3D | All v | [] * o  walk] |   |                                  |
| Build                            |   |                                  |
| Rooms, walls, doors and stairs   |   |                                  |
| Bld Dec Frn Elc Gdn Plt Rev      |   | [(Furnish v) 3D  G v  rul walk ..]|  one dock (52)
+----------------------------------+   +----------------------------------+
```

- **Top chip** (top-left, 44 tall): Storey mark as the house-menu button | Undo | Redo. 140 px wide. The house name is not shown (cut verdict: it lives in the house menu).
- **LayoutSwitch** (top-right, same row): Listed | Proposed | Compare, short labels, Compare as a 44 px icon. Hidden when the house has only one layout. When it is hidden, the compass moves up into the row.
- **Compass / fit button** (44, right edge, under the row): in 3D it is the quick-win compass/home button; in Plan, Garden and Plot it fits the drawing. It replaces PlanZoom and the site editor's `.site-zoom` on compact screens (PH4 verdict: drop the rail; select is the default and Measure is in the dock).
- **Dock** (bottom-centre, 52 tall, `min(100% − 24px − insets, 560px)`), left to right, by priority:

| Priority | Item | Shown when | Width |
|---|---|---|---|
| 1 | Mode chip: icon + mode name + chevron | always | ~92 |
| 2 | Plan/3D: one toggle that shows the other view's name | always | 52 |
| 3 | Floor chip (`G v`) | more than one floor, or 3D | 52 |
| 4 | Add (+, accent) | Furnish | 44 |
| 5 | Walk | 3D | 44 |
| 6 | Measure | always | 44 |
| last | More (...) | always | 44 |

  - A pure `dockItems()` drops items into More, lowest priority first, when they do not fit the dock's width. At 366 px, 3D Furnish moves Measure into More. Everything else fits.
  - **More menu** (popover above the dock): Sun, Show (view toggles), Capture (Snapshot, 2x; Render hidden on compact, see Open question 5), Paste (while the clipboard holds an item), plus any overflowed items. Search stays in the House menu, where it already is on phones (HouseMenu.tsx:104-109).
- **Sheet**: hidden unless asked for (see Sheet). Nothing else is anchored to the bottom edge.
- **Coach strip** (quick win, one line): sits at `--chrome-top`, under the chip row, and dismisses itself.
- **SaveNotice** and the viewer title move from `--float-top` (mobile.css:62-63) to `--chrome-top`.
- **Gesture fade** (quick win) covers the top chip, LayoutSwitch, compass and dock.
- **Peek** (Space, hold to show the other layout): the `.peek-badge` (App.tsx:301) sits at `--chrome-top`; the chip and dock stay.

### Modes on the phone

Recommendation (Open question 1, option A): keep the seven modes and group them in a mode menu. There is no store change and no migration.

```
+----------------------------------+
| EDIT                             |
|  (brush) Decorate        *  Panel>|   <- current mode: tick + "Panel"
|  (sofa)  Furnish                 |
| VIEW                        (eye)|
|  (house) Build                   |
|  (plug)  Electrics               |
|  (flower) Garden                 |
|  (compass) Plot                  |
| ---------------------------------|
|  (clip)  Review                > |
+----------------------------------+
     [(Decorate ^) 3D G v ...]
```

- Opens upwards from the mode chip. `role="menu"` with `menuitemradio` rows, 48 px rows, the icons from `MODE_ICON`, and `MODE_SUBTITLE` as a second line.
- Groups come from `canEdit(mode, compact)`: on compact screens Decorate and Furnish are under Edit and the other four under View. On iPad portrait (phone chassis, not compact) every mode is under Edit.
- The current row has a **Panel ›** button. It opens the mode's summary or panel in the sheet at half (ModePanel as today). This replaces "tap the active tab" (VIS6 verdict).
- In a view-only mode the mode chip shows a small eye badge, and the peek says "View only".

### Sheet (portrait)

Detents: `hidden | peek | half | full`.

| State | Detent | What shows | Dock |
|---|---|---|---|
| Nothing selected (any mode) | hidden | nothing | shown |
| Selected in a view-only mode | peek (56) | "Kitchen · 14.8 m²" + Details › | shown, the peek floats 8 px above it |
| Selected in Decorate / Furnish | half = min(50 %, content height) | the inspector | hidden (as today, Dock.css:34) |
| Panel › from the mode menu | half | mode summary / panel | hidden |
| Drag up | full (100 % − top chip − 8) | | hidden |
| Tap empty canvas | hidden | | shown |

- The peek is a floating card, 12 px from each side, not a full-width bar.
- Drag down from peek, or swipe it down, hides it and clears the selection.
- After it rises, the selection pans into view (PH5). This uses `ensureVisible`, which belongs to the PH5 quick win.

### Landscape (844x390, phone chassis, `data-orient="land"`)

```
+--------------------------------------------------------------------+
|notch| (S v|<-|->)      [Listed|Prop|<>]                    ( @ )   |
|     |                                                              |
|     |                    canvas (270 px band)                      |
|     |                                                              |
|     |          [(Furnish v) 3D  G v  +  walk rul ...]              |
+--------------------------------------------------------------------+
Room selected:
+--------------------------------------------------------------------+
|notch| (S v|<-|->)  [L|P|<>]   ( @ ) | Kitchen  14.8 m²           x |
|     |                               | ---------------------------  |
|     |        canvas (512 px)        | inspector, scrolls           |
|     |  [(Furnish v) 3D G v + ...]   |                              |
+--------------------------------------------------------------------+
```

- Same islands. The LayoutSwitch sits top-centre. Every float adds `env(safe-area-inset-left/right)`, so the notch side never clips chrome.
- The sheet becomes a **side sheet** on the right: 320 px plus the right inset, full height minus 2 × 8. It has two detents only: `hidden | open`. A view-only peek is a 320 x 56 card at top-right.
- While the side sheet is open, the dock and LayoutSwitch centre in the canvas left of it (`--chrome-right` grows by 332). The camera's `insetRight` follows.

### Walk, Compare, Measure, Sun ("dock takeovers")

All four use one pattern: the dock's contents swap for a task bar, and Done/Esc swaps them back. The Walk takeover exists already (`Dock.tsx` returns `WalkBar` when `walking`).

| Task | Takeover | Other chrome |
|---|---|---|
| Walk | WalkBar (as today) | top chip, LayoutSwitch and compass hidden (replaces walk.css:87-88, which hides `header.topbar` and `.tab-bar`); WalkMap top-right, WalkHint top-left (walk.css:90-91) |
| Measure | "3.42 m · Undo point · Clear · Done" (Measure keeps its Esc / M keys) | sheet hidden |
| Sun (from More) | time slider (36 px tall) + date chip + Done, replacing the floating `.sun-panel` (SunControls.css:41, mobile.css:64) | — |
| Compare | not a takeover: picking Compare in the LayoutSwitch switches to 3D (UX2 verdict) and shows the quick-win Wipe / Overlay segment under the top row | Wipe handle full height; dock unchanged |

### Plan, Garden and Plot on the phone

- No tool rail on compact screens (PH4 verdict). Tap selects, long-press opens the action sheet. In Decorate and Furnish, a drag moves the item as today.
- Fit insets: top = `--chrome-top`, bottom = `--chrome-bottom`, left/right = 12 + inset. Double-tap on empty canvas fits (through `useDoublePress` with its own key, so it cannot clash with the polygon double-press in plan/useDrag.ts:67 and site/useSiteDrag.ts:72).
- `.plan-status` / `.site-status` move into the peek line when something is selected, and are hidden otherwise. The scale bar sits bottom-left, above the dock.
- The site north arrow sits in the compass button's place in Garden and Plot (it is the compass there).

### Furnish Add flow

1. Tap **+** in the dock (in 3D it switches to Plan first, as `FurnishSummary.onAdd` does: ModePanel.tsx:56-65).
2. The add picker (editor/AddItem.tsx, opened by `requestAddPicker`, editor/addPicker.ts) opens as the sheet at half instead of `.add-pop`, a fixed popover with a hand-summed bottom (PlanEditor.css:124). It has search on top and a grid of items.
3. Tap an item: it drops at the centre of the visible canvas and is selected (sheet at half with its inspector).
- Empty search: "No match" line plus the full list below. Cancel: drag the sheet down or tap the canvas; nothing is added.
- Paste appears in More while the clipboard holds an item. Undo of an add is the chip's Undo.

### Electrics as a read-only view

- The plan shows points, numbers and switch links (plan/layers/Electrics.tsx). A tapped point shows "S1 · Double socket · Kitchen" in the peek; Details › opens the read-only inspector.
- Mode menu → Electrics → **Panel ›** opens ElectricsPanel at half, read-only. The **Wiring guide** section (ElectricsPanel.tsx:158-177: print and "Schedule (CSV)") already sits outside its `ReadOnlyBody` and stays live.
- New on compact: a **Schedule** section above it lists `scheduleRows()` (lib/electrics.ts:538) as a read-only list (number, kind, room, circuit), so the schedule can be read on site without opening a CSV (Open question 7).

### Review, Settings, search, Export

| Need | Where on the phone |
|---|---|
| Review | Mode menu → Review: a full-screen page (ReviewPage) with a close chip top-left that returns to the last mode. `.review-page { bottom: var(--tabbar-h) }` (ReviewPage.css:107) becomes `bottom: 0` plus the bottom safe area. |
| Settings | House menu (top chip) → its Settings group, as today (HouseMenu.tsx:118-147). Keyboard shortcuts and Canvas Quiet/Full are already hidden on phones. |
| Search | House menu → Search… (as today), which opens the command palette full width. `.cmdk-panel` max-height drops its `--tabbar-h` (CommandPalette.css:123). |
| Export | Report: Review page → its print/export actions. Project JSON: House menu → Project (`ProjectActions`, HouseMenu.tsx:152-153). Wiring guide: Electrics panel. Images: More → Capture. |

### Every state

| State | Phone |
|---|---|
| Empty (no house) | Welcome only: no dock, no mode chip; top chip shows the mark only. |
| Loading 3D | `<Loader kind="blueprint">` + "Preparing the 3D view" (Viewer.tsx:192-195, as today), centred in the band, not the full viewport. |
| WebGL lost | Same loader with "Restoring the 3D view" (as today); dock stays usable for Plan. |
| Busy (render, capture, sync) | `<Loader kind="lift">` + label inside the dock takeover or the More row. |
| Error (save or sync) | SaveNotice as a toast at `--chrome-top`; the house menu shows SyncStatus. |
| Panel crash | The existing ErrorBoundary inside the sheet; the shell stays. |
| One layout only | LayoutSwitch hidden; the compass moves into the top row. Compare unavailable (as today). |
| Undo / redo | Chip buttons, disabled when the stacks are empty (as TopBar.tsx:133-138). They work in view-only modes too, as today (an undo there may revert a Decorate edit). |
| Soft keyboard open (a field in the sheet) | The sheet goes full; the dock hides; `startChassisWatch` already re-reads only on focusout (useChassis.ts:35-43). |
| Hardware keyboard / screen reader | Esc closes menus, takeovers and the sheet in that order; Tab order chip → layout → canvas → dock → sheet. |
| Reduced motion | Sheet, menus and fades switch instantly (as mobile.css:41/57, Dock.css:37). |

### Desktop and iPad

- Desktop and tablet: no change, and no desktop feature is lost (ModeBar, TopBar palette button, Cameras, side by side, Keyboard shortcuts all stay). Everything below is scoped to `.app[data-chassis="phone"]`.
- iPad portrait (820x1180) is phone chassis but not compact. It gets the same shell (Open question 6), with every mode editable (canEdit), the tool rail and zoom kept (hidden only when `compact`), and drawing tools still off (`FEATURES.phone.draw`, chassis.ts:39). The side sheet is not used there (portrait).
- iPad landscape (1180x820) is tablet chassis: untouched.
- Rotation: a phone turning portrait ↔ landscape keeps the selection and moves an open sheet to the matching detent (half ↔ open); the fit re-runs through `fitSuffix`.

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

### New pure logic: `src/lib/phoneShell.ts` (+ `phoneShell.test.ts`)

```ts
export type DockItem = "mode" | "tab" | "floor" | "add" | "walk" | "measure" | "more";
export interface DockCtx { mode: Mode; tab: Tab; floors: number; walking: boolean; compact: boolean }
/** Items in priority order; those past `budget` px go to More. */
export function dockItems(ctx: DockCtx, budget: number): { shown: DockItem[]; overflow: DockItem[] };
export const DOCK_ITEM_PX: Record<DockItem, number>;
/** Mode menu groups. */
export function modeGroups(compact: boolean): { edit: Mode[]; view: Mode[]; page: Mode[] };
/** Chrome sizes for the fit (px), from orientation, insets and sheet state. Mirrors the CSS tokens. */
export function chromeInsets(o: { landscape: boolean; safe: Insets; sheet: SheetDetent; sheetPx: number }): Insets;
```

### Chassis and orientation

- `src/components/useChassis.ts`: `compact` exists; add `landscape: boolean` (`width > height`) to the state and to the change test (line 39). Set `data-orient="land"` and `data-compact` on `.app` (App.tsx:184 sets the other attributes).
- `src/lib/chassis.ts`: no breakpoint change. Add `shell: "lean" | "bars"` to `Features` (phone lean, others bars) so components test a feature, not the chassis (FEATURES comment, chassis.ts:28).
- The selection → detent rule already lives in `useSheet.raise()` (sheet.ts); keep it there (no new `detentOnSelect`). Landscape maps `half`/`full` to the side sheet's `open` in BottomSheet, not in the store.

### One home for phone layout: `--chrome-*` tokens

- In `src/components/mobile/mobile.css`, on `.app[data-chassis="phone"]`, built on the existing `--float-gap`, `--island-h` and `--inset-l/-r` (styles.css:15) rather than new names:
  - `--safe-t: env(safe-area-inset-top, 0px); --safe-b: env(safe-area-inset-bottom, 0px)`
  - `--dock-h: 52px` (chip height is `--island-h`, 44)
  - `--chrome-top: calc(var(--safe-t) + var(--float-gap) + var(--island-h))`; `--float-top` becomes an alias of it on phones
  - `--chrome-bottom: calc(var(--safe-b) + var(--float-gap) + var(--dock-h))`
  - `--chrome-left: var(--inset-l)`, `--chrome-right: var(--inset-r)`
  - The landscape side sheet adds `--side-sheet: 320px` to `--chrome-right` under `[data-orient="land"][data-sheet="open"]`.
- Every phone rule positions with these tokens. Examples: `.plan-status { bottom: calc(var(--chrome-bottom) + 8px) }` replaces the four copies of `var(--sheet-peek) + 12px + 44px + 8px`; `.float-top` becomes `--chrome-top`.
- **Reading them in JS:** custom properties that hold `env()` are not resolved by `getComputedStyle`. So App renders one hidden probe, `<div class="chrome-probe" aria-hidden>`, with `padding: var(--chrome-top) var(--chrome-right) var(--chrome-bottom) var(--chrome-left)`. `useCameraInsets` (src/editor/core/useCameraInsets.ts) reads the resolved `paddingTop` etc. on resize, orientation change and `data-sheet` change. The probe's values go in `fitSuffix`, so a rotation refits.
  - `DOCK_CLEAR`, `PHONE_LEFT_INSET` and `phoneBottomInset` are deleted; `phoneLeftInset` (which measures the rail) stays for iPad portrait, where the rail remains. `useCameraInsets` keeps its return shape, so `useCanvasCamera` callers do not change.
- **Consolidation:** move every `[data-chassis="phone"]` rule (111 lines in 18 files at HEAD) into one new file, `src/components/mobile/phone.css`, imported once by App. One section per component (top chip, dock, sheet, plan, site, sun, measure, walk, review, dialogs, palette, house menu), all on tokens. Component CSS files keep only their base rules and their `[data-touch]:not([data-chassis="phone"])` tablet rules (those are not phone rules and stay put). Expected size after the deletions below: about 60 lines.
- **Delete:** the `.tab-bar` block and `--tabbar-h` (mobile.css:3-17, styles.css:15), `TAB_BAR_PX` (sheet.ts:15), the phone `header.topbar` rules in styles.css, walk.css:87-88 (no bars left to hide), every `--tabbar-h` use (mobile.css:45 `.ctx-sheet`, HouseMenu.css:24, CommandPalette.css:123, ReviewPage.css:107, PlanEditor.css:124), the `--sheet-peek` sums (PlanEditor.css:115/121, SiteEditor.css:71/73, SunControls.css:41, mobile.css:64, Dock.css:25) and `.app[data-sheet="hidden"] { --sheet-peek: 0 }` (mobile.css:67), and the phone `.view-cube` rules if any remain.

### Components

| File | Change |
|---|---|
| `src/components/mobile/PhoneChip.tsx` (new) | Mark → `HouseMenu` trigger; Undo/Redo (same store calls as TopBar.tsx:91-94, 133-138). `<nav aria-label="House">`. |
| `src/components/mobile/PhoneDock.tsx` (new) | Renders `dockItems()` with a ResizeObserver on its own width. Reuses `tabSwitchPatch`, `dockFloorPick` and `floorsByLevel` from lib/studio (as Dock.tsx does). Walking → `WalkBar` takeover. Measure and Sun → their takeovers. |
| `src/components/mobile/ModeMenu.tsx` (new) | The mode menu above; uses `modeGroups`, `MODE_ICON`, `MODE_SUBTITLE`. "Panel ›" → `useSheet.set("half")` with the mode's summary. |
| `src/components/mobile/MoreMenu.tsx` (new) | Sun, Show (the dock's Show popover body, Dock.tsx:122), Capture, Paste, overflow items. |
| `src/components/mobile/TabBar.tsx` | Delete (and its import, App.tsx:37). |
| `src/App.tsx` | `features.shell === "lean"`: render PhoneChip + LayoutSwitch + CompareStyle + PhoneDock in place of TopBar, Dock and TabBar (App.tsx:185, 300, 303). The selection handlers (App.tsx:120, 136) keep calling `raise()`. |
| `src/components/Dock.tsx` | Phone branches removed (`phone` at lines 34, 72, 90, 122, 134). Desktop and tablet only. Extract `WalkTakeover` so PhoneDock can share it. |
| `src/components/TopBar.tsx` | Phone branches removed (`phone` at line 96 and its guards at 110-139). Export `CompareStyle` (line 67) for the phone shell. `LayoutSwitch` keeps its short labels (`lay-short`, line 38) for phones. |
| `src/components/mobile/sheet.ts` | `restingDetent(viewOnly, held)` returns `hidden` whenever nothing is held, in every mode (Panel › replaces the resting peek); `rest()` follows it. `raise()` unchanged (peek in view-only, half when editing). `toggle()` is called by ModeMenu's Panel › instead of TabBar. Delete `TAB_BAR_PX`. |
| `src/components/mobile/BottomSheet.tsx` | `detentHeights` unchanged. Landscape: `side` variant, half/full shown as `open`. Floating card (12 px from each side) at peek. Sets `data-sheet` as today (lines 68-72); `hidden` is already `inert` (line 169). |
| `src/components/InspectorCard.tsx` | Peek line for any selection (room, point, garden item), not only rooms (`roomLine`, lines 25-33); "Details ›" raises to half. |
| `src/components/ElectricsPanel.tsx` | Compact only: a read-only Schedule section from `scheduleRows()` above the Wiring guide (line 158). |
| `src/editor/plan/chrome/PlanRail.tsx`, `PlanZoom.tsx`, `PlanStatus.tsx`; `src/editor/SiteEditor.tsx` (`.site-zoom`, line 473) | On `compact`: no rail; PlanZoom and `.site-zoom` shrink to one 44 px Fit button in the compass's place (the 3D `view-compass`, ViewCube.tsx:33, is not mounted on the Plan tab), calling the camera's existing `fit`. Status text moves into the peek line. |
| `src/editor/AddItem.tsx`, `src/editor/addPicker.ts` | On the phone the picker renders as sheet content, not `.add-pop`. |
| `src/components/SunControls.tsx`, `src/three/Measure.tsx` | Expose `SunBar` and `MeasureBar` takeover bodies. The floating panel stays on desktop. |
| `src/components/ReviewPage.tsx` | Close chip on phones; `bottom: 0`. |

### Store and persistence

- No persisted shape changes. `mode`, `tab`, `activeVariant` and `viewMode` (project, `lib/persist.ts`) are unchanged, so `migrate.ts` needs nothing.
- `panelPrefs` (components/panelPrefs.ts, per browser) keeps its shape. `sunOpen` on phones opens the Sun takeover, and a phone ignores it on boot (the takeover never opens on load). `compareMode: "side-by-side"` saved on a desktop already falls back to wipe on phones (`effectiveCompare`). `addCategory` still picks the Add sheet's first category.
- A save made with a phone in a mode is restored as that mode; the mode menu shows it, with the eye badge if view-only.
- Transient UI (menu open, takeover, landscape side sheet) is local component state or `useSheet`, not the undo store.

### Tests

- `src/lib/phoneShell.test.ts`: `dockItems` at budgets 336 (360 px Android), 366, 560 and 750 for 3D Furnish, Plan Build and walking; `modeGroups` compact and not; `chromeInsets` portrait/landscape/side-sheet.
- `src/lib/chassis.test.ts`: `FEATURES.shell`; 844x390 is phone + compact; 820x1180 is phone, not compact.
- `src/components/mobile/sheet.test.ts` (exists, update): `restingDetent` is `hidden` with nothing held in Decorate and Furnish too; `toggle()` from hidden opens half (the Panel › path).
- `src/components/mobile/BottomSheet.test.ts` (exists): a pure `sideDetent()` maps half/full → open and keeps peek/hidden, so rotation keeps the store's detent; `settle` never lands on `hidden` from a drag that starts at half.

### Performance

- Fewer mounted layers on phones: TopBar, TabBar, PlanRail and PlanZoom go; four small components arrive (ModeMenu and MoreMenu mount only when open).
- PhoneDock subscribes to narrow selectors (`floors.length`, `mode`, `tab`), so it does not re-render on drag frames.
- One ResizeObserver for the dock and one probe read per resize; no per-frame layout reads.
- CSS: no `backdrop-filter`; opacity transitions only.

### Accessibility

- Every target is ≥ 44 px; menu rows are 48.
- Landmarks: `nav[aria-label=House]` (chip), `[role=toolbar][aria-label=View]` (dock), `region` (sheet). DOM order: chip, layout, canvas, dock, sheet.
- The mode chip has `aria-haspopup="menu"` and `aria-expanded`, and its label reads "Mode: Furnish" (view-only adds "view only").
- A sheet that rises from a user tap moves focus to its heading. When hidden, the sheet is `inert`. Esc closes menus and takeovers.
- `prefers-reduced-motion`: no sheet or fade transitions (as mobile.css:49).

## Build plan (chunks for parallel Sonnet builders in separate worktrees: for each chunk the files it owns, the files it must stay out of, the steps, and how to verify; note the order and dependencies)

Order: **A** first. Then **B, C, E, F** in parallel. Then **D** (CSS consolidation, once behaviour is settled). Merge order: A, F, B, C, E, D.

| Chunk | Owns | Stays out of | Steps | Verify |
|---|---|---|---|---|
| **A. Logic and tokens** (Sonnet, medium) | `src/lib/phoneShell.ts` (+test), `src/lib/chassis.ts` (+test), `src/components/useChassis.ts`, `src/editor/core/useCameraInsets.ts`, token block at the top of `src/components/mobile/mobile.css`, the probe element and `data-orient`/`data-compact` attributes in `src/App.tsx` (line 184 only) | every other CSS file, the components below | 0. Check each Assumption at HEAD; list gaps. 1. Pure functions and tests. 2. `landscape` in the chassis store; attributes. 3. Tokens and the probe; switch `phoneBottomInset` to the probe; delete `DOCK_CLEAR` and `PHONE_LEFT_INSET`. | `npm run check`; `npm run regress:editors -- --port <n>` (desktop fit unchanged); `PORT=<n> node scripts/test-touch-plan.cjs` (phone fit still passes). |
| **B. Shell components** (Sonnet, medium; Opus review of the diff) | `src/components/mobile/{PhoneChip,PhoneDock,ModeMenu,MoreMenu}.tsx` + `PhoneShell.css` (base styles of these phone-only components, no chassis selectors), delete `TabBar.tsx`, `src/App.tsx` (shell wiring, lines 185 and 296-303), `src/components/Dock.tsx`, `src/components/TopBar.tsx` | BottomSheet, sheet.ts, InspectorCard, ModePanel, ElectricsPanel, editors, every existing CSS file | 1. Chip, dock, mode menu, more menu. 2. Wire them in App behind `features.shell`. 3. Strip phone branches from Dock and TopBar; export `CompareStyle`; extract the walk takeover. | `npm run check`; `PORT=<n> node scripts/test-walk-d.cjs` (after F's selector swap); screenshots at 390x844 and 844x390 for 3d-build, plan-furnish; desktop chrome rects identical (see Acceptance). |
| **C. Sheet** (Sonnet, medium) | `src/components/mobile/{BottomSheet.tsx,sheet.ts,BottomSheet.test.ts,sheet.test.ts}`, sheet rules in `mobile.css` (below A's token block), `src/components/InspectorCard.tsx`, `src/components/ElectricsPanel.tsx` (Schedule section only) | App.tsx, dock, top chip, editors | 1. Floating peek card. 2. Landscape side sheet (`sideDetent`). 3. Peek line for any selection. 4. Read-only Schedule list on compact. | `npm run check`; `PORT=<n> node scripts/test-electrics.cjs` (CSV and schedule on a phone viewport, after F); screenshots phone 3d-build-room, 3d-decorate-room, plan-electrics, and the same at 844x390. |
| **E. Canvas chrome and takeovers** (Sonnet, medium) | `src/editor/plan/chrome/{PlanRail,PlanZoom,PlanStatus}.tsx`, `src/editor/SiteEditor.tsx` (rail/zoom only), `src/editor/{AddItem.tsx,addPicker.ts}`, `src/components/SunControls.tsx`, `src/three/Measure.tsx`, `src/components/ReviewPage.tsx` | App, Dock, TopBar, sheet files, every CSS file except new rules in the component's own CSS (D moves them) | 1. Compact: no rail; one Fit button. 2. SunBar and MeasureBar bodies. 3. Review close chip. 4. Add picker as sheet content. | `PORT=<n> node scripts/test-touch-plan.cjs`; `PORT=<n> node scripts/test-garden.cjs`; the Add flow by hand at 390x844 (≤ 2 taps). |
| **F. Measuring and scripts** (Haiku, low, for the selector swaps; Sonnet for the new script) | new `scripts/measure-phone-chrome.cjs`; `scripts/shoot-chassis.cjs` (add `phone-land` 844x390, `desktop` 1440x900 and `desktop-wide` 1920x1080, the last two without touch); selector updates for `.tab-bar` in `scripts/test-garden.cjs:29/201`, `test-electrics.cjs:90/268`, `test-houses.cjs:41/56/65`, `test-walk-d.cjs:74/209`, `test-touch-plan.cjs:106`, `scripts/house/shot.mjs:51` (`.tab-bar` → `.tab-bar, .mode-chip`, and mode switches through a helper that uses whichever exists, so the scripts pass before and after B) | all `src/` | 1. The measurement script (see Acceptance), first run at HEAD for the baseline. 2. Swap selectors; replace the "seven tab labels fit" checks (test-electrics.cjs:268-270, test-touch-plan.cjs:106) with "mode-menu rows fit". | Run each script against a dev server built from B+C+E merged; the measurement script also at HEAD. |
| **D. CSS consolidation** (Sonnet, medium) | new `src/components/mobile/phone.css`; removes phone rules from the other 17 CSS files | TSX files | 1. Move each rule into its section, rewritten on `--chrome-*`. 2. Delete the dead rules listed above. 3. Run the grep in Acceptance. | Every phone screenshot unchanged against the B+C+E result (`shoot-chassis.cjs`, by eye) and the measurement script's numbers unchanged; `npm run build`. |

B and C share no file: C no longer edits App.tsx (the `raise()` calls stay as they are). A and C both edit mobile.css, in separate blocks, A merging first.

Each builder: symlink node_modules from the main checkout; commit with the trailer from the session's attribution reminder; do not push. The integrator merges, runs the checks and pushes to `main`.

## Acceptance checks (runnable: npm run check and build, which Playwright scripts or new checks, which screenshots at which sizes, and measurable targets)

- `npm run check` and `npm run build` pass.
- `PORT=<n> node scripts/measure-phone-chrome.cjs` (same `PORT` convention as the other scripts, against `npx vite --port <n>`). It loads listing 91770873 and, at 390x844, 844x390 and 360x780, collects the rects of every visible element marked `[data-chrome]` (B, C and E add the attribute; at HEAD it falls back to a fixed selector list: `header.topbar .island, .tab-bar, .dock, .sheet, .view-compass, .tool-rail, .plan-zoom, .site-zoom`). It prints band and area per state and exits 1 below these targets:

| State | 390x844 band | 390x844 area | 844x390 band | 844x390 area |
|---|---|---|---|---|
| 3D, nothing selected | ≥ 700 px (83 %) | ≥ 85 % | ≥ 254 px (65 %) | ≥ 85 % |
| Plan Build, nothing selected | ≥ 700 | ≥ 85 % | ≥ 254 | ≥ 85 % |
| Build, room tapped (peek) | ≥ 640 | ≥ 80 % | ≥ 254, canvas width ≥ 500 | — |
| Walk | ≥ 760 | ≥ 90 % | ≥ 310 | ≥ 90 % |
| Compare / Wipe | ≥ 650 | ≥ 82 % | ≥ 200 | — |

- Targets: every phone hit target ≥ 44 x 44 (the script checks `button, [role=menuitem*]` inside the chrome). No chrome rect lies outside the safe area when run with `--safe 47,0,34,0` (portrait) and `--safe 0,47,21,47` (landscape). Those insets are simulated by setting `--safe-*` overrides.
- `PORT=<n> OUT=<dir> node scripts/shoot-chassis.cjs` at phone, **phone-land, desktop, desktop-wide (added by F)**, tablet-portrait and tablet-land, for every mode. Review by eye: phone and phone-land show no top bar and no tab bar; tablet-portrait (iPad) still edits every mode with the rail.
- Desktop unchanged, measurably: the measurement script's `--desktop` pass records the rects of `header.topbar .island, .dock, .inspector-card, .sun-panel` at 1440x900 and 1920x1080 and exits 1 if any differs by more than 1 px from the HEAD baseline it saved (WebGL output is not pixel-stable under SwiftShader, so rects, not pixels).
- `PORT=<n> node scripts/test-touch-plan.cjs`, `test-garden.cjs`, `test-electrics.cjs`, `test-walk-d.cjs`, `test-houses.cjs` and `npm run regress:editors -- --port <n>` pass.
- Reachability at 390x844, scripted in `measure-phone-chrome.cjs` as tap sequences: Add furniture ≤ 2 taps; Electrics schedule ≤ 3; Settings 1 (open house menu); Search 2; Review 2; Sun 2; Measure ≤ 2 (it may overflow at 366 px); Walk 1; Compare 1; Undo 1.
- Reduced motion: the script runs one pass with `reducedMotion: 'reduce'` and checks `.sheet` and `.dock` have no transition.
- `grep -rlP '(?<!:not\()\[data-chassis="phone"\]' src --include=*.css` lists only `mobile/mobile.css` and `mobile/phone.css` (tablet `:not([data-chassis="phone"])` rules are allowed elsewhere); `grep -rnE 'tabbar-h|TAB_BAR_PX|DOCK_CLEAR|PHONE_LEFT_INSET|sheet-peek\) \+ 12px' src` finds nothing.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The dock overflows on narrow phones (360 px Android, or iPhone mini 375) | `dockItems` budgets by measured width; test at 360 in `measure-phone-chrome.cjs`. |
| Hidden features: users don't find Sun or Capture in More | More is the last dock item on every screen; the first-run coach on phones points at it once. |
| Read-only fieldset disables the exports | ElectricsPanel `readOnly` renders exports outside it; test-electrics checks the CSV on a phone viewport. |
| `env()` in custom properties is not readable from JS | Probe element (resolved padding), not `getPropertyValue`. |
| Landscape keyboard or Safari toolbars change the height mid-task | Chassis watch already skips focus resizes; the probe re-reads on `resize`. |
| A and B both touch App.tsx | A owns line 184 only (attributes and probe), B the shell wiring; A merges first. |
| A hidden resting sheet in Decorate/Furnish hides their summaries | Panel › in the mode menu and + in the dock (Furnish); the coach strip names Panel › once. |
| iPad portrait regresses (phone chassis, not compact) | shoot-chassis tablet-portrait shots in every mode; F adds an 820x1180 pass to test-touch-plan.cjs (rail present, Build editable). |
| Shared CSS moves (D) break desktop | D only moves phone-scoped selectors; desktop screenshots diffed before merge. |
| The quick wins land differently from the Assumptions | Chunk A starts by checking each assumption at HEAD and lists any gaps in its report. |

## Open questions for the owner (each with options and a recommendation; only real decisions, not things the code can answer)

1. **What are "modes" on a phone?**
   - A: all seven in a grouped mode menu (Edit: Decorate, Furnish; View: Build, Electrics, Garden, Plot; Review). No store change.
   - B: three phone modes (View, Decorate, Furnish), with Build, Electrics, Garden and Plot as "lenses" inside View. This maps phone-only names onto the stored modes and needs a migration and command changes (L).
   - C: wait for the five-modes proposal (UX11) and show those.
   - **Recommend A.** It is the simplest code, and the grouping already tells the user what they can edit.
2. **Redo on the phone.**
   - A: keep it in the chip (140 px chip).
   - B: show Redo only after an undo.
   - C: drop it (redo via the house menu).
   - **Recommend A.** It fits at 390, and B makes the chip jump.
3. **What a tap in a view-only mode shows.**
   - A: one-line peek with Details ›.
   - B: half sheet, as today.
   - **Recommend A** (78 % band against 37 %).
4. **Landscape sheet side.**
   - A: right.
   - B: left.
   - **Recommend A.** Thumbs reach it, and it matches the desktop inspector.
5. **Capture on phones.**
   - A: Snapshot and 2x only.
   - B: include Render (path tracer).
   - **Recommend A.** Render is slow and hot on phones, and its chunk then never loads there.
6. **iPad portrait.**
   - A: give it the lean shell too, with editing and the rail kept.
   - B: keep the old top bar and tab bar on iPad portrait.
   - **Recommend A.** It means one phone shell, and B keeps all the bar code alive for an unoptimised device.
7. **Electrics schedule on the phone.**
   - A: add a read-only Schedule list in the Electrics panel on compact screens (from `scheduleRows`).
   - B: CSV download and print guide only, as today.
   - **Recommend A.** Reading circuits on site is the phone's job in Electrics; a CSV is awkward to open on an iPhone. Small (part of chunk C).
8. **Phone landscape at all.**
   - A: support it (this spec; manifest stays `orientation: any`).
   - B: lock the installed app to portrait (`orientation: portrait`) and drop the landscape side sheet.
   - **Recommend A.** Walk and Compare read far better wide; B saves about a third of chunk C, but Safari tabs ignore the lock anyway.

## Out of scope

- Desktop and tablet chrome; the five-modes merge (UX11); 3D picking of furniture and points (UX10); the single-canvas wipe (PERF5 proposal).
- New phone features: editing in Build, Electrics, Garden or Plot; plan-image tracing; drawing tools.
- Tablet-landscape touch tuning; any iPad-specific layout.
- Gesture vocabulary beyond today's (double-tap to fit is the only new one).

## Effort (S/M/L per chunk and in total)

| Chunk | Effort |
|---|---|
| A. Logic and tokens | S |
| B. Shell components | M |
| C. Sheet | M |
| E. Canvas chrome, takeovers, Add sheet | M |
| F. Measuring and scripts | S |
| D. CSS consolidation | M |
| **Total** | **L** (about 4 parallel builder sessions plus one integration and review pass) |
