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

Numbers marked "est." assume the quick-win sizes in Assumptions. Chunk F measures them for real and replaces the estimates.

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

All the quick wins listed below have landed on `main` before this work starts. If one has not, its chunk below takes it on first.
- Glass look gone (`data-look`, `FEATURES.glass`, `panelPrefs.look`). Full-bleed canvas on every chassis. Top bar is floating islands; `--float-top` sits under them.
- Phone top row at that point: mark-as-house-menu button | LayoutSwitch | undo redo. LayoutSwitch is three-way (As listed | Proposed | Compare) on every chassis. While comparing, a floating Wipe | Side by side | Overlay segment sits under the top row (no side by side on phones). The `.layout-pill` and the dock Compare popover are gone.
- Dock: Plan|3D, floors, sun, Show, Measure (moved in), Walk, Cameras (desktop only), Capture popover (Snapshot, 2x, Render). Phone dock targets are 44 px, so the dock is about 52 px tall. The phone view cube is now a 44 px compass/home button. No palette button and no '?' on phones.
- `lib/chassis.ts` has `isCompact` (shortest side < 600) and `canEdit(mode, compact)`. Read-only modes show select + measure on the rail and inspectors in `<fieldset disabled>`.
- `useSheet` has a `hidden` detent. In view-only modes with nothing selected the sheet is hidden. A tap shows the one-line peek. Tapping the active tab opens the panel.
- The phone plan fit uses the real chrome. Garden/Plot fit the plot on compact screens.
- Render quality 'auto' through `useQuality()`; App no longer re-renders on every drag frame; gesture fade on phone chrome while dragging or pinching.
- Measure is a dock button; `MeasureButton` (three/Measure.tsx:240) is no longer a free float.
- If the quick-win "tapping the active tab opens the panel" exists, this spec moves that job to the mode chip (see Design).
- The "five modes" proposal (UX11) is separate and not built. If it lands first, the mode menu lists its modes instead; nothing else here changes.

## Design (what the user sees and does, per chassis: phone, desktop; iPad notes; every state)

### The shell (phone chassis)

Two floating islands and one sheet. No bars.

```
HEAD (390x844)                         DESIGN (390x844)
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
- **Compass / fit button** (44, right edge, under the row): in 3D it is the quick-win compass/home button; in Plan, Garden and Plot it fits the drawing. It replaces PlanZoom and SiteZoom on phones (PH4 verdict: drop the rail; select is the default and Measure is in the dock).
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
  - **More menu** (popover above the dock): Sun, Show (view toggles), Capture (Snapshot, 2x; Render hidden on compact, see Open question 5), Search (the command palette), plus any overflowed items.
- **Sheet**: hidden unless asked for (see Sheet). Nothing else is anchored to the bottom edge.
- **Gesture fade** (quick win) covers the top chip, LayoutSwitch, compass and dock.

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
| Walk | WalkBar (as today) | top chip, LayoutSwitch and compass hidden; WalkMap top-right, WalkHint top-left (walk.css:91-92) |
| Measure | "3.42 m · Undo point · Clear · Done" | sheet hidden |
| Sun (from More) | time slider (36 px tall) + date chip + Done, replacing the floating `.sun-panel` (SunControls.css:41) | — |
| Compare | not a takeover: picking Compare in the LayoutSwitch switches to 3D (UX2 verdict) and shows the quick-win Wipe / Overlay segment under the top row | Wipe handle full height; dock unchanged |

### Plan, Garden and Plot on the phone

- No tool rail on compact screens (PH4 verdict). Tap selects, long-press opens the action sheet. In Decorate and Furnish, a drag moves the item as today.
- Fit insets: top = `--chrome-top`, bottom = `--chrome-bottom`, left/right = 12 + inset. Double-tap on empty canvas fits.
- `.plan-status` / `.site-status` move into the peek line when something is selected, and are hidden otherwise. The scale bar sits bottom-left, above the dock.
- The site north arrow sits in the compass button's place in Garden and Plot (it is the compass there).

### Furnish Add flow

1. Tap **+** in the dock (in 3D it switches to Plan first, as `FurnishSummary.onAdd` does: ModePanel.tsx:56-65).
2. The add picker opens as the sheet at half (`.add-pop` today is a fixed popover with a hand-summed bottom, PlanEditor.css:124). It has search on top and a grid of items.
3. Tap an item: it drops at the centre of the visible canvas, the sheet drops to hidden, and the item is selected (half with its inspector).
- Paste appears in More while the clipboard holds an item.

### Electrics as a read-only view

- The plan shows points, numbers and switch links (plan/layers/Electrics.tsx). A tapped point shows "S1 · Double socket · Kitchen" in the peek; Details › opens the read-only inspector.
- Mode menu → Electrics → **Panel ›** opens ElectricsPanel at half, read-only. The **Wiring guide** section (ElectricsPanel.tsx:153-172: print and "Schedule (CSV)") stays live. It must sit outside the `<fieldset disabled>` (see Technical design).

### Review, Settings, search, Export

| Need | Where on the phone |
|---|---|
| Review | Mode menu → Review: a full-screen page (ReviewPage) with a close chip top-left that returns to the last mode. `.review-page { bottom: var(--tabbar-h) }` (ReviewPage.css:108) becomes `bottom: 0`. |
| Settings | House menu (top chip) → Settings, as today (HouseMenu.tsx:103). "Keyboard shortcuts…" hidden on phones (cut). |
| Search | More → Search, which opens the command palette full width. |
| Export | Report: Review page → its print/export actions. Project JSON: House menu → Project (SettingsPanel.tsx:72). Wiring guide: Electrics panel. Images: More → Capture. |

### Every state

| State | Phone |
|---|---|
| Empty (no house) | Welcome only: no dock, no mode chip; top chip shows the mark only. |
| Loading 3D | `<Loader kind="blueprint">` + "Preparing the 3D view", centred in the band. Never bare text (HEAD shows plain "Preparing the 3D view" in phone-3d-build.png). |
| Busy (render, capture, sync) | `<Loader kind="lift">` + label inside the dock takeover or the More row. |
| Error (save or sync) | SaveNotice as a toast 8 px above the dock; the house menu shows SyncStatus. |
| One layout only | LayoutSwitch hidden; the compass moves into the top row. |
| Keyboard open (a field in the sheet) | The sheet goes full; the dock hides; `startChassisWatch` already ignores the resize (useChassis.ts:30). |

### Desktop and iPad

- Desktop and tablet: no change. Everything below is scoped to `.app[data-chassis="phone"]`.
- iPad portrait (820x1180) is phone chassis but not compact. It gets the same shell, with every mode editable (canEdit) and the tool rail kept (rail hidden only when `compact`). The side sheet is not used there (portrait).

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

### New pure logic: `src/lib/phoneShell.ts` (+ `phoneShell.test.ts`)

```ts
export type DockItem = "mode" | "tab" | "floor" | "add" | "walk" | "measure" | "more";
export interface DockCtx { mode: Mode; tab: Tab; floors: number; walking: boolean; compact: boolean }
/** Items in priority order; those past `budget` px go to More. */
export function dockItems(ctx: DockCtx, budget: number): { shown: DockItem[]; overflow: DockItem[] };
export const DOCK_ITEM_PX: Record<DockItem, number>;
/** Detent after a selection: peek when the mode is read-only here, half when it edits. */
export function detentOnSelect(mode: Mode, compact: boolean): "peek" | "half";
/** Mode menu groups. */
export function modeGroups(compact: boolean): { edit: Mode[]; view: Mode[]; page: Mode[] };
/** Chrome sizes for the fit (px), from orientation, insets and sheet state. Mirrors the CSS tokens. */
export function chromeInsets(o: { landscape: boolean; safe: Insets; sheet: SheetDetent; sheetPx: number }): Insets;
```

### Chassis and orientation

- `src/components/useChassis.ts`: add `landscape: boolean` (`width > height`) and `compact` to `ChassisState`. Set `data-orient="land"` and `data-compact` on `.app` (App.tsx:185 sets the other attributes).
- `src/lib/chassis.ts`: no breakpoint change. Add `shell: "lean" | "bars"` to `Features` (phone lean, others bars) so components test a feature, not the chassis (FEATURES comment, chassis.ts:28).

### One home for phone layout: `--chrome-*` tokens

- In `src/components/mobile/mobile.css`, on `.app[data-chassis="phone"]`:
  - `--safe-t/r/b/l: env(safe-area-inset-*)`
  - `--chip-h: 44px; --dock-h: 52px; --gap: 12px`
  - `--chrome-top: calc(var(--safe-t) + var(--gap) + var(--chip-h))`
  - `--chrome-bottom: calc(var(--safe-b) + var(--gap) + var(--dock-h))`
  - `--chrome-left: calc(var(--safe-l) + var(--gap))`, `--chrome-right: calc(var(--safe-r) + var(--gap))`
  - The landscape side sheet adds `--side-sheet: 320px` to `--chrome-right` under `[data-orient="land"][data-sheet="open"]`.
- Every phone rule positions with these tokens. Examples: `.plan-status { bottom: calc(var(--chrome-bottom) + 8px) }` replaces the four copies of `var(--sheet-peek) + 12px + 44px + 8px`; `.float-top` becomes `--chrome-top`.
- **Reading them in JS:** custom properties that hold `env()` are not resolved by `getComputedStyle`. So App renders one hidden probe, `<div class="chrome-probe" aria-hidden>`, with `padding: var(--chrome-top) var(--chrome-right) var(--chrome-bottom) var(--chrome-left)`. `useCameraInsets` (src/editor/core/useCameraInsets.ts) reads the resolved `paddingTop` etc. on resize, orientation change and `data-sheet` change. The probe's values go in `fitSuffix`, so a rotation refits.
  - `PHONE_BOTTOM_INSET` and `PHONE_LEFT_INSET` are deleted. If the quick-win "real chrome" fit already measures elements, swap its source to the probe and keep its API.
- **Consolidation:** move all 106 `[data-chassis="phone"]` lines into one new file, `src/components/mobile/phone.css`, imported once by App. It has one section per component (top chip, dock, sheet, plan, site, sun, measure, walk, review, dialogs), all on tokens. Component CSS files keep only their base rules. Expected size after the deletions below: about 60 lines.
- **Delete:** the `.tab-bar` block and `--tabbar-h` (mobile.css:3-15, styles.css:17), `TAB_BAR_PX` (sheet.ts:12), the phone topbar rules (styles.css:251-263), walk.css:88-89 (no bars left to hide), `.ctx-sheet` bottom using `--tabbar-h` (mobile.css:54), PlanEditor.css:124's sum, and the phone `.view-cube` and `.measure-btn` rules (if the quick wins left them).

### Components

| File | Change |
|---|---|
| `src/components/mobile/PhoneChip.tsx` (new) | Mark → `HouseMenu` trigger; Undo/Redo (same store calls as TopBar.tsx:36-43). `<nav aria-label="House">`. |
| `src/components/mobile/PhoneDock.tsx` (new) | Renders `dockItems()` with a ResizeObserver on its own width. Reuses `tabSwitchPatch`, `dockFloorPick` and `floorsByLevel` from lib/studio (as Dock.tsx does). Walking → `WalkBar` takeover. Measure and Sun → their takeovers. |
| `src/components/mobile/ModeMenu.tsx` (new) | The mode menu above; uses `modeGroups`, `MODE_ICON`, `MODE_SUBTITLE`. "Panel ›" → `useSheet.set("half")` with the mode's summary. |
| `src/components/mobile/MoreMenu.tsx` (new) | Sun, Show (`ViewToggles`), Capture, Search (`OPEN_PALETTE`), Paste, overflow items. |
| `src/components/mobile/TabBar.tsx` | Delete. |
| `src/App.tsx` | `features.shell === "lean"`: render PhoneChip + LayoutSwitch + PhoneDock in place of TopBar, Dock and TabBar (App.tsx:299-305). Selection handlers (App.tsx:121, 137) call `useSheet.getState().raise(detentOnSelect(mode, compact))`. |
| `src/components/Dock.tsx` | Phone branches removed (`phone` at lines 42, 79, 98, 120-136). Desktop and tablet only. Extract `WalkTakeover` so PhoneDock can share it. |
| `src/components/TopBar.tsx` | Phone branches removed (`phone` at line 44 and the `!phone` guards). `LayoutSwitch` keeps its `lay-short` labels for phones. |
| `src/components/mobile/sheet.ts` | `raise(to: "peek" \| "half")`; `hide()` replaces `lower()` for a cleared selection. |
| `src/components/mobile/BottomSheet.tsx` | `detentHeights(canvas, content)` gives `half = min(canvas/2, content)`. Landscape: `side` variant, detents `hidden \| open`. Sets `data-sheet` as today (lines 50-54); `hidden` renders `inert` + `hidden`. |
| `src/components/InspectorCard.tsx` | Peek line for any selection (room, point, garden item), not only rooms (lines 25-32); "Details ›" raises to half. |
| `src/components/ModePanel.tsx` | When `!canEdit`, wrap the body in `<fieldset disabled>`, but render export blocks (`ElectricsPanel` wiring guide) outside it. Add `readOnly` to ElectricsPanel so its "Wiring guide" Section renders after the fieldset closes. |
| `src/editor/core/sheetBridge.ts` | `raiseSheet()` takes the mode → `detentOnSelect`. |
| `src/editor/plan/chrome/PlanRail.tsx`, `PlanZoom.tsx`; `src/editor/site/SiteEditor.tsx` | Rail and zoom not rendered when `compact`. The compass/fit button calls the camera's existing fit. SiteEditor's key handler (lines 316-322) respects canEdit (CODE3 verdict). |
| `src/components/SunControls.tsx`, `src/three/Measure.tsx` | Expose `SunBar` and `MeasureBar` takeover bodies. The floating panel stays on desktop. |
| `src/components/ReviewPage.tsx` | Close chip on phones; `bottom: 0`. |

### Store and persistence

- No persisted shape changes. `mode`, `tab`, `activeVariant` and `viewMode` are unchanged, so `migrate.ts` needs nothing.
- `panelPrefs.sunOpen` is persisted. On phones it now opens the Sun takeover, and on boot a phone ignores it (the sun takeover never opens on load).
- Transient UI (menu open, takeover) is local component state or `useSheet`, not the undo store.

### Tests

- `src/lib/phoneShell.test.ts`: `dockItems` at budgets 366, 560 and 750 for 3D Furnish, Plan Build and walking; `detentOnSelect` for all seven modes × compact; `modeGroups`; `chromeInsets` portrait/landscape/side-sheet.
- `src/lib/chassis.test.ts`: `FEATURES.shell`; 844x390 is phone + compact + landscape; 820x1180 is phone, not compact.
- `src/components/mobile/BottomSheet.test.ts`: `detentHeights` with content shorter than half; `settle` never lands on `hidden` from a drag that starts at half.

### Performance

- Fewer mounted layers on phones: TopBar, TabBar, ViewCube, PlanRail and PlanZoom go; three new small components arrive.
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

Order: **A** first. Then **B, C, E, F** in parallel. Then **D** (CSS consolidation, once behaviour is settled). Merge order: A, B, C, E, F, D.

| Chunk | Owns | Stays out of | Steps | Verify |
|---|---|---|---|---|
| **A. Logic and tokens** (Sonnet, medium) | `src/lib/phoneShell.ts` (+test), `src/lib/chassis.ts` (+test), `src/components/useChassis.ts`, `src/editor/core/useCameraInsets.ts`, token block at the top of `src/components/mobile/mobile.css`, the probe element in `src/App.tsx` (one line) | every other CSS file, the components below | 1. Write the pure functions and tests. 2. Add `landscape` and `compact` to the chassis store and attributes. 3. Add the tokens and the probe; switch `useCameraInsets` to the probe; delete the PHONE_* constants. | `npm run check`; plan fit unchanged at 1440x900 (`npm run regress:editors`). |
| **B. Shell components** (Sonnet, medium; an Opus review of the diff) | `src/components/mobile/{PhoneChip,PhoneDock,ModeMenu,MoreMenu}.tsx` + `PhoneShell.css`, delete `TabBar.tsx`, `src/App.tsx` (shell wiring), `src/components/Dock.tsx`, `src/components/TopBar.tsx` | BottomSheet, sheet.ts, InspectorCard, ModePanel, editors, the CSS files of other components | 1. Build the chip, dock, mode menu and more menu. 2. Wire them in App behind `features.shell`. 3. Strip the phone branches from Dock and TopBar; extract the walk takeover. | `npm run check`; screenshots at 390x844 and 844x390 for 3d-build, plan-furnish; desktop-3d-build pixel-identical in layout. |
| **C. Sheet** (Sonnet, medium) | `src/components/mobile/{BottomSheet.tsx,sheet.ts,BottomSheet.test.ts}`, sheet rules in `mobile.css` (below the token block), `src/components/InspectorCard.tsx`, `src/components/ModePanel.tsx`, `src/components/ElectricsPanel.tsx` (readOnly prop only), `src/editor/core/sheetBridge.ts`, the two `raise()` calls in App.tsx:121/137 (coordinate with B: C edits only those lines) | dock, top chip, editors | 1. Detents and `raise(to)`. 2. Content-height half. 3. Landscape side sheet. 4. Peek line for any selection. 5. Read-only fieldset with the exports outside. | `npm run check`; `node scripts/test-electrics.cjs` (CSV export works on a phone viewport); screenshots phone-3d-build-room, phone-3d-decorate-room. |
| **E. Canvas chrome and takeovers** (Sonnet, medium) | `src/editor/plan/chrome/{PlanRail,PlanZoom,PlanStatus}.tsx`, `src/editor/site/SiteEditor.tsx` (rail/zoom/key gate only), `src/components/SunControls.tsx`, `src/three/Measure.tsx`, `src/three/ViewCube.tsx`, `src/components/ReviewPage.tsx` | App, Dock, sheet, CSS consolidation | 1. Hide the rail and zoom when compact; add a fit to the compass button. 2. SunBar and MeasureBar bodies. 3. Review close chip. 4. Add picker as sheet content. | `node scripts/test-touch-plan.cjs`; `node scripts/test-garden.cjs`; the Add flow by hand at 390x844. |
| **F. Measuring and scripts** (Haiku, low, for the selector swaps; Sonnet for the new script) | new `scripts/measure-phone-chrome.cjs`; `scripts/shoot-chassis.cjs` (add `phone-land` 844x390); selector updates in `scripts/test-{garden,electrics,houses,walk-d,touch-plan}.cjs` and `scripts/house/shot.mjs` (`.tab-bar` → `.mode-chip` / `.mode-menu [data-mode]`) | all `src/` | 1. The measurement script (see Acceptance). 2. Swap selectors. `test-electrics.cjs:268` checks that tab labels fit; replace it with a check that mode-menu rows fit. | Run each script against a dev server at HEAD + B. |
| **D. CSS consolidation** (Sonnet, medium) | new `src/components/mobile/phone.css`; removes `[data-chassis="phone"]` rules from the other 18 CSS files | TSX files | 1. Move each rule into its section, rewritten on `--chrome-*`. 2. Delete the dead rules listed above. 3. `grep -rc 'data-chassis="phone"' src --include=*.css` should show only mobile.css and phone.css. | Every phone screenshot unchanged against the B+C+E result; `npm run build`. |

Each builder: symlink node_modules from the main checkout; commit with the trailer from the session's attribution reminder; do not push. The integrator merges, runs the checks and pushes to `main`.

## Acceptance checks (runnable: npm run check and build, which Playwright scripts or new checks, which screenshots at which sizes, and measurable targets)

- `npm run check` and `npm run build` pass.
- `node scripts/measure-phone-chrome.cjs --port <n>`. It loads listing 91770873 and, at 390x844 and 844x390, collects the rects of `[data-chrome]` elements (chip, layout, compass, dock, sheet, takeovers). It prints band and area per state and exits 1 below these targets:

| State | 390x844 band | 390x844 area | 844x390 band | 844x390 area |
|---|---|---|---|---|
| 3D, nothing selected | ≥ 700 px (83 %) | ≥ 85 % | ≥ 254 px (65 %) | ≥ 85 % |
| Plan Build, nothing selected | ≥ 700 | ≥ 85 % | ≥ 254 | ≥ 85 % |
| Build, room tapped (peek) | ≥ 640 | ≥ 80 % | ≥ 254, canvas width ≥ 500 | — |
| Walk | ≥ 760 | ≥ 90 % | ≥ 310 | ≥ 90 % |
| Compare / Wipe | ≥ 650 | ≥ 82 % | ≥ 200 | — |

- Targets: every phone hit target ≥ 44 x 44 (the script checks `button, [role=menuitem*]` inside the chrome). No chrome rect lies outside the safe area when run with `--safe 47,0,34,0` (portrait) and `--safe 0,47,21,47` (landscape). Those insets are simulated by setting `--safe-*` overrides.
- `node scripts/shoot-chassis.cjs` at phone, **phone-land (new)**, tablet-portrait, tablet-land, desktop and desktop-wide, for every view. Review by eye: desktop and desktop-wide match the pre-change shots; phone and phone-land show no top bar and no tab bar.
- `node scripts/test-touch-plan.cjs`, `test-garden.cjs`, `test-electrics.cjs`, `test-walk-d.cjs` and `npm run regress:editors -- --port <n>` pass.
- Reachability, by hand or scripted, at 390x844: Add furniture in ≤ 2 taps; Electrics schedule CSV in ≤ 3; Settings 2; Search 2; Review 2; Sun 2; Measure 1; Walk 1; Compare 1.
- `grep -rc 'data-chassis="phone"' src --include=*.css` finds only mobile.css and phone.css; `grep -rn 'tabbar-h\|TAB_BAR_PX\|PHONE_BOTTOM_INSET' src` finds nothing.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The dock overflows on narrow phones (360 px Android, or iPhone mini 375) | `dockItems` budgets by measured width; test at 360 in `measure-phone-chrome.cjs`. |
| Hidden features: users don't find Sun or Search in More | More is the last dock item on every screen; the first-run coach on phones points at it once. |
| Read-only fieldset disables the exports | ElectricsPanel `readOnly` renders exports outside it; test-electrics checks the CSV on a phone viewport. |
| `env()` in custom properties is not readable from JS | Probe element (resolved padding), not `getPropertyValue`. |
| Landscape keyboard or Safari toolbars change the height mid-task | Chassis watch already skips focus resizes; the probe re-reads on `resize`. |
| B and C both touch App.tsx | C owns only the two `raise()` lines; B merges first. |
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
| E. Canvas chrome and takeovers | M |
| F. Measuring and scripts | S |
| D. CSS consolidation | M |
| **Total** | **L** (about 4 parallel builder sessions plus one integration and review pass) |
