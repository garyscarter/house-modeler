# Five modes and a calmer top bar

Status: proposal, not started. Written 31 Oct 2026. Source findings: UX11, UX12, UX2 and UX3 (top-bar parts), UX13 (stairs in 3D), plus review-2026-10's "Plot hides the roof" / "Outside" and Plan/3D-in-the-top-bar items (docs/review-2026-10.md lines 52-53, 140, 149).

Author: Taylor Swift (planning). The house is "listing 91770873" throughout.

## Why (the problem, with numbers and evidence)

- **Seven modes, two of them not modes.** `MODES` in `src/lib/modes.ts` lists build, decorate, furnish, electrics, garden, plot and review.
  - Review is a full-screen page with its own × (`ReviewPage.tsx`, `reviewState.ts` `openReview`/`closeReview`). It needs a `modeBeforeReview` field (store.ts:91-94) only to get back out again. Its `PLAN_TOOLS` and `SELECTABLE` entries are never seen because the page covers the plan.
  - Garden and Plot are one canvas. App.tsx:287 renders `<SiteEditor key={mode} mode={mode === "garden" ? "garden" : "plot"} />`, so switching between them remounts the whole editor and refits the camera. The only difference is which layer takes clicks and which rail shows (`SiteLayers.tsx` `const garden = mode === "garden"`, `SiteEditor.tsx` `railGroups`).
  - "Plot" hides the roof. Exterior (roof, eaves, walls, chimneys) lives in `PlotPanel.tsx` under `<Section id="plot.exterior" title="Exterior">`, and nobody looks for a roof under "Plot" (review-2026-10).
- **The mode bar is wide.** Measured at HEAD (07e5fa8, floating islands landed) at 1440 px: left island 215, centre island 564 (mode bar 556), right island 374. On the phone the tab bar has 7 buttons at about 56 px each (`mobile/TabBar.tsx`), with 11 px labels (`mobile.css:12`).
- **The top bar already overlaps on the tablet chassis.** At HEAD, 1024 px (tablet): the centre island starts at x 214 and the left island ends at 227; at 900 px the centre overlaps both sides. Seven modes do not fit between 900 and about 1100 px.
- **Plan/3D is the biggest view change and the smallest control.** It is the first segment of the dock (`Dock.tsx`, `.seg[aria-label="Plan or 3D"]`, 109 px), at the bottom of the screen, away from the modes it changes.
- **The house menu mixes project actions with settings** (`HouseMenu.tsx`, the `<h3>Settings</h3>` group): Render quality, Scroll wheel and "Canvas Quiet | Full" sit beside Layouts, Export and Clear all. "Canvas Quiet/Full" means nothing to a first-time user. (The Look row went with Glass.)
  - What Quiet really does (checked at HEAD; the UX12 verifier's note was incomplete):
    - plan: handles show only on the selected or hovered room (`Handles.tsx:46`), and fills are neutral in Build, Furnish and Electrics (`PlanEditor.tsx:260` `neutralFills`)
    - 3D: matte ground (`Site.tsx:42,65`), grey neighbour massing (`Site.tsx` `NeighbourMass`), a nearer fog (`Lighting.tsx:398`), and no leaf colour jitter (`SiteItems.tsx` `buildGarden` `addGeom`)
  - It defaults to on (`panelPrefs.ts:43`). It also beats the "Neighbours in their own colours" checkbox in SitePanel, because `NeighbourMass` checks `quiet` before `trueColours` (`Site.tsx:904-910`). With the default setting, that checkbox does nothing. This is a live bug.
- **Stairs are not selectable on the plan.** At HEAD the Stairs section is inside `FloorSettings` (`Inspectors.tsx:1383`, `build.floor.stairs`), which `BuildSummary` now shows on the plan tab only (`ModeSummaries.tsx:77`, `{onPlan && <FloorSettings/>}`; the UX13 quick win landed). A tap on the stair marker still selects the room under it (`plan/useDrag.ts` `stairsDown`: `tap: (m) => backgroundTap(m)`).

## Goal and non-goals

Goals:
- Five modes: **Build, Decorate, Furnish, Electrics, Outside**.
- **Review** becomes a top-bar button that opens the Review page. It is not a mode.
- **Plan | 3D** moves from the dock to the top bar on desktop and tablet.
- A small **Settings** dialog. The house menu keeps project actions only.
- The Exterior gets a findable home.
- A tap on the stairs on the plan selects the stairs. The Stairs rows leave the Build summary.
- Less code: one site editor with no remount, no `modeBeforeReview`, and no per-mode Review stubs.

Non-goals:
- No new editing features.
- No change to the site editor's hit-testing rules: the Garden and Plot layers keep today's behaviour.
- No phone shell rework (that is proposal 1 in review-2026-11, specced separately).
- No 3D selection of furniture (UX10).

## Decisions already made (by the owner; do not reopen)

1. The phone is for showing, walking and measuring, plus light Decorate and Furnish edits. Build, Electrics, Garden and Plot (so Outside, after this spec) are view-only on phones.
2. The devices that matter are the iPhone (390×844) and laptop/desktop (1440×900, 1920×1080). iPad must keep working but is not optimised for.
3. The look is a full-bleed canvas with floating chrome everywhere, in the same brand (docs/brand.md), with no Glass look.
4. Quick wins are built now. Big redesigns, like this one, are specs for later.

## Assumptions (including which quick wins have landed)

Already at HEAD (merged 31 Oct, 07e5fa8 and a809222), checked: floating islands, Glass gone, three-way `LayoutSwitch` with `CompareStyle`, `isCompact`/`canEdit` in `lib/chassis.ts`, the phone sheet's hidden detent, and `FloorSettings` on the plan tab only. The rest below is assumed from the same pass.

- **Glass:** removed. The canvas is full-bleed on every chassis, and `--float-top` sits under the floating islands.
- **Top-bar steps at HEAD** (`styles.css`): under 1559 px the wordmark and the palette keycap go; under 1359 the grid becomes `auto minmax(0,1fr) auto`; under 1239 mode buttons pad 10 px and the layout switch shows "Listed" and an icon for Compare. This spec adds steps; it does not replace these.
- **Chassis:** `chassisFor` gives the phone chassis at width ≤ 899 (so iPad portrait, 820, is "phone") or height < 480 (phone landscape); tablet is 900-1179 or any coarse pointer; desktop is ≥ 1180 with a fine pointer. `canEdit(mode, compact)` takes a string and returns false for anything but decorate and furnish on compact screens, so `"outside"` is view-only on the iPhone with no change, and editable on iPad portrait (not compact).
- **Top bar:** floating islands.
  - Left: mark and house menu.
  - Centre: mode bar (desktop and tablet).
  - Right: layout switch, undo, redo, palette.
  - Phone top row: mark as house-menu button | layout switch | undo, redo.
  - The `?` button is gone.
- **LayoutSwitch:** three-way on every chassis (As listed | Proposed | Compare). While comparing, a floating Wipe | Side by side | Overlay segment shows. The dock's Compare popover and the phone layout pill are gone.
- **Dock:** Plan|3D, floors, sun, Show, Measure, Walk, Cameras (desktop), and the Capture popover. The phone dock has 44 px targets.
- **`lib/chassis.ts`:** has `isCompact` and `canEdit(mode, compact)`. On compact screens only Decorate and Furnish edit, and the read-only modes render inspectors in `<fieldset disabled>`. The phone sheet has a `hidden` detent.
- **Inspectors:** `Inspectors.tsx` is split by subject. `FloorSettings` and the stairs fields may now live in a new file, so builders grep for `FloorSettings` and `build.floor.stairs`, not line numbers.
- **Settings and inputs:** `NumberField` everywhere. Render quality has `auto` via `useQuality()`. CI runs `npm run check` and `npm run build`.
- **Persistence:** `PERSIST_VERSION` is 7 at HEAD and may move. Use "current + 1" (see Technical design).
- **Unchanged:** the shared project sync (`lib/sync.ts`) does not carry `mode` (grep confirms). Saved views do not store a mode.

## Design (what the user sees and does, per chassis: phone, desktop; iPad notes; every state: empty, selected, busy, error; before/after sketches in ASCII where they help)

### Modes

| Mode | Label | Icon (`MODE_ICON`) | Subtitle (`MODE_SUBTITLE`) | Phone |
|---|---|---|---|---|
| build | Build | house | Rooms, walls, doors, stairs and the exterior | view-only |
| decorate | Decorate | brush | Floors, walls and colours | edits |
| furnish | Furnish | sofa | Place furniture | edits |
| electrics | Electrics | plug | Lights, switches, sockets and circuits | view-only |
| **outside** | **Outside** | **tree** (exists in `icons.tsx`) | Garden, plot, neighbours and orientation | view-only |

The Build subtitle assumes Q1 = Build.

### Outside (Garden + Plot)

- One mode, one canvas (`SiteEditor`, mounted once with no `key={mode}`). Two **layers** sit under a segment: **Garden | Plot**.
  - **Garden** (default): surfaces and items take clicks. The rail shows Add, Select, Rectangle, Circle and Polygon, as Garden mode does today.
  - **Plot:** the boundary and neighbouring buildings take clicks, and the garden is drawn faded. The rail shows Select and Draw building, plus the clearance chips, as Plot does today.
- Switching layer keeps the camera, clears the selection and leaves the tool on Select.
- The segment sits in the Outside card header (`InspectorCard` head) on both tabs.
  - In 3D, the card shows GardenPanel or SitePanel by layer.
  - On the plan, the card shows the layer's inspector.
- Phone (iPhone, compact): Outside is view-only, but the segment still works: switching layer is viewing, not editing. iPad portrait (phone chassis, not compact) edits as Garden and Plot do today, without the draw tools (`FEATURES.phone.draw` is false).
- Undo: the layer is UI state, not in the undo history. Undo after a layer switch undoes the last model edit, as today.
- Empty state (no plot yet): `NoSite` as today, with the title "No plot yet". The segment is hidden.
- Busy: none new. The editor loads behind the existing `<Loader kind="blueprint">` "Opening the plan".
- Error: the existing `ErrorBoundary` "The plan hit a problem".

```
Outside card, desktop (300 px)          Phone peek (view-only, hidden until a tap)
┌──────────────────────────────┐        ┌────────────────────────────────────┐
│ Outside                    ⌄ │        │ Outside · Plot 177 m² · Garden 102 │
│ [ Garden | Plot ]            │        └────────────────────────────────────┘
│ Surfaces  6 · 54 m²        › │
│ Items     14               › │
└──────────────────────────────┘
```

### Exterior (Q1, recommended: Build)

- In Build, with nothing selected, the summary card gets a collapsed **Exterior** section (id `build.exterior`, the same `ExteriorPanel` content, summary `exteriorSummary(model)`) under the floor summary. It shows on both tabs.
- On phones it renders read-only, like the rest of Build.
- SitePanel loses nothing. PlotPanel is deleted (it was Site + Exterior).
- The remembered open state of `plot.exterior` is not carried over: `build.exterior` starts collapsed. Accept it.
- `ExteriorPanel` loads lazily (a new `ExteriorPanelLazy` in `lazyPanels.tsx`), so Build's first view does not grow.

### Review

- A **Review** button (clipboard icon + "Review") in the right island, just after the layout switch. Review is about comparing the layouts, so it sits next to them.
  - Pressed state while the page is open.
  - The page sits below the top bar, as today (`--z-review` < `--z-top`), so the bar stays usable.
- Close with ×, Esc, a second click on Review, or any mode button (which also switches mode). Closing returns to the mode you were in, because the mode never changed.
- On the phone, Review is an item in the house menu ("Review…"). It is not a tab and not a top-row button: the row is full.
- Palette: a new "Review" command (`review:open`) replaces "Mode: Review"; "Open report" and "Open planning check" stay.
- Empty state: no model means no Review button (as for undo/redo today, `hasLayout`).
- Busy: the existing `<Loader kind="blueprint">` "Opening the review" while `ReviewDocument` loads.
- Error: none new; the page's links that today call `leaveReview()` ("Open the 3D view" in `ReportPanel.tsx`, the saved-views link in `SavedViews.tsx`) call `closeReview()`.
- Walk: opening Review stops a walk, as today (`Viewer.tsx` `reviewing`). Compare: Review covers the canvas; closing it returns to the same compare state.
- Keyboard: Esc closes (as today, `ReviewDocument.tsx`); studio keys stay off while it is open; undo and redo still work.

### Plan | 3D

- **Desktop and tablet:** a two-way `.seg` at the left end of the centre island, divided from the modes by a 1 px `--line` rule. Tab still toggles it. The dock loses its first segment.
- **Phone (and iPad portrait, phone chassis):** stays in the dock. The quick-win top row is fixed and full, and the thumb owns the dock. Not an open question.
- In Outside on the plan, the dock hides floors, as it does today via `editsSite`.
- **Walk (desktop and tablet):** the top bar stays up while walking (only the phone hides it, `walk.css`), so Plan|3D is `disabled` while `useWalk.on`, with the title "Stop walking to switch to the plan". Today the dock's walking bar hides it, so this keeps behaviour.
- **Compare:** picking Plan while comparing ends the compare view, as today (`LayoutSwitch` treats compare as 3D only; `CompareStyle` hides on the plan).

### Top bar, 1440 px (desktop)

Widths are measured at HEAD with Playwright (islands, then mode buttons: Build 66, Decorate 90, Furnish 80, Electrics 87; Outside estimated 80; Plan|3D 109 as in the dock today). Insets 12 px each side, island gaps 12 px.

```
Before (HEAD, 1440)
┌ left 215 ─────────────┐ ┌ centre 564 ──────────────────────────────────────────────────┐ ┌ right 374 ─────────────────────────┐
│ ▲ │ Listing 91770873 ▾│ │ Build Decorate Furnish Electrics Garden Plot Review          │ │ As listed|Proposed|Compare ┆ ↶ ↷ ⌕ │
└───────────────────────┘ └──────────────────────────────────────────────────────────────┘ └────────────────────────────────────┘

After (1440)
┌ left 215 ─────────────┐ ┌ centre ≈ 545 ───────────────────────────────────────────┐ ┌ right ≈ 460 ──────────────────────────────────┐
│ ▲ │ Listing 91770873 ▾│ │ Plan|3D ┆ Build Decorate Furnish Electrics Outside      │ │ As listed|Proposed|Compare ▤ Review ┆ ↶ ↷ ⌕ │
└───────────────────────┘ └─────────────────────────────────────────────────────────┘ └───────────────────────────────────────────────┘
  215 + 545 + 460 + 2×12 gaps + 2×12 insets = 1268; spare 172.
```

Layout and widths:
- Keep HEAD's grid (`minmax(auto,1fr) auto minmax(auto,1fr)`): it already centres the centre island on the screen when both sides fit, and lets it slide when one side is wider. No new centring code.
  - 1440: the right island (460) is wider than half the free space (423), so the centre sits about 37 px left of screen centre. Fine.
  - 1920: wordmark and keycap return (left 290, right ≈ 525); total 1408; screen-centred.
- Centre island: Plan|3D 109, a 1 px `--line` rule with 6 px margins, five modes ≈ 417 (with the 2 px gaps and 3 px padding).
- Right island: layout switch 253, separator, Review ≈ 82 (icon + label), undo, redo, palette.

### Top bar, 1280 px (laptop)

HEAD's steps already apply below 1559 (mark only, palette without keycap) and below 1359 (`auto minmax(0,1fr) auto`). New: **under 1360 px Review shows its icon only** (`aria-label="Review"`, title "Review"), or the bar overflows between 1240 and 1255 px.

```
┌ left 215 ─────────────┐ ┌ centre ≈ 545 ───────────────────────────────────────────┐ ┌ right ≈ 396 ───────────────────────────┐
│ ▲ │ Listing 91770873 ▾│ │ Plan|3D ┆ Build Decorate Furnish Electrics Outside      │ │ As listed|Proposed|Compare ▤ ┆ ↶ ↷ ⌕ │
└───────────────────────┘ └─────────────────────────────────────────────────────────┘ └────────────────────────────────────────┘
  215 + 545 + 396 + 48 = 1204; spare 76 at 1280, 36 at 1240.
```

Further steps (iPad notes, not optimised):
- 1180-1239 (and coarse tablets ≥ 1120): HEAD's 1239 step (10 px button padding, "Listed", Compare icon) gives centre ≈ 460, right ≈ 340; 215 + 460 + 340 + 48 = 1063.
- **Under 1120 px (tablet chassis only, 900-1119):** the five modes collapse into a `Build ▾` menu button (≈ 120 px). Centre ≈ 230; 215 + 230 + 340 + 48 = 833, fits at 900. This also fixes HEAD's overlap at 900-1100.
- Below 900 the phone chassis takes over (tab bar, phone top row), including iPad portrait at 820. The ModeBar never renders there.

### Phone, 390 px

The top row is unchanged from the quick wins. The tab bar drops from 7 tabs to 5.

```
Before (HEAD)                                   After
┌────────────────────────────────────────┐      ┌────────────────────────────────────────┐
│ ▲ Listing 91770873 ▾        ↶  ↷  ⌕    │      │ ▲▾ │ Listed|Proposed|Compare │ ↶ │ ↷ │ │  (quick-win row)
│ ...                                    │      │ ...                                    │
│ [Plan|3D]           Ground floor ▾     │      │ [Plan|3D] floors ☀ Show ⌖ Walk ◫       │  (dock: Plan|3D stays here)
├────────────────────────────────────────┤      ├────────────────────────────────────────┤
│ Bld Dec Fur Ele Gar Plot Rev           │      │  Build  Decorate  Furnish  Electrics  Outside │
│ 7 × 55.7 px                            │      │  5 × 78 px, 12 px labels               │
└────────────────────────────────────────┘      └────────────────────────────────────────┘
```

House menu on the phone: Layouts…, Bring in updates…, Switch house…, Search… (the phone's only palette route, kept), **Review…**, **Settings…**, then Project (Export, Import, Clear all).

Phone landscape (844×390, phone chassis by height): same five tabs, ≈ 169 px each; nothing else changes.

### Settings dialog

A `Modal` ("Settings", 380 px wide; on the phone, full width with a 16 px gutter). It opens from the house menu's "Settings…" item and the palette's "Settings…" command.

| Row | Control | Shown |
|---|---|---|
| Render quality | `.seg` Auto · High · Balanced · Low (phone: Auto · Low) | always |
| Scroll wheel | `.seg` Auto · Zooms · Pans (hints as today, `WHEEL_OPTIONS`) | not on touch |
| Plan colours (only if Q2 = keep) | `.seg` Calm · Full | not on compact |
| Keyboard shortcuts… | link button, dispatches `OPEN_SHORTCUTS` | not on touch |

- No Save button: changes apply at once, as today. Esc or × closes it.
- No busy or error states: these are local prefs (render quality is `settings.quality` in the store; wheel and quiet are `panelPrefs`).
- The house menu item needs an icon: `icons.tsx` has no gear today; add a `settings` glyph in the same stroke style.
- Phone "Auto · Low" for render quality is a small-screen cut (owner goal: features may go on small screens); iPad portrait keeps all four, since it is not compact.

House menu after this change (desktop):
1. Layouts…
2. Bring in updates…
3. Switch house…
4. Settings…
5. Project group: Export JSON, Import JSON…, Clear all…
6. Footer: storage, sync, about.

The Settings group and the "Keyboard shortcuts…" item are gone (the `?` key, the palette and the dialog's link still open the sheet).

### Stairs (UX13, M part)

- Build, plan: a tap on the stair marker selects **the stairs**. The marker gets the selection outline, and the plan inspector shows **Stairs**: direction, turn, top turn, winders or steps, length and width, and Remove stairs. A drag still moves them.
  - Delete or Backspace with the stairs selected removes them (one undo step, via `updateFloor`); Esc clears the selection.
  - Phone (compact, Build view-only): `stairsDown` returns early today when `!canEditNow`. Change it so a tap still selects the stairs and shows `StairsPanel` read-only (`ReadOnlyBody` / `<fieldset disabled>`); no drag.
- Build summary (plan tab): the Stairs section leaves `FloorSettings`. When the floor has no stairs, the summary shows a single "Add stairs" button, which places them at the rooms' centre (the existing code at `Inspectors.tsx:1465`).
- 3D: already no stairs rows at HEAD (`FloorSettings` is plan-only).

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

### `src/lib/modes.ts`

- `type Mode = "build" | "decorate" | "furnish" | "electrics" | "outside"`.
- Update `MODES`, `MODE_LABEL`, `MODE_ICON` (`outside: "tree"`) and `MODE_SUBTITLE`.
- `PLAN_TOOLS`: drop `garden`, `plot` and `review`, and add `outside: []`. The site editor builds its own rail.
- `SELECTABLE`: drop the same three, add `outside: []`, and add `"stairs"` to `SelKind` and to `build`.
- `PlanSelection` gains `stairs?: true`. `pruneSelection` keeps it only when `canSelect(mode, "stairs")`.
- `editsSite = (m) => m === "outside"`.
- New `export type SiteLayer = "garden" | "plot"`, which replaces `SiteMode` in `editor/site/types.ts` (re-export it there to keep imports short).
- `ModeUi` gains `siteLayer: SiteLayer`. `modeSwitchPatch` sets `siteLayer: "garden"` when entering Outside from another mode, and leaves it alone otherwise.
- New `export function legacyMode(v: unknown, before?: unknown): Mode`:
  - garden or plot → outside
  - review → `legacyMode(before)`, or build
  - a valid mode stays as it is
  - anything else → build

### `src/store.ts`

- Remove `modeBeforeReview` and `leaveReview` (lines 92-94, 301-306, 455, 482) and drop them from `Persisted` (line 187). `setMode` becomes `rawSet((st) => modeSwitchPatch(st, m))`.
- `leaveReview` callers outside the store: `reviewState.ts` `closeReview`, `SavedViews.tsx:97`, `ReportPanel.tsx:508`. The last two become `closeReview()`.
- Add `siteLayer: SiteLayer` (default `"garden"`, **not persisted**) and `setSiteLayer(l)`, which also clears `gardenSel`.
- `merge`: `merged.mode = legacyMode(merged.mode)`.

### `src/lib/migrate.ts`

- `PERSIST_VERSION` goes to current + 1 (8 if nothing else bumped it).
- In `migratePersisted`, for `version < NEW`: `st.mode = legacyMode(st.mode, st.modeBeforeReview); delete st.modeBeforeReview`.
- `editFloorId === "site"` stays valid: Outside edits the site.
- Each house has its own store key (`houseKey`, `storageSuffix`), so the migration runs once per house on hydrate.

### Review open state (`src/components/reviewState.ts`)

- `useReview` gains `open: boolean`.
  - `openReview(section)` sets `{ open: true, section, nonce+1 }` and no longer touches the mode.
  - `closeReview()` sets `{ open: false, section: undefined }`.
  - Add `toggleReview()`.
- It is not persisted: a reload lands in the editor.
- Readers of `mode === "review"`, each switching to `useReview((s) => s.open)` or dropping the check:
  - `ReviewPage.tsx:12`
  - `Viewer.tsx:122` (stop walking while reviewing)
  - `useStudioKeys.ts:37` (keys off while reviewing)
  - `App.tsx:181` (`showInspector`)
  - `PlanEditor.tsx:403` (delete the check)
  - `ModePanel.tsx:37` (delete)
- `setMode` from a mode button also calls `closeReview()`. Wire this in `ModeBar` and `TabBar`, not the store, so the store stays free of UI.

### Components

| File | Change |
|---|---|
| `components/TopBar.tsx` | Centre island = `<ViewSwitch/>` (new, the Plan/3D `.seg` moved out of Dock, using `tabSwitchPatch`; `disabled` while `useWalk.on`) + `<ModeBar/>`. The right island gains `<ReviewButton/>` after `LayoutSwitch`. Phone renders neither (its row is the quick-win row). |
| `components/ModeBar.tsx` | Five modes. On the tablet chassis under 1120 px, a menu button (`Build ▾`) with the five as `menuitemradio`. Calls `closeReview()` on pick. |
| `components/Dock.tsx` | Remove the Plan/3D segment except on the phone (`chassis === "phone"`). Sun title (line 113): "Add a plot under Outside → Plot to use the sun study". |
| `components/mobile/TabBar.tsx` | Five tabs from `MODES`; calls `closeReview()` on tap. `mobile.css:12`: labels 12 px. |
| `components/ModePanel.tsx` | `mode === "outside"` → `<OutsidePanelLazy/>`. Delete the plot, garden and review branches. |
| `components/lazyPanels.tsx` | `PlotPanelLazy` → `OutsidePanelLazy` ("Opening Outside…"); add `ExteriorPanelLazy` for Build (Q1). |
| `components/PlotPanel.tsx` | Delete. New `components/OutsidePanel.tsx`: card-head segment Garden or Plot (`siteLayer`), body `GardenPanel` or `SitePanel`. |
| `components/SitePanel.tsx` | `setMode("plot")` (line 64) → `setMode("outside"); setSiteLayer("plot")`. Copy at :126 → "Garden surfaces, planting and furniture are under Outside → Garden." |
| `components/GardenPanel.tsx:29`, `SunlightSection.tsx:80`, `ViewMenu.tsx:95` | Copy: "Plot mode" / "Plot panel" / "under Plot" → "Outside → Plot". |
| `editor/SiteEditor.tsx` | Prop `mode` removed. Read `siteLayer` from the store, and `garden = siteLayer === "garden"`. Card title "Outside". On a layer change, reset `tool` to select, `polySel`/`draft`/`armed`/`runStart` to null, `polyPts` to `[]`, and close the Add popover (one `useEffect` on `siteLayer`). Add `data-mount` (a `useId`) on the root for the no-remount check. |
| `editor/site/SiteLayers.tsx` | `mode: SiteMode` → `layer: SiteLayer` (rename only). |
| `App.tsx:287` | `{editingSite && <SiteEditor />}`, with no key. |
| `editor/ModeSummaries.tsx` `BuildSummary` | Add `<Section id="build.exterior">` with `ExteriorPanelLazy` on both tabs (Q1). |
| `FloorSettings` (in `Inspectors.tsx` or its split file) | Remove the Stairs section; keep "Add stairs" only when `!floor.stairs`. |
| `editor/plan/useDrag.ts` `stairsDown` | `tap: () => select({ stairs: true })` in Build. Other modes keep `backgroundTap`. When `!canEditNow`, still take the tap (select, no drag). |
| `editor/plan/useKeys.ts` | Delete/Backspace with `sel.stairs` → `updateFloor(..., { stairs: undefined })`. |
| `editor/plan/useSelection.ts`, `layers/*` stairs layer | Hold and draw `stairs` selection (outline in `--sel`). |
| `editor/plan/chrome/PlanInspector.tsx` | `sel.stairs` → `<StairsPanel/>` (new, the moved stairs fields, in the split-inspector folder). |
| `components/HouseMenu.tsx` | Delete the Settings group (`<h3>Settings</h3>`, lines 118-149) and the "Keyboard shortcuts…" item (the `?` key and the palette still open the sheet, and the Settings dialog links to it). Add "Settings…" (dispatches `OPEN_SETTINGS`) and, on the phone chassis, "Review…". Keep "Search…" on the phone. |
| `components/SettingsDialog.tsx` (new) | `Modal` with the rows above. `RenderQuality` is reused from `SettingsPanel.tsx`. Listens for `OPEN_SETTINGS`. Mounted once in App beside `ShortcutSheet`. |
| `lib/studio.ts` | `export const OPEN_SETTINGS = "house:open-settings"`. |

### Commands and keys

- `lib/commands.ts`:
  - `plan:site` → "Outside: Plot" (`setMode("outside"); setSiteLayer("plot"); tab plan`)
  - `plan:garden` → "Outside: Garden"
  - the `mode:*` loop yields five entries, with `modeWords.outside = ["garden","plot","site","boundary","neighbours","orientation"]`
  - `review:report` and `review:planning` are unchanged (they dispatch `house:open-review`); add `review:open` "Review" (group "Review"), since "Mode: Review" goes
  - add `settings:open` "Settings…" (group "Settings")
  - `canvas:quiet`/`canvas:full` (lines 200-201): delete (Q2 = cut) or retitle "Plan colours: Calm/Full"
  - `CommandCtx` gains `setSiteLayer`
- `useStudioKeys.ts`: no new keys. Digits stay floors, and Tab stays Plan/3D. The `editsSite` guard (line 63) is unchanged. Review gating (line 37) reads `useReview.getState().open`. Tab while walking: unchanged (the walk owns the keys).
- `lib/shortcuts.ts` `SHORTCUT_GROUPS`: add an **Outside** group listing the site editor's existing keys (its `onKeyDown`, the `k === "v"` chain: V select, F fit, +/− zoom; Garden: A add, R/C/P surfaces, Q/E turn, Enter/Backspace while drawing a polygon; Plot: B building). They are undocumented today.
- No mode shortcuts: the palette's "Mode: …" covers them, and digits are taken.

### Quiet / Plan colours (Q2, recommended: cut)

- **Either way:** fix the dead checkbox. In `NeighbourMass` test `trueColours` before `quiet`, so ticking "Neighbours in their own colours" always shows them.
- If cut: keep the quiet look as the only look.
  - Delete `quiet` from `panelPrefs.ts` (state, `setPrefs` type, `partialize`). zustand's persist drops the stale key on the next write.
  - Delete the `quiet` branches:
    - `Handles.tsx` (always quiet)
    - `PlanEditor.tsx:72,260,366-367`
    - `Site.tsx` (always the quiet ground; `NeighbourMass` picks true colours when `trueColours`, else quiet massing; drop `cardBase` if it is now unused)
    - `Lighting.tsx:398` (always `QUIET_FOG`)
    - `SiteItems.tsx` (`buildGarden`'s `quiet` argument; no leaf jitter)
    - `HouseMenu.tsx` (the row goes with the Settings group anyway)
- If kept: a "Plan colours" row in the Settings dialog, not on compact screens.

### Tests to add or change

| Test | Change |
|---|---|
| `lib/modes.test.ts` | "lists the five modes in order". Rename the Plot/garden describes to Outside (site entry and exit, floor restore, `siteLayer` reset to garden on entry). `canSelect(build, "stairs")`. `legacyMode` table (garden, plot, review with and without `before`, bogus). |
| `storeModes.test.ts` | `setMode("outside")` (line 27). Line 52's `merge({ mode: "plot" })` now → outside. `merge({ mode: "review" })` → build. |
| `storeStudio.test.ts` | Delete the review enter/leave tests (lines 13-32) and the `modeBeforeReview` merge asserts (36-46). Add `openReview`/`closeReview` leaving `mode` alone. Keep `editFloorId: "site"` with `mode: "outside"`. |
| `lib/migrate.test.ts` | Old version with `mode: "garden"` → outside. `mode: "review", modeBeforeReview: "decorate"` → decorate, and `modeBeforeReview` removed. |
| `lib/commands.test.ts:132-141` | "Mode: Review" → the new "Review" command dispatches `house:open-review`. "Mode: Plot" → "Mode: Outside". "Site plan (Plot)" → "Outside: Plot", calling `setMode("outside")` and `setSiteLayer("plot")`. |
| `lib/planKeys.test.ts:44`, `lib/planHit.test.ts:60` | Replace "review" with "outside". |
| `lib/chassis.test.ts:56` | Loop over `["build", "electrics", "outside"]`. |
| `scripts/test-garden.cjs:30,187` | `setMode('garden')` → `setMode('outside')` + `setSiteLayer('garden')`. The "Plot mode no longer selects surfaces" block (around :186) → Plot layer. |
| `scripts/test-touch-plan.cjs:103` | Same as test-garden. |
| `scripts/editor-regression.mjs:335,1252` | `setMode("plot")` → outside + layer plot. `toGarden` switches the layer, so there is no remount wait. |
| `scripts/shoot-chassis.cjs:42,59,62` | Views `plan-garden`, `plan-plot` → `plan-outside-garden`, `plan-outside-plot`. `review` opens via `openReview` (dispatch `house:open-review`). It shoots phone and tablet sizes only. |
| `scripts/test-electrics.cjs:105-106,268` | Unchanged; the mode-bar fit and tab-label clip checks keep passing with five. |
| New `scripts/test-topbar.cjs` | See Acceptance checks. |

### Performance and accessibility

- No `key={mode}` remount: a Garden↔Plot switch costs a re-render, not a fresh SVG tree and a camera refit. test-topbar logs click-to-second-`requestAnimationFrame` for the switch; target ≤ 50 ms headless at 1440 (SwiftShader), and no `data-mount` change.
- No new animation; the segments and menu follow the existing `prefers-reduced-motion` block in `styles.css`, and the phone's gesture fade is untouched.
- Review open state moves out of the persisted store, so opening Review no longer writes `localStorage`.
- One fewer persisted field.
- Accessibility:
  - The mode bar stays `nav[aria-label="Mode"]` with `aria-current="page"`.
  - Plan|3D is `role="group" aria-label="Plan or 3D"` with `aria-pressed`.
  - The Review button has `aria-pressed` and `aria-controls` pointing to the review page id.
  - The Garden|Plot segment has `role="group" aria-label="Outside layer"`.
  - The Settings dialog uses `Modal` (`role="dialog"`, focus trap and Esc as today).
  - The collapsed mode menu (tablet, under 1120 px) uses `menuitemradio`.
  - The disabled Plan|3D while walking keeps a title explaining why.
- Targets: desktop ≥ 32 px high; phone tabs 78×56.

## Build plan (chunks for parallel Sonnet builders in separate worktrees: for each chunk the files it owns, the files it must stay out of, the steps, and how to verify; note the order and dependencies)

Order: **A** first (alone), then **B, C, D, E** in parallel worktrees, then **F**. Merge D before E (both touch `PlanEditor.tsx`, in different hunks), and B before D (both add one line to `App.tsx`). Every chunk uses the session's commit trailer.

| Chunk | Suggested name | Model |
|---|---|---|
| A Core | Kylie | Sonnet medium |
| B Outside | Dua Lipa | Sonnet medium |
| C Top bar | Madonna | Sonnet medium |
| D Settings | Adele | Sonnet medium |
| E Stairs and Exterior | Prince | Sonnet medium; Opus review of the selection change |
| F Docs and scripts | Lorde | Haiku low |

### A: Core (modes, store, migration, review state)

- **Owns:** `lib/modes.ts`, `store.ts`, `lib/migrate.ts`, `components/reviewState.ts`, `lib/commands.ts` (including the `canvas:*` pair, per Q2), `lib/studio.ts` (`OPEN_SETTINGS`), `lib/shortcuts.ts`, `components/lazyPanels.tsx` (add `ExteriorPanelLazy` only), and their tests (`modes`, `storeModes`, `storeStudio`, `migrate`, `commands`, `planKeys`, `planHit`, `chassis`).
- **Outside its own files:** only the minimum mechanical edits that keep the build compiling, as one-line changes:
  - `PlanEditor.tsx:403`, `App.tsx:181`, `Viewer.tsx:122`, `useStudioKeys.ts:37`, `ReviewPage.tsx:12` (review checks → `useReview` `open`)
  - `ModePanel.tsx:35-37` (temporarily `outside` → `PlotPanel`)
  - `App.tsx:287` (`mode="garden"` until B)
  - `SitePanel.tsx:64`
  - `SavedViews.tsx:97`, `ReportPanel.tsx:508` (`leaveReview()` → `closeReview()`)
- **Stay out of:** every other UI file.
- **Steps:** types and constants; `legacyMode`; store edits; migration; `useReview.open` and `toggleReview`; commands (`review:open`, `settings:open`, Outside entries, `canvas:*`); Outside shortcut group; tests; compile-only edits.
- **Verify:** `npm run check` and `npm run build`. The migration is covered by `migrate.test.ts` and `storeModes.test.ts` (no devtools step needed).

### B: Outside canvas and panel (after A)

- **Owns:** `editor/SiteEditor.tsx`, `editor/site/*`, `components/OutsidePanel.tsx` (new), `PlotPanel.tsx` (delete), `GardenPanel.tsx`, `SitePanel.tsx`, `SunlightSection.tsx`, `ViewMenu.tsx` copy, `components/ModePanel.tsx`, `components/lazyPanels.tsx` (swap `PlotPanelLazy` for `OutsidePanelLazy`), `App.tsx` (line 287 only), `scripts/test-garden.cjs`, `scripts/test-touch-plan.cjs`, `scripts/editor-regression.mjs`.
- **Stay out of:** TopBar, Dock, HouseMenu, `editor/plan/*`, `ModeSummaries.tsx`, `three/*`.
- **Steps:** `siteLayer` reads; layer reset effect; the segment in OutsidePanel and the SiteEditor card; `data-mount`; remove `key`; copy; scripts.
- **Verify:**
  - `npm run check`
  - `PORT=<n> node scripts/test-garden.cjs` and `PORT=<n> node scripts/test-touch-plan.cjs`
  - `npm run regress:editors -- --port <n>`
  - `npm run house:shot` (or a Playwright snippet) of Outside → Garden and Outside → Plot at 1440×900 and 390×844

### C: Top bar, Review button, Plan|3D (after A)

- **Owns:** `components/TopBar.tsx`, `ModeBar.tsx`, `ViewSwitch.tsx` (new), `ReviewButton.tsx` (new), `Dock.tsx`, `Dock.css`, the top-bar block of `styles.css` (lines 62-118 at HEAD), `mobile/TabBar.tsx`, `mobile.css`, `ReviewPage.tsx`, `ReviewPage.css`, `scripts/test-topbar.cjs` (new).
- **Stay out of:** HouseMenu (D), editor files (B and E), `lib/*` (A), `three/*`.
- **Steps:**
  1. Move the Plan/3D segment out of the dock into `ViewSwitch` (dock keeps it on the phone chassis); disable it while walking.
  2. Keep HEAD's grid; add `topbar-mid` children and the 1 px rule.
  3. New media rules: under 1360 px Review is icon-only; `.app[data-chassis="tablet"]` under 1120 px shows the `Build ▾` menu and hides the button row (both rendered, CSS picks: no resize listener).
  4. Review button with `toggleReview`; `aria-pressed`.
  5. Mode buttons and tabs call `closeReview`.
- **Verify:** `npm run check`; `PORT=<n> node scripts/test-topbar.cjs` (writes screenshots to `OUT`) at 1920×1080, 1440×900, 1280×800, 1180×820, 1024×768, 820×1180 and 390×844; `PORT=<n> node scripts/test-walk-d.cjs` still passes.

### D: Settings dialog and house menu (and Quiet, per Q2) (after A)

- **Owns:** `components/HouseMenu.tsx`, `HouseMenu.css`, `SettingsDialog.tsx` (new), `SettingsPanel.tsx`, `panelPrefs.ts`, `icons.tsx` (the `settings` glyph), `App.tsx` (one mount line beside `ShortcutSheet`, line 307; a different hunk from B's), `three/Site.tsx`, `three/Lighting.tsx`, `three/SiteItems.tsx`, `editor/plan/layers/Handles.tsx`, the quiet lines of `editor/PlanEditor.tsx` (72, 260, 366-367), `scripts/test-settings.cjs` (new).
- **Stay out of:** TopBar, Dock, SiteEditor, `lib/commands.ts` (A handles `canvas:*`), the rest of `PlanEditor.tsx` (E may touch the stairs layer props there; merge D before E).
- **Verify:**
  - `npm run check`
  - `PORT=<n> node scripts/test-settings.cjs`: the house menu has no `.seg`; "Settings…" opens `[role=dialog][aria-label=Settings]`; at 390×844 the dialog has no Scroll wheel row; Esc closes it
  - neighbour colours: with "Neighbours in their own colours" ticked, a 3D Outside screenshot at 1440 differs from unticked (pixel diff > 1 %)

### E: Stairs selection and Exterior in Build (UX13 M part, Q1) (after A)

- **Owns:** `editor/plan/useDrag.ts` (`stairsDown`), `useSelection.ts`, `useKeys.ts` (stairs Delete), `editor/plan/layers/Stairs.tsx`, `plan/chrome/PlanInspector.tsx`, the inspector file holding `FloorSettings`, a new `StairsPanel.tsx`, `editor/ModeSummaries.tsx`, the stairs-layer props in `PlanEditor.tsx`, `scripts/test-stairs.cjs` (new).
- **Stay out of:** `lib/modes.ts` (A adds `"stairs"`), SiteEditor, TopBar, the quiet lines of `PlanEditor.tsx` (D).
- **Verify:**
  - `npm run check`
  - `npm run regress:editors -- --port <n>`
  - `PORT=<n> node scripts/test-stairs.cjs` on listing 91770873: Build plan, tap the stair marker → the inspector heading is "Stairs"; a drag changes `floor.stairs`; Delete removes them and undo brings them back; at 390×844 the tap shows Stairs read-only (`fieldset[disabled]`); the 3D Build card has a collapsed "Exterior" section and no "Stairs" text

### F: Docs and script sweep (after B to E merge)

- **Owns:**
  - `docs/modes-brief.md`: add a dated note that the modes are now Build/Decorate/Furnish/Electrics/Outside and Review is a page. The label rule "don't rename on-screen labels without reason" stands; the reasons for these renames are recorded here.
  - `docs/studio-plan.md`: add notes under §1.8, §3.1, §3.2, §3.4, §3.5, §3.7 and 12B pointing here.
  - `CLAUDE.md` code map lines naming "Plot and Garden modes"
  - `README.md`: "the seven modes" (line 18) and "Settings → render quality" (Walk paragraph)
  - `scripts/shoot-chassis.cjs`
  - `docs/review-2026-11.md` "Built" list
- **Verify:** `npm run build`, then `PORT=<n> OUT=<dir> node scripts/shoot-chassis.cjs` runs with no `pageerror`.

### Studio-plan and brief decisions this reverses

| Where | Was | Now |
|---|---|---|
| studio-plan §1.8 | Review is a mode; `modeBeforeReview`; `leaveReview` | Review is a page with `useReview.open`; no mode change |
| studio-plan §3.1 | `editingSite = mode === "plot"` | `editsSite(mode)` = outside |
| studio-plan §3.2 | Centre = ModeBar only | Centre = Plan|3D + ModeBar; right gains Review |
| studio-plan §3.4 | House menu Settings group | Settings dialog |
| studio-plan §3.5 | Dock item 1 is Plan/3D; floors hidden in Plot | Plan/3D in the top bar (phone keeps it in the dock); floors hidden in Outside on the plan |
| studio-plan §3.7 | `ReviewPage` opens when `mode === "review"`; `closeReview()` calls `leaveReview()` | Opens on `useReview.open`; `closeReview()` only clears it |
| studio-plan 12B (§2.7) | "Site plan (Plot)" command | "Outside: Plot" |
| modes-brief "Decisions", Modes list | Build / Decorate / Furnish / Plot / Review (Garden and Electrics came later) | Build / Decorate / Furnish / Electrics / Outside, plus a Review page |
| modes-brief label rule ("don't rename on-screen labels without reason") | Garden, Plot, Review are mode labels | Renamed with reasons recorded here: Garden+Plot → Outside (one canvas), Review → a button (not a mode) |
| modes-plan §2 and §11 | `plot.site` / `plot.exterior` sections under Plot; "Site", "Exterior" labels kept | Labels kept; Exterior moves to `build.exterior` (Q1) |

## Acceptance checks (runnable: npm run check and build, which Playwright scripts or new checks, which screenshots at which sizes, and measurable targets)

- `npm run check` and `npm run build` pass, and CI is green.
- `npm run regress:editors -- --port <n>` passes.
- `PORT=<n> node scripts/test-garden.cjs`, `test-touch-plan.cjs`, `test-electrics.cjs` and `test-walk-d.cjs` pass.
- Vitest: `legacyMode` table; `migratePersisted` at the old version (`mode: "plot"` → outside; `mode: "review", modeBeforeReview: "decorate"` → decorate, field gone); `merge({ mode: "garden" })` → outside.
- New `scripts/test-topbar.cjs` (C; all against a dev server, `PORT=<n>`):
  - 1920×1080, 1440×900, 1280×800, 1240×800, 1180×820 (mouse): the three islands' boxes do not overlap and keep ≥ 8 px apart. Five `nav.mode-bar button` visible. `[aria-label="Plan or 3D"]` inside `header.topbar`; none inside `.dock`.
  - 1440: `nav.mode-bar` ≤ 430 px wide (556 at HEAD); spare width ≥ 150 px.
  - 1024×768 (mouse, tablet chassis): the `Build ▾` menu is visible, `nav.mode-bar` buttons are not, no overlap; the menu sets the mode.
  - 1180×820 touch (iPad landscape, tablet chassis): full mode bar, no overlap.
  - 820×1180 touch (phone chassis): 5 `.tab-bar button`, no `nav.mode-bar`, Plan|3D in the dock.
  - 390×844 touch: 5 `.tab-bar button`, each ≥ 74 px wide; Plan|3D in the dock; the house menu has "Search…", "Review…" and "Settings…". 844×390: 5 tabs, labels not clipped.
  - Walk at 1440: after `requestWalk`, the Plan|3D buttons are `disabled`; after Stop they are enabled.
  - Review: click Review → `.review-page` visible, button `aria-pressed="true"`; Esc → gone, `mode` unchanged; open Review, click Furnish → gone, `mode === "furnish"`; `localStorage` value for the store key unchanged by open/close.
  - Migration (end to end): before load, `localStorage.setItem(key, JSON.stringify({ state: { mode: "plot", modeBeforeReview: "decorate" }, version: 7 }))`, with `key` = `"house-modeler"` + the house's `storageSuffix` (find it with `Object.keys(localStorage)` after a first load), reload → `__houseStore.getState().mode === "outside"`. With `mode: "review"` → `"decorate"`.
  - Outside: on the plan, select a garden item, flip Garden → Plot. Same `data-mount` value (no remount), `gardenSel` empty, switch time logged (≤ 50 ms headless).
  - Screenshots to `OUT`: 1440×900 and 1920×1080 `plan-build`, `plan-outside-garden`, `plan-outside-plot`, `3d-build` (Exterior collapsed), `review`, `housemenu`, `settings`; 1280×800, 1180×820 and 1024×768 `plan-build`; 390×844 `plan-build`, `plan-outside-plot`, `housemenu`. The owner eyeballs these. (`shoot-chassis.cjs` covers phone and tablet only.)
- Copy grep: `rg -n '"(plot|garden|review)"' src -g '!*.test.ts'` returns only non-mode uses: `SiteLayer`, `UpdateGroup` and `siteMerge` (`"garden"` group), `siteDiff`, `wallSteps`, and the startup prompt's `"review"` answer (`startupPrompt.ts`, `startupDialog.ts`).
- `rg -n "leaveReview|modeBeforeReview|PlotPanel" src` returns nothing.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Muscle memory: the owner looks for Garden or Plot | The palette keeps "Garden", "Plot", "Site" as keywords for Outside. Outside opens on Garden. The Sun tooltip and empty states say "Outside → Plot". |
| A bad migration lands someone in an invalid mode | `legacyMode` runs in both `migratePersisted` and `merge`, and is table-tested. Unknown → build. |
| The top bar overflows at in-between widths (1240-1255 px with a labelled Review; 900-1100 on the tablet chassis, already broken at HEAD) | Review goes icon-only under 1360; the tablet ModeBar collapses under 1120; the bounding-box test runs at seven sizes, including 1240 and 1024. A longer house name than listing 91770873's widens the left island: nothing truncates it at HEAD (`HouseMenu.css` has no ellipsis), so C caps the name at 220 px in the top-bar block of `styles.css` with `text-overflow: ellipsis` (full name in the title), and the test also runs with a 40-character name. |
| Plan|3D in the top bar during a desktop walk | Disabled while walking (checked in test-topbar). |
| Chunks drift from line numbers once the quick wins land | Line numbers here are HEAD (2816051); builders grep the named symbol first. |
| The Garden/Plot layer state is invisible on the phone sheet's hidden detent | The peek line names the layer ("Outside · Plot …"). The segment shows when the sheet opens. |
| Exterior in Build makes the Build card longer | A collapsed Section with a one-line summary, the same as today under Plot. |
| Stairs tap no longer selects the room under it | Only in Build. A tap elsewhere in the room still selects the room. Opus reviews the drag change. |
| Quick wins landed differently from the Assumptions | Every chunk greps symbols first (`canEdit`, `FloorSettings`, `PERSIST_VERSION`, `LayoutSwitch`) and adapts. Chunk A writes down the actual version number in its commit. |
| Review no longer survives a reload | Intended: a reload lands in the editor. Noted for the owner (Q4). |

## Open questions for the owner (each with options and a recommendation; only real decisions, not things the code can answer)

1. **Where does the Exterior (roof, eaves, walls, chimneys) live?**
   - (a) Build: a collapsed Exterior section in the Build summary
   - (b) Outside: a third layer or section
   - (c) split: shape (roof, eaves, chimneys) to Build, finishes (render, brick, colours) to Decorate
   - **Recommend (a).** The roof is part of the building, Build already owns walls and stairs, and (c) splits one panel across two modes.
2. **Canvas Quiet/Full: cut or relabel?** (The dead neighbour-colours checkbox is fixed either way.)
   - (a) cut it and keep the quiet look always. It is the default and deletes about 40 lines, but it **removes a desktop option**: Full's handles on every room, coloured room fills in Build, Furnish and Electrics, the textured 3D ground, the farther fog and leaf colour variety.
   - (b) keep it in the Settings dialog as "Plan colours: Calm | Full" (desktop and tablet only)
   - **Recommend (a)**, since few will miss Full and the code gets simpler; pick (b) if you use Full yourself.
3. **How does Outside switch between Garden and Plot?**
   - (a) a visible **Garden | Plot** segment in the Outside card
   - (b) a collapsible "Plot" section whose opening switches the canvas to the Plot layer
   - (c) one merged layer where everything is selectable
   - **Recommend (a).** It is explicit and two-state, with no hidden mode behind a disclosure. (c) brings back the boundary-versus-surface hit conflicts that the split fixed.
4. **Should an open Review survive a reload?**
   - (a) no: a reload lands in the editor
   - (b) yes: persist `useReview.open`
   - **Recommend (a).** It is simpler, and Review is one click away.
5. **What is the merged mode called?** (The modes-brief rule says no renames without reason.)
   - (a) **Outside**: covers garden, plot, neighbours and sun
   - (b) **Garden**: the friendlier word, but plot boundaries and neighbours are not garden
   - (c) **Site**: accurate, but jargon
   - **Recommend (a).** It is the word review-2026-10 proposed, and the palette keeps "garden", "plot" and "site" as keywords.

(Plan|3D on the phone is not a question: the quick-win phone top row is fixed, so it stays in the dock.)

## Out of scope

- The lean phone shell (review-2026-11 proposal 1).
- Selecting furniture or points in 3D (UX10).
- One-canvas compare (PERF5).
- Splitting SiteEditor into smaller files (CODE7). This spec only removes its `mode` prop.
- Mode shortcuts on number keys.
- A Settings page for sync or the server passcode.

## Effort (S/M/L per chunk and in total)

| Chunk | Size |
|---|---|
| A Core (modes, store, migration, review state, commands) | M |
| B Outside canvas and panel | M |
| C Top bar, Review button, Plan|3D | M |
| D Settings dialog, house menu, Quiet cut | S |
| E Stairs selection and Exterior in Build | M |
| F Docs and scripts | S |
| **Total** | **L** (about four builder-days, with one Opus review on E; A is on the critical path, then B-E in parallel) |
