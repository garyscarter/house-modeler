# Five modes and a calmer top bar

Status: proposal, not started. Written 31 Oct 2026. Source findings: UX11, UX12, UX2 and UX3 (top-bar parts), UX13 (stairs in 3D), plus review-2026-10's "Plot hides the roof" / "Outside" and Plan/3D-in-the-top-bar items (docs/review-2026-10.md lines 52-53, 140, 149).

Author: Taylor Swift (planning). The house is "listing 91770873" throughout.

## Why (the problem, with numbers and evidence)

- **Seven modes, two of them not modes.** `MODES` in `src/lib/modes.ts` lists build, decorate, furnish, electrics, garden, plot and review.
  - Review is a full-screen page with its own × (`ReviewPage.tsx`, `reviewState.ts` `openReview`/`closeReview`). It needs a `modeBeforeReview` field (store.ts:91-94) only to get back out again. Its `PLAN_TOOLS` and `SELECTABLE` entries are never seen because the page covers the plan.
  - Garden and Plot are one canvas. App.tsx:288 renders `<SiteEditor key={mode} mode={mode === "garden" ? "garden" : "plot"} />`, so switching between them remounts the whole editor and refits the camera. The only difference is which layer takes clicks (`SiteLayers.tsx:55-118`, `SiteEditor.tsx:361-385`).
  - "Plot" hides the roof. Exterior (roof, eaves, walls, chimneys) lives in `PlotPanel.tsx` under a Section called "Exterior", and nobody looks for a roof under "Plot" (review-2026-10).
- **The mode bar is wide.** At 1440 px the 7-mode pill is 556 px wide (442 to 998 px in `desktop-plan-plot.png`). On the phone the tab bar has 7 buttons at about 56 px each (`mobile/TabBar.tsx`), and labels are 11 px (`mobile.css:11`).
- **Plan/3D is the biggest view change and the smallest control.** It is the first segment of the dock (`Dock.tsx`, the `.seg[aria-label="Plan or 3D"]`), at the bottom of the screen, away from the modes it changes.
- **The house menu mixes project actions with settings** (`HouseMenu.tsx:102-143`): Render quality, Look, Scroll wheel and "Canvas Quiet | Full" sit beside Layouts, Export and Clear all. "Canvas Quiet/Full" means nothing to a first-time user.
  - What Quiet really does (checked at HEAD; the UX12 verifier's note was incomplete):
    - plan: handles show only on the selected or hovered room (`Handles.tsx:46`), and fills are neutral in Build, Furnish and Electrics (`PlanEditor.tsx:239`)
    - 3D: matte ground (`Site.tsx:42,65`), grey neighbour massing (`Site.tsx:904`), a nearer fog (`Lighting.tsx:398`), and no leaf colour jitter (`SiteItems.tsx:363`)
  - It defaults to on (`panelPrefs.ts:41`). It also beats the "Neighbours in their own colours" checkbox in SitePanel, because `NeighbourMass` checks `quiet` before `trueColours` (`Site.tsx:904-910`). With the default setting, that checkbox does nothing. This is a live bug.
- **The stairs settings sit in the wrong place.** The Build summary card (`ModeSummaries.tsx:65` → `FloorSettings`, `Inspectors.tsx:1383`) carries a Stairs section in 3D. On the plan, a tap on the stair marker selects the room under it instead (`plan/useDrag.ts` `stairsDown`, "A tap on the marker selects the room under it").

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

Assumed landed before this work starts (all from the 31 Oct quick-win pass):
- **Glass:** removed. The canvas is full-bleed on every chassis, and `--float-top` sits under the floating islands.
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
- **Persistence:** `PERSIST_VERSION` may have moved past 7. Use "current + 1" (see Technical design).
- **Not assumed:** the 3D hiding of `FloorSettings` (the UX13 S part). If it has not landed, chunk E does it.
- **Unchanged:** the shared project sync (`lib/sync.ts`) does not carry `mode` (grep confirms). Saved views do not store a mode.

## Design (what the user sees and does)

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

### Review

- A **Review** button (clipboard icon + "Review") in the right island, just after the layout switch. Review is about comparing the layouts, so it sits next to them.
  - Pressed state while the page is open.
  - The page sits below the top bar, as today (`--z-review` < `--z-top`), so the bar stays usable.
- Close with ×, Esc, a second click on Review, or any mode button (which also switches mode). Closing returns to the mode you were in, because the mode never changed.
- On the phone, Review is an item in the house menu ("Review…"). It is not a tab and not a top-row button: the row is full.
- Empty state: no model means no Review button (as for undo/redo today, `hasLayout`).
- Busy: the existing `<Loader kind="blueprint">` "Opening the review".

### Plan | 3D

- **Desktop and tablet:** a two-way `.seg` at the left end of the centre island, divided from the modes by a 1 px `--line` rule. Tab still toggles it. The dock loses its first segment.
- **Phone:** stays in the dock. The top row has no room, and the thumb owns the dock.
- In Outside on the plan, the dock hides floors, as it does today via `editsSite`.

### Top bar, 1440 px (desktop)

Widths are estimated from `desktop-plan-plot.png`: each mode button is its label plus 32 px, and a two-way segment is about 168 px.

```
16                                                                                                      16
┌ left 254 ──────────────────┐   ┌ centre ≈ 500 ────────────────────────────────────────────┐   ┌ right ≈ 500 ─────────────────────────────────────────┐
│ ▲ storey │ Listing 91770873 ▾│   │ Plan|3D ┆ Build Decorate Furnish Electrics Outside      │   │ As listed|Proposed|Compare  ▤ Review  ↶ ↷  ⌕ Ctrl K │
└────────────────────────────┘   └───────────────────────────────────────────────────────────┘   └──────────────────────────────────────────────────────┘
  254 + 500 + 500 + 2×16 gutters = 1286; spare ≈ 154, shared as the gaps around the centre island.
```

Layout and widths:
- Grid `auto 1fr auto`. The centre island sits in the middle of the free space, not the screen: at 1440 it sits about 60 px left of centre, and at 1920 it is screen-centred.
  - Rule: centre it on the screen when `(viewport − 2·max(left, right) − 32) ≥ centreWidth`, else between the side islands.
- Centre island: Plan|3D about 96 px, then a 9 px rule, then 5 modes about 390 px (Build 64, Decorate 86, Furnish 78, Electrics 84, Outside 78).
- Right island: layout switch about 250 px, Review 76 px, undo and redo 64 px, palette 76 px, gaps 32 px.

### Top bar, 1280 px (laptop)

Steps from review-2026-10's stepped-bar rule:
- Under 1360 px the wordmark goes (mark only).
- Under 1360 px the palette loses its `Ctrl K` keycap.

```
┌ left 176 ───────────────┐  ┌ centre ≈ 500 ─────────────────────────────────────────┐  ┌ right ≈ 460 ──────────────────────────────────────┐
│ ▲ │ Listing 91770873 ▾  │  │ Plan|3D ┆ Build Decorate Furnish Electrics Outside   │  │ As listed|Proposed|Compare  ▤ Review  ↶ ↷  ⌕    │
└─────────────────────────┘  └────────────────────────────────────────────────────────┘  └───────────────────────────────────────────────────┘
  176 + 500 + 460 + 32 = 1168; spare 112.
```

Further steps (iPad notes, not optimised):
- Under 1240 px: Review shows its icon only (aria-label "Review"), and As listed reads "Listed" (`lay-short`). At 1180 that gives 176 + 500 + 396 + 32 = 1104.
- Under 900 px (iPad portrait 820):
  - the five modes collapse into a `Build ▾` menu button (about 120 px)
  - Review moves into the house menu
  - the house name truncates at 140 px
  - 180 + 230 + 360 + 32 = 802.

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

House menu on the phone: Layouts…, Bring in updates…, Switch house…, **Review…**, **Settings…**, then Project (Export, Import, Clear all).

### Settings dialog

A `Modal` ("Settings", 380 px wide; on the phone, full width with a 16 px gutter). It opens from the house menu's "Settings…" item and the palette's "Settings…" command.

| Row | Control | Shown |
|---|---|---|
| Render quality | `.seg` Auto · High · Balanced · Low (phone: Auto · Low) | always |
| Scroll wheel | `.seg` Auto · Zooms · Pans (hints as today, `WHEEL_OPTIONS`) | not on touch |
| Plan colours (only if Q2 = keep) | `.seg` Calm · Full | not on compact |
| Keyboard shortcuts… | link button, dispatches `OPEN_SHORTCUTS` | not on touch |

- No Save button: changes apply at once, as today. Esc or × closes it.
- No busy or error states: these are local prefs.

House menu after this change (desktop):
1. Layouts…
2. Bring in updates…
3. Switch house…
4. Settings…
5. Project group: Export JSON, Import JSON…, Clear all…
6. Footer: storage, sync, about.

The Settings group and the Look row are gone.

### Stairs (UX13, M part)

- Build, plan: a tap on the stair marker selects **the stairs**. The marker gets the selection outline, and the plan inspector shows **Stairs**: direction, turn, top turn, winders or steps, length and width, and Remove stairs. A drag still moves them.
- Build summary: the Stairs section goes. When the floor has no stairs, the summary shows a single "Add stairs" button, which places them at the rooms' centre (the existing code at `Inspectors.tsx:1465`).
- 3D: no stairs rows at all.

## Technical design

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

- Remove `modeBeforeReview` and `leaveReview` (lines 91-94, 301-306, 455, 482) and drop them from `Persisted`. `setMode` becomes `rawSet((st) => modeSwitchPatch(st, m))`.
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
  - `App.tsx:182` (`showInspector`)
  - `PlanEditor.tsx:382` (delete the check)
  - `ModePanel.tsx:38` (delete)
- `setMode` from a mode button also calls `closeReview()`. Wire this in `ModeBar` and `TabBar`, not the store, so the store stays free of UI.

### Components

| File | Change |
|---|---|
| `components/TopBar.tsx` | Centre island = `<ViewSwitch/>` (new, the Plan/3D `.seg` moved out of Dock, using `tabSwitchPatch`) + `<ModeBar/>`. The right island gains `<ReviewButton/>` after `LayoutSwitch`. Phone renders neither (its row is the quick-win row). |
| `components/ModeBar.tsx` | Five modes. Below 900 px, renders a menu button (`Build ▾`) with the five as `menuitemradio`. Calls `closeReview()` on pick. |
| `components/Dock.tsx` | Remove the Plan/3D segment except on the phone (`chassis === "phone"`). Sun title: "Add a plot under Outside → Plot to use the sun study". |
| `components/mobile/TabBar.tsx` | Unchanged logic, five tabs. `mobile.css`: labels 12 px. |
| `components/ModePanel.tsx` | `mode === "outside"` → `<OutsidePanel/>`. Delete the review branch. Build summary gets Exterior (Q1). |
| `components/PlotPanel.tsx` | Delete. New `components/OutsidePanel.tsx`: card-head segment Garden or Plot (`siteLayer`), body `GardenPanel` or `SitePanel`. |
| `components/SitePanel.tsx` | `setMode("plot")` (line 64) → `setMode("outside"); setSiteLayer("plot")`. Copy at :126 → "Garden surfaces, planting and furniture are under Outside → Garden." |
| `components/GardenPanel.tsx:29`, `SunlightSection.tsx:80`, `ViewMenu.tsx:95` | Copy: "Plot mode" / "Plot panel" / "under Plot" → "Outside → Plot". |
| `editor/SiteEditor.tsx` | Prop `mode` removed. Read `siteLayer` from the store, and `garden = siteLayer === "garden"`. Card title "Outside". On a layer change, reset `tool` to select, `polySel`/`draft`/`armed` to null, and close the Add popover (one `useEffect` on `siteLayer`). |
| `editor/site/SiteLayers.tsx` | `mode: SiteMode` → `layer: SiteLayer` (rename only). |
| `App.tsx:288` | `{editingSite && <SiteEditor />}`, with no key. |
| `editor/ModeSummaries.tsx` `BuildSummary` | Add `<Section id="build.exterior">` with `ExteriorPanel` (Q1). Remove the Stairs section from `FloorSettings`, and keep "Add stairs" only when `!floor.stairs`. |
| `editor/plan/useDrag.ts` `stairsDown` | `tap: () => select({ stairs: true })` in Build. Other modes keep `backgroundTap`. |
| `editor/plan/useSelection.ts`, `layers/*` stairs layer | Hold and draw `stairs` selection (outline in `--sel`). |
| `editor/plan/chrome/PlanInspector.tsx` | `sel.stairs` → `<StairsPanel/>` (new, the moved stairs fields, in the split-inspector folder). |
| `components/HouseMenu.tsx` | Delete the Settings group (lines 102-143) and the shortcuts item. Add "Settings…" (dispatches `OPEN_SETTINGS`) and, on the phone, "Review…". |
| `components/SettingsDialog.tsx` (new) | `Modal` with the rows above. `RenderQuality` is reused from `SettingsPanel.tsx`. Listens for `OPEN_SETTINGS`. Mounted once in App beside `ShortcutSheet`. |
| `lib/studio.ts` | `export const OPEN_SETTINGS = "house:open-settings"`. |

### Commands and keys

- `lib/commands.ts`:
  - `plan:site` → "Outside: Plot" (`setMode("outside"); setSiteLayer("plot"); tab plan`)
  - `plan:garden` → "Outside: Garden"
  - the `mode:*` loop yields five entries, with `modeWords.outside = ["garden","plot","site","boundary","neighbours","orientation"]`
  - the `review:*` commands are unchanged (they dispatch `house:open-review`)
  - add `settings:open` "Settings…" (group "Settings")
  - `canvas:quiet`/`canvas:full`: delete (Q2 = cut) or retitle "Plan colours: Calm/Full"
  - `CommandCtx` gains `setSiteLayer`
- `useStudioKeys.ts`: no new keys. Digits stay floors, and Tab stays Plan/3D. The `editsSite` guard (line 63) is unchanged. Review gating reads `useReview.getState().open`.
- `lib/shortcuts.ts` `SHORTCUT_GROUPS`: add an **Outside** group listing the site editor's existing keys from `SiteEditor.tsx:321-329` (V select; Garden: A add, R/C/P surfaces, Q/E turn; Plot: B building). They are undocumented today.
- No mode shortcuts: the palette's "Mode: …" covers them, and digits are taken.

### Quiet / Plan colours (Q2, recommended: cut)

- Keep the quiet look as the only look.
- Delete `quiet` from `panelPrefs.ts`. Its `merge` drops the stale key, since partialize omits it.
- Delete the `quiet` branches:
  - `Handles.tsx` (always quiet)
  - `PlanEditor.tsx:70,239,345-346`
  - `Site.tsx` (always the quiet ground; `NeighbourMass` picks true colours when `trueColours`, else quiet massing; drop `cardBase` if it is now unused)
  - `Lighting.tsx:398` (always `QUIET_FOG`)
  - `SiteItems.tsx` (quiet path)
- This fixes the dead "Neighbours in their own colours" checkbox.

### Tests to add or change

| Test | Change |
|---|---|
| `lib/modes.test.ts` | "lists the five modes in order". Rename the Plot/garden describes to Outside (site entry and exit, floor restore, `siteLayer` reset to garden on entry). `canSelect(build, "stairs")`. `legacyMode` table (garden, plot, review with and without `before`, bogus). |
| `storeModes.test.ts` | `setMode("outside")`. `merge({ mode: "plot" })` → outside. `merge({ mode: "review" })` → build. |
| `storeStudio.test.ts` | Delete the review enter/leave tests (lines 15-31). Add `openReview`/`closeReview` leaving `mode` alone. Keep `editFloorId: "site"` with `mode: "outside"`. |
| `lib/migrate.test.ts` | Old version with `mode: "garden"` → outside. `mode: "review", modeBeforeReview: "decorate"` → decorate, and `modeBeforeReview` removed. |
| `lib/commands.test.ts:138,144` | Review command dispatches the event, not `setMode("review")`. Plot command → outside + layer. |
| `lib/planKeys.test.ts:44`, `lib/planHit.test.ts:60` | Replace "review" with "outside". |
| `components/mobile/BottomSheet.test.ts` | Unchanged unless it names modes. |
| `scripts/test-garden.cjs` | `setMode("garden")` → `setMode("outside")` + `setSiteLayer("garden")`. The "Plot mode no longer selects surfaces" block (:186-192) → Plot layer. |
| `scripts/editor-regression.mjs:335,1252` | `setMode("plot")` → outside + layer plot. `toGarden` switches the layer, so there is no remount wait. |
| `scripts/shoot-chassis.cjs` | Views `plan-garden`, `plan-plot` → `plan-outside-garden`, `plan-outside-plot`. `review` opens via the button. |
| New `scripts/test-topbar.cjs` | See Acceptance checks. |

### Performance and accessibility

- No `key={mode}` remount: a Garden↔Plot switch costs a re-render, not a fresh SVG tree and a camera refit. Target ≤ 16 ms at 1440, measured in the Playwright trace.
- Review open state moves out of the persisted store, so opening Review no longer writes `localStorage`.
- One fewer persisted field.
- Accessibility:
  - The mode bar stays `nav[aria-label="Mode"]` with `aria-current="page"`.
  - Plan|3D is `role="group" aria-label="Plan or 3D"` with `aria-pressed`.
  - The Review button has `aria-pressed` and `aria-controls` pointing to the review page id.
  - The Garden|Plot segment has `role="group" aria-label="Outside layer"`.
  - The Settings dialog uses `Modal` (`role="dialog"`, focus trap and Esc as today).
  - The collapsed mode menu under 900 px uses `menuitemradio`.
- Targets: desktop ≥ 32 px high; phone tabs 78×56.

## Build plan

Order: **A** first (alone), then **B, C, D, E** in parallel worktrees, then **F**. Every chunk uses the session's commit trailer.

| Chunk | Suggested name | Model |
|---|---|---|
| A Core | Kylie | Sonnet medium |
| B Outside | Dua Lipa | Sonnet medium |
| C Top bar | Madonna | Sonnet medium |
| D Settings | Adele | Sonnet medium |
| E Stairs | Prince | Sonnet medium; Opus review of the selection change |
| F Docs and scripts | Lorde | Haiku low |

### A: Core (modes, store, migration, review state)

- **Owns:** `lib/modes.ts`, `store.ts`, `lib/migrate.ts`, `components/reviewState.ts`, `lib/commands.ts`, `lib/studio.ts` (`OPEN_SETTINGS`), `lib/shortcuts.ts`, and their tests.
- **Outside its own files:** only the minimum mechanical edits that keep the build compiling (the `"review"`/`"plot"`/`"garden"` string sites listed above, as one-line changes):
  - `PlanEditor.tsx:382`
  - `ModePanel.tsx` branches (temporarily `outside` → `PlotPanel`)
  - `App.tsx:288` (`mode="garden"` until B)
  - `SitePanel.tsx:64`
  - `Viewer.tsx:122`
  - `useStudioKeys.ts:37`
  - `ReviewPage.tsx:12`
- **Stay out of:** every other UI file.
- **Steps:**
  1. Do the type and constants changes.
  2. Add `legacyMode`.
  3. Make the store edits.
  4. Write the migration.
  5. Add `useReview.open`.
  6. Update the commands.
  7. Fix the tests.
  8. Make the compile-only edits.
- **Verify:** `npm run check` and `npm run build`. Then load a saved project with `mode: "plot"` in devtools (set localStorage at the old version) and see Outside.

### B: Outside canvas and panel

- **Owns:** `editor/SiteEditor.tsx`, `editor/site/*`, `components/OutsidePanel.tsx` (new), `PlotPanel.tsx` (delete), `GardenPanel.tsx`, `SitePanel.tsx`, `SunlightSection.tsx`, `ViewMenu.tsx` copy, `components/ModePanel.tsx`, `App.tsx` (the SiteEditor line only), `scripts/test-garden.cjs`, `scripts/editor-regression.mjs`.
- **Stay out of:** TopBar, Dock, HouseMenu, the `editor/plan/*` stairs files, and `ModeSummaries.tsx`.
- **Steps:**
  1. Add the `siteLayer` reads.
  2. Add the layer reset effect.
  3. Build the segment in OutsidePanel and the SiteEditor card.
  4. Remove `key`.
  5. Update the copy.
  6. Update the scripts.
- **Verify:**
  - `npm run check`
  - `PORT=<n> node scripts/test-garden.cjs`
  - `npm run regress:editors -- --port <n>`
  - screenshots `plan-outside-garden` and `plan-outside-plot` at 1440 and 390

### C: Top bar, Review button, Plan|3D

- **Owns:** `components/TopBar.tsx`, `ModeBar.tsx`, `ViewSwitch.tsx` (new), `ReviewButton.tsx` (new), `Dock.tsx`, `Dock.css`, the top-bar section of `styles.css`, `mobile/TabBar.tsx`, `mobile.css`, `ReviewPage.tsx`, `ReviewPage.css`, `scripts/test-topbar.cjs` (new).
- **Stay out of:** HouseMenu (D), editor files (B and E), and `lib/*` (A).
- **Steps:**
  1. Move the Plan/3D segment out of the dock into `ViewSwitch`.
  2. Make the grid `auto 1fr auto` with the centring rule (CSS `justify-self` plus a `ResizeObserver`-free check: use CSS `margin-inline: auto` inside a flex row, which centres in the free space).
  3. Add the stepped media rules at 1360, 1240 and 900.
  4. Add the ModeBar collapse under 900 px.
  5. Add the Review button and `toggleReview`.
  6. Make mode buttons call `closeReview`.
- **Verify:** `npm run check`, `node scripts/test-topbar.cjs`, and screenshots at 1920, 1440, 1280, 1180, 820 and 390.

### D: Settings dialog and house menu (and Quiet, per Q2)

- **Owns:** `components/HouseMenu.tsx`, `HouseMenu.css`, `SettingsDialog.tsx` (new), `SettingsPanel.tsx`, `panelPrefs.ts`, `App.tsx` (mount line only; merge after B), `three/Site.tsx`, `three/Lighting.tsx`, `three/SiteItems.tsx`, `editor/plan/layers/Handles.tsx`, and the quiet lines of `editor/PlanEditor.tsx`.
- **Stay out of:** TopBar, Dock, SiteEditor, `lib/commands.ts` (A already added `settings:open`; D only deletes the `canvas:*` pair, a two-line edit agreed here).
- **Verify:**
  - `npm run check`
  - Playwright: the house menu has no `.seg`; "Settings…" opens `[role=dialog][aria-label=Settings]`
  - with "Neighbours in their own colours" ticked, neighbour colours change (screenshot diff `3d-garden` at 1440)

### E: Stairs selection (UX13 M part)

- **Owns:** `editor/plan/useDrag.ts` (`stairsDown`), `useSelection.ts`, the stairs layer under `editor/plan/layers/`, `plan/chrome/PlanInspector.tsx`, the split inspector file holding `FloorSettings`, a new `StairsPanel.tsx`, and `editor/ModeSummaries.tsx`.
- **Stay out of:** `lib/modes.ts` (A adds `"stairs"`), SiteEditor, and TopBar.
- **Verify:**
  - `npm run check`
  - `regress:editors`
  - new Playwright step: Build plan, tap the stair marker on listing 91770873 → `.inspector` has heading "Stairs"; drag still moves it (store `floor.stairs` changes); the 3D Build card has no "Stairs" text

### F: Docs and screenshot script sweep (after B to E merge)

- **Owns:**
  - `docs/modes-brief.md`: add a dated note that the modes are now Build/Decorate/Furnish/Electrics/Outside and Review is a page. The label rule "don't rename on-screen labels without reason" stands. The reasons for the renames are recorded here.
  - `docs/studio-plan.md`: add notes under §1.8, §3.2, §3.4, §3.5 and 12B pointing here.
  - `CLAUDE.md` code map lines naming "Plot and Garden modes"
  - `README.md` mode list
  - `scripts/shoot-chassis.cjs`
  - `docs/review-2026-11.md` "Built" list
- **Verify:** `npm run build`, then `node scripts/shoot-chassis.cjs` runs clean.

### Studio-plan and brief decisions this reverses

| Where | Was | Now |
|---|---|---|
| studio-plan §1.8 | Review is a mode; `modeBeforeReview`; `leaveReview` | Review is a page with `useReview.open`; no mode change |
| studio-plan §3.1 | `editingSite = mode === "plot"` | `editsSite(mode)` = outside |
| studio-plan §3.2 | Centre = ModeBar only | Centre = Plan|3D + ModeBar; right gains Review |
| studio-plan §3.4 | House menu Settings group | Settings dialog |
| studio-plan §3.5 | Dock item 1 is Plan/3D; floors hidden in Plot | Plan/3D in the top bar (phone keeps it in the dock); floors hidden in Outside on the plan |
| studio-plan 12B | "Site plan (Plot)" command | "Outside: Plot" |
| modes-brief Decisions C | Build / Decorate / Furnish / Plot / Review (Garden and Electrics came later) | Build / Decorate / Furnish / Electrics / Outside, plus a Review page |
| modes-plan §labels | "Site", "Exterior" panel labels kept | Kept: Exterior stays a section title, just under Build (Q1) |

## Acceptance checks

- `npm run check` and `npm run build` pass, and CI is green.
- `npm run regress:editors -- --port <n>` passes.
- `PORT=<n> node scripts/test-garden.cjs` and `scripts/test-touch-plan.cjs` pass.
- New `scripts/test-topbar.cjs` checks:
  - At 1920, 1440, 1280 and 1180 px (desktop, mouse): the three islands' bounding boxes do not overlap and keep ≥ 8 px between them. Five `nav[aria-label=Mode] button` elements are visible. `[aria-label="Plan or 3D"]` sits inside `header`, and the dock has none.
  - At 1440: the mode bar is ≤ 400 px wide (was 556).
  - At 820×1180: `Build ▾` menu button, no overlap.
  - At 390×844:
    - 5 `.tab-bar button` elements, each ≥ 74 px wide
    - Plan|3D in the dock
    - house menu has "Review…" and "Settings…"
  - Review:
    - click Review → `.review-page` visible and `aria-pressed=true`
    - Esc → page gone, `mode` unchanged
    - open Review, then click Furnish → page gone, `mode === "furnish"`
  - Migration: write the house's store key with `{ state: { mode: "plot", modeBeforeReview: "decorate" }, version: <old> }`, reload → `__houseStore.getState().mode === "outside"`. With `mode: "review"` → `"decorate"`.
  - Outside: on the plan, flip Garden → Plot. The SVG element is the same node (no remount: compare a `data-mount` id set on first render), and the selection is cleared.
- Screenshots (`scripts/shoot-chassis.cjs` plus `house:shot`):
  - 1440×900 and 1920×1080: `plan-build`, `plan-outside-garden`, `plan-outside-plot`, `3d-build` (Exterior section collapsed), `review`, `housemenu`, `settings`
  - 1280×800 and 1180×820: `plan-build`
  - 390×844: `plan-build`, `plan-outside-plot`, `housemenu`
  - The owner eyeballs these.
- Copy grep: `rg -n '"(plot|garden|review)"' src --type ts` returns only non-mode uses: `SiteLayer`, `UpdateGroup`, `siteDiff` and `wallSteps` keys.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Muscle memory: the owner looks for Garden or Plot | The palette keeps "Garden", "Plot", "Site" as keywords for Outside. Outside opens on Garden. The Sun tooltip and empty states say "Outside → Plot". |
| A bad migration lands someone in an invalid mode | `legacyMode` runs in both `migratePersisted` and `merge`, and is table-tested. Unknown → build. |
| The top bar overflows at in-between widths (1240 to 1360, iPad) | Stepped rules plus the bounding-box test at four widths. The ModeBar collapses under 900. |
| The Garden/Plot layer state is invisible on the phone sheet's hidden detent | The peek line names the layer ("Outside · Plot …"). The segment shows when the sheet opens. |
| Exterior in Build makes the Build card longer | A collapsed Section with a one-line summary, the same as today under Plot. |
| Stairs tap no longer selects the room under it | Only in Build. A tap elsewhere in the room still selects the room. Opus reviews the drag change. |
| Quick wins landed differently from the Assumptions | Every chunk greps symbols first (`canEdit`, `FloorSettings`, `PERSIST_VERSION`, `LayoutSwitch`) and adapts. Chunk A writes down the actual version number in its commit. |
| Review no longer survives a reload | Intended: a reload lands in the editor. Noted for the owner (Q4). |

## Open questions for the owner

1. **Where does the Exterior (roof, eaves, walls, chimneys) live?**
   - (a) Build: a collapsed Exterior section in the Build summary
   - (b) Outside: a third layer or section
   - (c) split: shape (roof, eaves, chimneys) to Build, finishes (render, brick, colours) to Decorate
   - **Recommend (a).** The roof is part of the building, Build already owns walls and stairs, and (c) splits one panel across two modes.
2. **Canvas Quiet/Full: cut or relabel?**
   - (a) cut it and keep the quiet look always (it is the default; it fixes the dead neighbour-colours checkbox; it deletes about 40 lines)
   - (b) keep it in Settings as "Plan colours: Calm | Full"
   - **Recommend (a).**
3. **How does Outside switch between Garden and Plot?**
   - (a) a visible **Garden | Plot** segment in the Outside card
   - (b) a collapsible "Plot" section whose opening switches the canvas to the Plot layer
   - (c) one merged layer where everything is selectable
   - **Recommend (a).** It is explicit and two-state, with no hidden mode behind a disclosure. (c) brings back the boundary-versus-surface hit conflicts that the split fixed.
4. **Should an open Review survive a reload?**
   - (a) no: a reload lands in the editor
   - (b) yes: persist `useReview.open`
   - **Recommend (a).** It is simpler, and Review is one click away.
5. **Plan | 3D on the phone:**
   - (a) stays in the dock
   - (b) moves to the top row, with the layout switch moving into the dock
   - **Recommend (a).** The top row is full, and the thumb owns the dock.

## Out of scope

- The lean phone shell (review-2026-11 proposal 1).
- Selecting furniture or points in 3D (UX10).
- One-canvas compare (PERF5).
- Splitting SiteEditor into smaller files (CODE7). This spec only removes its `mode` prop.
- Mode shortcuts on number keys.
- A Settings page for sync or the server passcode.

## Effort

| Chunk | Size |
|---|---|
| A Core (modes, store, migration, review state, commands) | M |
| B Outside canvas and panel | M |
| C Top bar, Review button, Plan|3D | M |
| D Settings dialog, house menu, Quiet cut | S |
| E Stairs selection | M |
| F Docs and scripts | S |
| **Total** | **L** (about four builder-days, with one Opus review on E) |
