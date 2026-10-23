# Modes redesign: implementation plan (Taylor Swift)

Status: approved by the owner with all of the defaults in §13; being built in chunks A → (B ∥ C). Brief: docs/modes-brief.md.

Built from docs/modes-brief.md and the code as it stands. Five modes (Build, Decorate, Furnish, Plot, Review), each with its own accent colour. The work splits into **Chunk A**, which lands first, then **Chunks B and C** in parallel.

---

## 1. Store and mode logic

### Changes to `src/store.ts`
| Field / action | Type | Default | Persisted | Undo |
|---|---|---|---|---|
| `mode` | `Mode` (from `lib/modes.ts`) | `"build"` | Yes. Add to `partialize`, per browser like `planWalls`. Sync only sends variants, photos, sites and costRates, so it stays local. | No (uses `rawSet`) |
| `selectedEdge` | `EdgePick \| null` (from `lib/decorPick.ts`): `{ edge: number; side: "inside" \| "outside" }` | `null` | No | No |
| `floorBeforeSite` | `string \| null` | `null` | No | No |
| `setMode(m: Mode)` | action | | | `rawSet(modeSwitchPatch(get(), m))` |

- Add `selectedEdge` and `floorBeforeSite` to the `setUi` Pick list. Do **not** add `mode`: it changes only through `setMode`.
- `undo`, `redo` and `reset` also clear `selectedEdge`.
- `merge`: if the persisted `mode` is not in `MODES`, use `"build"`. Leave `PERSIST_VERSION` alone (no migration).
- `selectedEdge` means something only together with `selectedRoomId`. If `edge >= polygon.length`, treat it as `null`.

### New `src/lib/modes.ts` (+ `modes.test.ts`)
```ts
export type Mode = "build" | "decorate" | "furnish" | "plot" | "review";
export const MODES: Mode[];                       // in that order
export const MODE_LABEL: Record<Mode, string>;    // "Build", "Decorate", "Furnish", "Plot", "Review"
export type Tool = "select"|"rect"|"canopy"|"room"|"door"|"window"|"gap"|"wall"|"measure"|"calibrate"|"place"; // moved from PlanEditor
export const PLAN_TOOLS: Record<Mode, Tool[]>;
//   build: all 10 current tool buttons in the current order; decorate: []; furnish: ["select","measure"]; review: ["select","measure"]; plot: []
export type SelKind = "room" | "edge" | "opening" | "wall" | "canopy" | "fixture" | "corner";
//   build: room, opening, wall, canopy, corner;  decorate: room, edge, wall (free wall, colour only);  furnish: fixture;  plot, review: none
export function canSelect(mode: Mode, kind: SelKind): boolean;
export interface PlanSelection { room?: string; opening?: string; wall?: string; fixture?: string; canopy?: number }
export function pruneSelection(mode: Mode, s: PlanSelection): PlanSelection;
export interface ModeUi { mode: Mode; tab: Tab; editFloorId: string | null; floorBeforeSite: string | null; selectedRoomId: string | null; selectedEdge: EdgePick | null }
export function modeSwitchPatch(ui: ModeUi, next: Mode): Partial<ModeUi>;
export const roomTapSelects = (m: Mode) => m === "build" || m === "decorate";
```

**What `modeSwitchPatch` does:**
- Sets `mode: next`.
- Clears `selectedRoomId` unless the new mode can select rooms. Build ↔ Decorate keeps the room, so you can shape a room and then paint it.
- Clears `selectedEdge` unless the new mode is Decorate.
- **Entering Plot:** if `tab === "plan"` and `editFloorId !== SITE_EDIT_ID`, it sets `floorBeforeSite = editFloorId` and `editFloorId = SITE_EDIT_ID`.
- **Leaving Plot:** if `editFloorId === SITE_EDIT_ID`, it sets `editFloorId = floorBeforeSite` (null falls back to `floors[0]` as today).

**Mode and the 3D / plan switch.** Mode and tab are independent, with one rule: on the plan, Plot always shows the site editor and no other mode does. App adds an effect: when `tab === "plan" && mode === "plot" && editFloorId !== SITE_EDIT_ID`, it sets `editFloorId` to the site.

**Plan-only selections** (opening, wall, fixture, canopy) live in PlanEditor's local state. When the mode changes, PlanEditor calls `select(pruneSelection(mode, current))` and `pick("select")`.

### New `src/lib/modeSummary.ts` (+ test)
These are pure one-line strings, used for summaries when nothing is selected and for closed sections.
- **Floor summaries:**
  - `buildSummary(floor)` → "7 rooms · 58.2 m² · 12 doors and windows · stairs up"
  - `decorateSummary(floor)` → "Floors: Oak boards ×3, Tiles ×2, Plain ×2 · 2 feature walls"
  - `furnishSummary(floor, clashes: number)` → "14 items · Kitchen 5, Living room 4 … · 1 overlap"
- **Room section summaries:**
  - `shapeSummary(room, ppm)` → "4.20 × 3.60 m · 15.1 m²" (adds "· printed 4.2 × 3.6" when set)
  - `detailsSummary(room, photoCount)` → "Heated · 2 photos · has notes"
  - `knockSummary(n)`
  - `floorSummary(room)` → "Herringbone · 45° · #c8a97e"
  - `wallsSummary(room)` → "Paint · <palette name or hex> · skirting white"
  - `eachWallSummary(room)` → "2 of 4 walls have their own finish"
  - `outsideSummary(room)` → "House default" or a `WALL_FINISH_LABEL`
- **Other section summaries:**
  - `openingLookSummary(o)`
  - `floorSettingsSummary(floor)` → "Level 0 · 41.3 px/m"
  - `stairsSummary(floor)` → "Up · 2.6 × 0.9 m" or "None"
  - `siteSummary(site)` and `exteriorSummary(model)` (e.g. "No plot yet" / "Front faces 172°"; roof style · wall finish)
- Use `areaM2`, `formatArea`, `PAINT_PALETTE`, the `*_LABEL` maps and `isOutsideEdge`.

### New `src/lib/decorPick.ts` (+ test)
```ts
export interface RoomOutline { id: string; poly: V2[] }   // the same frame as the hit point (plan px or world m)
export interface EdgePick { edge: number; side: "inside" | "outside" }
export type DecorPick = { roomId: string; edge: number | null; side: "inside" | "outside" } | null;
export function pickInPlan(rooms: RoomOutline[], p: V2, tol: number): DecorPick;
export function pickWallFace(rooms: RoomOutline[], hit: V2, normal: V2, o: { probe: number; through: number; maxDist: number }): DecorPick;
```
**`pickInPlan`:**
- If `p` is inside room R (the last match in array order, as the plan does): use R's nearest edge if it is within `tol` (side inside), otherwise `edge: null`, which means the floor.
- If `p` is inside no room: take the nearest edge of any room within `tol`. Side is "outside" if a point `2·tol` past the edge, away from R, lies in no room; otherwise "inside".
- Otherwise `null`.

**`pickWallFace`:**
- If `hit + normal·probe` lies in room R: R's nearest edge to `hit`, side inside.
- Otherwise, if `hit − normal·through` lies in room R: R's nearest edge, side outside.
- Return `null` if the nearest edge is further than `maxDist`.
- Use `closestOnSegment` from `planMath` and the existing point-in-polygon helper.

---

## 2. Where every field and panel goes

Section ids are prefixed by mode. "—" means not in a section (always shown).

### Room (`RoomInspector` today)
| Field | Mode | Section (id) | Closed summary |
|---|---|---|---|
| Name | Build (editable); room name shown read-only as the header in Decorate | — header | — |
| Floor area readout | Build | Shape & size (`build.room.shape`) | `shapeSummary` |
| Traced size W × D + corner grid | Build | Shape & size | ″ |
| Printed size + comparison | Build | Shape & size | ″ |
| Notes | Build | Details (`build.room.details`) | `detailsSummary` |
| Not heated | Build | Details | ″ |
| Part of an extension (`roofGroup`) | Build | Details | ″ |
| Room photo thumbnails | Build | Details | ″ |
| Knock through into… | Build | Knock through (`build.room.knock`), only if there are neighbours | `knockSummary` |
| Delete room | Build | — bottom | — |
| Floor finish, Pattern direction, Grout colour, Floor colour | Decorate | Floor (`decorate.floor`, open by default) | `floorSummary` |
| Floor texture from photo | Decorate | Floor | ″ |
| Wall covering, base colour (Paint / ground…), accent colour | Decorate | Walls (`decorate.walls`, open by default) | `wallsSummary` |
| Quick colours (base, accent) | Decorate | Walls | ″ |
| Skirting colour | Decorate | Walls | ″ |
| Per-wall list (`FeatureWalls`, inside and outside) | Decorate | Each wall (`decorate.eachWall`) | `eachWallSummary` |
| Outside wall finish, Outside wall colour | Decorate | Outside walls (`decorate.outside`), only if the room has an outside edge | `outsideSummary` |

There are no ceiling fields in the model today, so there is **no Ceiling section**.

### Opening (`OpeningInspector`, all Build)
| Fields | Section | Summary |
|---|---|---|
| Type, Width, Wall runs, Flip hinge / Flip swing, Sill / Bay depth / Head, drag hint, Delete opening | — always shown | — |
| Colour, Style, Drawn open (°), Glazing, Sill outside, Window board, Lining, Frame | Look (`build.opening.look`) | `openingLookSummary` |

### Other inspectors
| Inspector | Mode | Notes |
|---|---|---|
| Canopy (size, corner, delete) | Build | Unchanged |
| Free wall: Height, Delete wall | Build | `WallInspector` with `mode="build"` |
| Free wall: Colour | Decorate | `WallInspector` with `mode="decorate"` |
| Fixture (all fields and buttons) | Furnish | `FixtureInspector` unchanged |

### Floor settings (`FloorInspector` → `FloorSettings`, Build, shown when nothing is selected)
| Fields | Section | Summary |
|---|---|---|
| Floor name, Level, Scale, Scale from printed sizes, Stacking offset, Re-centre floor, Delete floor | Floor settings (`build.floor.settings`) | `floorSettingsSummary` |
| Add / Remove stairs, Direction, Bottom / Top of flight, Winders, Length × width | Stairs (`build.floor.stairs`) | `stairsSummary` |

### Plan toolbar
| Item | Where it goes |
|---|---|
| Select, Rectangle room, Canopy, Polygon room, Door, Window, Gap, Wall, Calibrate | Build |
| Measure | Build, Furnish, Review |
| **Add** (new; replaces the Furniture palette in the side panel) and Paste | Furnish |
| Image + opacity, Walls toggles | All plan modes |
| "Scale N px/m" | Build |

### Left drawer and header
| Item | Where it goes |
|---|---|
| Floorplans (ImportPanel ×2), Photos (n), Settings (quality, Export/Import JSON, Clear all, sync status) | **Project menu** (the drawer; labels unchanged) |
| Site | Plot → section `plot.site` "Site", open by default, `siteSummary` |
| Exterior | Plot → section `plot.exterior` "Exterior", `exteriorSummary` |
| Report, Planning check | Review → segmented control `Report | Planning check` |
| As listed / Proposed, Undo / Redo, 3D view / Check plan, View menu (incl. Ceiling height) | Stay in the header |
| Floor switch "Site" button | Removed. Plot replaces it. In Plot the floor buttons are hidden. |

---

## 3. Component changes, file by file

### New files
- **`src/components/Section.tsx`**: `Section({ id, title, summary?, defaultOpen = false, children })`.
  - Header is a `<button class="sect-head" aria-expanded aria-controls>` with title, the summary when closed (one line, ellipsis) and a ▸/▾ chevron.
  - The body is rendered only when open.
- **`src/components/panelPrefs.ts`**: zustand `persist` store on localStorage key `house-modeler-panels`, following the `three/siteView.ts` pattern.
  - Fields: `open: Record<string, boolean>`, `setOpen(id, v)`, `reviewTab: "report" | "planning"`, `sheetOpen: boolean`, `addCategory: string`.
  - Helper: `useSectionOpen(id, defaultOpen)`.
- **`src/components/breakpoints.ts`**: `NARROW_QUERY = "(max-width: 899px)"` and `PHONE_QUERY = "(max-width: 599px)"`, moved out of App.
- **`src/components/ModeBar.tsx`**: five buttons in a `nav.mode-bar.seg` (`MODE_LABEL`). Clicking one calls `setMode`. The current mode gets `aria-current="page"`.
- **`src/components/ModePanel.tsx`**: the right-hand panel at App level, used for the 3D tab (every mode) and for Review on either tab.
  - **Build:** selected room → `BuildRoomPanel`, otherwise `BuildSummary`.
  - **Decorate:** room → `DecoratePanel`, otherwise `DecorateSummary`.
  - **Furnish:** `FurnishSummary` plus a "Place furniture on the plan" button (sets `tab: "plan"`).
  - **Plot:** `PlotPanel`. **Review:** `ReviewPanel`.
  - The floor comes from `editFloorId`, falling back to `floors[0]`.
- **`src/components/PlotPanel.tsx`**: two Sections wrapping the unchanged `SitePanel` and `ExteriorPanel variant={activeVariant}`.
- **`src/components/ReviewPanel.tsx`**:
  - A segmented control (Report | Planning check, remembered in `reviewTab`) over the unchanged `ReportPanel` / `PlanningPanel`.
  - On the 3D tab with both variants present, a "Compare" control (Single / Side by side / Overlay → `setUi({ viewMode })`), so the As listed vs Proposed comparison is right there.
- **`src/editor/ModeSummaries.tsx`**: `BuildSummary({ variant, floor })` (string + `FloorSettings`), `DecorateSummary({ floor })` (string + "Tap a floor or a wall to decorate it."), `FurnishSummary({ floor, clashes, onAdd?, onPaste? })`.
- **`src/editor/DecoratePanel.tsx`**: `DecoratePanel({ variant, floor, room, edge, onChange, onHighlightEdge? })`. Chunk A stubs it by rendering the old `RoomInspector`; Chunk C builds it properly (§4).
- **`src/editor/AddItem.tsx`** (Chunk B): `AddItemButton({ activeId, onPick })` + `CataloguePicker` (§5).

### Edited files
- **`src/store.ts`**: as in §1.
- **`src/App.tsx`**:
  - `data-mode={mode}` on `.app`. `<ModeBar/>` sits between the header and `.body`.
  - The drawer is a drawer at every width (`drawer = true`). `sides` is reduced to floorplans, photos, settings. The ☰ toggle gets the title "Project".
  - `<ModePanel/>` after `<main>` when `model && (tab === "3d" || mode === "review")`, or when `mode === "plot"` with no model. On the plan, PlanEditor gets `mode` from the store.
  - `onSelectRoom`:
    - Build / Decorate: select the room and set `editFloorId`. In Decorate also clear `selectedEdge` and `setOpen("decorate.floor", true)`.
    - Furnish / Review: set only `editFloorId`.
    - Plot: ignore.
  - New `onPickWall(floor, hit, normal)` (Decorate only): build world outlines with `roomWorldPolygon`, call `pickWallFace(…, { probe: 0.05, through: 0.6, maxDist: 0.5 })`, then `setUi({ selectedRoomId, selectedEdge, editFloorId })`. In side-by-side, also set `activeVariant`.
  - The empty-state button opens the project menu.
- **`src/three/Viewer.tsx`**: add the optional prop `onPickWall?: (floor: Floor, hit: V2, normal: V2) => void` and pass it to `House`.
- **`src/three/House.tsx`**: thread `onPickWall` through `House` → `FloorGroup` → `FloorShell`. Each `shell.meshes` `<mesh>` gets `onClick` **only when `onPickWall` is set**:
  - Ignore if `!e.face` or `|e.face.normal.y| > 0.5`.
  - Otherwise `e.stopPropagation()` and call `onPickWall(floor, { x: e.point.x, y: e.point.z }, { x: n.x, y: n.z })`.
  - Shell meshes are unrotated, so the local normal is the world normal. `RoomFloor` clicks are unchanged; r3f's nearest-hit-first plus `stopPropagation` means the closest wall or floor wins.
- **`src/components/ViewMenu.tsx`** (`PlanFloorSwitch`): remove the Site button; render nothing when `mode === "plot"`.
- **`src/components/SitePanel.tsx`**: "Edit the site plan" becomes `setMode("plot"); setUi({ tab: "plan" })`.
- **`src/editor/SiteEditor.tsx`**: when nothing is selected, the side shows `<EmptyInspector/>` followed by `<PlotPanel/>`.
- **`src/editor/PlanEditor.tsx`** (Chunk B):
  - **Mode wiring:** read `mode`. `Tool` comes from `lib/modes`. Toolbar shows `TOOLS.filter(t => PLAN_TOOLS[mode].includes(t))`. Starting tool: `"rect"` only when Build has no rooms, otherwise `"select"`. On mode change: `pick("select")`, `setPlacing(null)`, prune the selection.
  - **Gating by mode:**
    - Room corner and midpoint handles and EdgeLabels: Build only.
    - Opening hit targets, canopy select and drag, stairs `interactive`: Build only.
    - Free wall hit: Build and Decorate (end handles Build only).
    - Fixture `<g>` handlers: Furnish only. Elsewhere `pointerEvents: "none"`, opacity 0.55.
  - **`onClickCanvas` select branch:**
    - Build: as today, including Shift+click knock-through.
    - Decorate: `pickInPlan(floor.rooms.map(r => ({ id: r.id, poly: r.polygon })), raw, tol)` with `tol = (coarse ? 14 : 8) * px + 0.12 * ppm`. Then `setUi({ selectedRoomId, selectedEdge })`. A floor hit also opens `decorate.floor`.
    - Furnish: tapping empty space calls `select({})`.
    - Review: nothing.
  - In Decorate, draw `selectedEdge` with the existing `LitEdge`.
  - **Side panel:** Build / Decorate / Furnish as in §6 and §5. Review renders no `.side`. Remove the `.palette` block and the `category` state. Mode-specific hint text (§5, §6).
- **`src/editor/Inspectors.tsx`** (Chunk C):
  - Replace `RoomInspector` with `BuildRoomPanel` (same props).
  - Floor, wall and outside fields move to `DecoratePanel`. Export `NameField` for reuse.
  - `OpeningInspector` gets the Look section.
  - `WallInspector({ wall, mode, onChange, onDelete })`.
  - `FloorInspector` → `FloorSettings`.
  - `FixtureInspector` and `CanopyInspector` unchanged.
  - Chunk A adds temporary aliases: `export const BuildRoomPanel = RoomInspector`, `export const FloorSettings = FloorInspector`, and an optional ignored `mode?` on `WallInspector`.
- **`src/editor/FeatureWalls.tsx`** (Chunk C): pull out `export function WallFinishRow({ floor, room, edge, onChange, alwaysSwatches?, side? })`, holding one edge's inside select, colour, accent, swatches and outside select and colour. `FeatureWalls` maps over it, behaving as today.
- **`src/lib/catalogue.ts`** (Chunk B): `filterCatalogue(query: string, category: string | "All"): CatalogueItem[]`. Case-insensitive; every word must match the name, category or note.
- **`src/styles.css`, `src/editor/PlanEditor.css`**: §8 and §9.

---

## 4. Decorate: picking a floor or wall

- **Plan:** see `onClickCanvas` above. A tap inside a room away from its edges picks the room's **floor** (`selectedEdge = null`). A tap within `tol` of an edge, or on the drawn wall band, picks **that edge** of the room. No corner handles, so nothing moves by accident.
- **3D:** a floor tap uses the existing `RoomFloor` → `onSelectRoom`. A wall tap goes through `onPickWall` → `pickWallFace`. Wall tops, ceilings and the roof are ignored: tops are filtered by the normal, and the roof has no handler. Windows and doors in a wall resolve to that wall's edge.
- **Mapping to the data:**
  - **Tapped floor:** edits the room's fields (`floorFinish`, `floorAngle`, `floorGrout`, `color`, `floorPhotoId`) through `updateRoom`, exactly as today.
  - **Tapped wall, inside face:** edits `room.wallFinishes[edge]` with the existing `setWallOverride(room, edge, …)`.
    - In the single-wall view, swatches always show. Picking one when the wall has no override writes `{ paint: hex }`, which turns on "own finish" with the covering inherited from the room.
    - "Same as room" clears the override.
  - **Tapped wall, outside face:** edits `wallFinishes[edge].outside` with `setOutsideOverride`. The room-wide outside finish stays in the Outside walls section.
  - No change to the shape of the finishes data.
- **What `DecoratePanel` shows:**
  - **With an edge:** a header "Wall 3 · 3.20 m · Front" (`edgeLengthsM`, `edgeLabel`), then `WallFinishRow` (inside, or outside when `side === "outside"`, plus inside when the edge is internal), and a link "Whole room" that sets `selectedEdge` to null.
  - **Without an edge:** the room name and area, then the Floor, Walls, Each wall and Outside walls sections.
  - The `FeatureWalls` hover still lights the edge on the plan (`onHighlightEdge`).

## 5. Furnish

- **Add button:** the first item on the Furnish toolbar, plus a large button in `FurnishSummary`.
- **`CataloguePicker`:**
  - A search box (autofocus only with a fine pointer) and chips for All + `CATEGORIES` (remembered in `addCategory`, scroll sideways on narrow screens).
  - Results come from `filterCatalogue`. Rows show the name and `w × d m`, with the note as a title.
  - Picking an item calls `startPlacing(item)` and closes the picker. The place tool works as today (snap, Alt, R / Shift+R, Esc finishes).
  - Wide screens: a popover under the button (320 px, max-height 60vh; outside tap or Esc closes it, same pattern as `ViewMenu`). Narrower than 900 px: a bottom sheet with a backdrop (full width, max-height 70dvh, 44 px rows, 16 px search font).
- **Selected item:** `FixtureInspector` unchanged.
- **Shortcuts:** arrows, R, Shift+R, Ctrl/⌘C, Ctrl/⌘D and Delete work as today on the selected item (only Furnish can select one). **Ctrl/⌘V in any plan mode** switches to Furnish and pastes. Esc clears.
- **Hint text:** "Tap Add to place furniture. Tap an item to edit it; drag to move. Arrows nudge (Shift ×10) · R turns 90°, Shift+R 15° · Ctrl/⌘C, V copy and paste · Ctrl/⌘D duplicates · Delete removes."

## 6. What shows when nothing is selected

| Mode | Panel |
|---|---|
| Build | `buildSummary` line, then the closed Floor settings and Stairs sections. Hint: today's select hint without the furniture part. |
| Decorate | `decorateSummary` + "Tap a floor or a wall (near its edge) to decorate it." |
| Furnish | `furnishSummary` + Add (+ Paste if the clipboard holds an item). **No catalogue list.** |
| Plot | Plan: the site editor's EmptyInspector + PlotPanel. 3D: PlotPanel. |
| Review | ReviewPanel (it doesn't depend on a selection). |

## 7. Project menu
The drawer (☰, title "Project", at every width) holds Floorplans, Photos (n) and Settings, with their panels and labels unchanged. As listed / Proposed and undo stay in the header. Nothing else is in the drawer.

## 8. Screen sizes
- **Mode colours:** `.app[data-mode=…] { --accent: … }`. Build `#2563eb`, Decorate `#be185d`, Furnish `#0f766e`, Plot `#4d7c0f`, Review `#6d28d9`. All reach 4.5:1 or better against white text. Active tool and segmented buttons, section chevrons and the mode bar pick it up automatically.
- **900 px and wider (desktop; iPad landscape is 1024):** the mode bar is a 36 px row under the header. The plan `.side` grows from 260 to 300 px. ModePanel is 300 px (Review 380 px) on the right. No permanent left aside, so at 1024 the plan gets about 720 px.
- **600–899 px:** the plan `.side` stays under the plan (as today, max-height 42%). ModePanel becomes a bottom sheet over `main`:
  - Collapsed, it shows a single header line: mode title + summary + chevron, remembered in `sheetOpen`.
  - Expanded: max-height 50dvh.
  - It opens automatically when a room or wall is picked in Decorate or Build.
- **Narrower than 600 px (phone, 390):** the mode bar is **fixed to the bottom** (tab bar, safe-area padding, 5 × `flex: 1`, 13 px labels, min-height 44 px). Sheets and the plan `.side` sit above it (`bottom: var(--modebar-h)`). The Add picker is a sheet.
- **Touch (`pointer: coarse`):** section headers and mode buttons at least 40 px tall. The Decorate tap tolerance is 14 px on screen. Existing coarse rules stay.

## 9. Collapsible sections
`Section` + `panelPrefs` (localStorage `house-modeler-panels`, per browser, not synced, no undo). Default open state:
- Open: `decorate.floor`, `decorate.walls`, `plot.site`, `build.room.shape`.
- Closed: everything else.
- A Decorate floor tap forces `decorate.floor` open.

CSS: `.sect-head` is a full-width flex button, `.sect-sum` is muted with ellipsis, `.sect-body` has padding 4px 0 8px.

## 10. Acceptance checks
**Vitest** (`npm run check`):
- `modes.test.ts`:
  - The `canSelect` matrix and `pruneSelection`.
  - Build→Furnish clears room and edge; Build→Decorate keeps the room; Decorate→Build clears the edge.
  - →Plot on the plan stores the floor and opens the site; Plot→Build restores the floor; →Plot in 3D leaves `editFloorId` alone.
  - Calibrate only in `PLAN_TOOLS.build`.
- `decorPick.test.ts` (uses `lib/testing.ts` `rect`/`floor`):
  - A centre tap returns the floor. A tap 3 px inside the left edge returns that edge index, inside.
  - A tap in the gap between two touching rooms picks the nearer room's edge, inside. A tap just outside an exterior edge picks it, outside.
  - `pickWallFace` with an inward normal returns inside; with an outward normal, the room behind, outside; beyond `maxDist` returns null.
- `modeSummary.test.ts`: every function on a small fixture.
- `catalogue.test.ts`: `filterCatalogue` on case, multiple words, category, no match.
- Store test (`storeSites.test.ts` pattern):
  - `setMode` adds no undo step.
  - `undo` clears `selectedEdge`.
  - A persisted state without `mode` loads as `"build"`; an unknown `mode` falls back to `"build"`.

**Playwright** (headless Chromium with the swiftshader flags; dev store at `window.__houseStore`). Load the listing through the startup prompt, or Project → Floorplans → Load listing 91770873.
1. The mode bar has exactly Build / Decorate / Furnish / Plot / Review. Clicking Decorate gives `getState().mode === "decorate"` and `.app[data-mode=decorate]`.
2. Build, plan, a room selected: "Shape & size" is present; "Floor finish" is absent. Decorate: "Floor finish" is present; "Traced size" is absent.
3. Decorate, plan:
   - Click the centre of a room: `selectedRoomId` is set, `selectedEdge` is null.
   - Click 4 screen px inside a known edge: `selectedEdge.edge` is the expected index, and the panel shows "Wall N".
   - Click a swatch: `room.wallFinishes[N].paint` is that colour and `room.wallPaint` is unchanged.
4. Decorate, 3D: press "front", click the centre of the canvas. Expect `selectedEdge?.side === "outside"` and a ground-floor `selectedRoomId`.
5. Furnish:
   - The toolbar has Add and no "Rectangle room". Add → type "bed": every row contains "bed". Pick one, click the plan: fixtures +1.
   - R: rot +90. ArrowRight: x increases. Ctrl+C then Ctrl+V: +1. Ctrl+D: +1. Delete: −1.
   - From Build, Ctrl+V switches to Furnish and pastes.
6. Nothing selected: Build shows the summary and a closed "Floor settings"; no `.palette-items` in any mode.
7. Open "Each wall", reload: it is still open.
8. Build: select a room, Shift+click a neighbour: the knock-through prompt appears.
9. Plot on the plan: the site editor is shown (`editFloorId === "site"`) with the Site and Exterior sections. Back to Build: the previous floor returns.
10. Review: the panel has Report and Planning check. The drawer lists only Floorplans, Photos, Settings.
11. 1024×768 with `hasTouch`: `scrollWidth <= 1024`, the plan side panel is 300 px, every mode button is at least 40 px tall. 390×844 with `isMobile`: the mode bar touches the bottom, all 5 buttons are fully on screen, the Add sheet's search input has `font-size >= 16px`. Take a screenshot of each mode at both sizes.
12. Seed localStorage with a save from before this change (no `mode`): it loads in Build with the model intact.

## 11. What not to change
- **Labels:** keep every existing field and button label (Floor finish, Wall covering, Knock through into…, Delete room, Rotate 90°, Duplicate, Copy, Paste, Remove, Floorplans, Photos, Settings, Report, Planning check, Site, Exterior, 3D view, Check plan, As listed / Proposed).
- **Shortcuts:** undo / redo, arrows (+Shift), R / Shift+R, Ctrl/⌘ C / V / D, Delete / Backspace, Esc, Shift+click knock-through, double-click to turn an item.
- **Data model:** the `Room`, `WallOverride`, `Fixture`, `Opening` and `Site` types; the meaning of `setWallOverride` / `setOutsideOverride`; `PERSIST_VERSION`; what export, import and sync carry (mode is never in them).
- **Unchanged components:** ReportPanel, PlanningPanel, SitePanel and ExteriorPanel contents (only where they are hosted), SiteEditor internals, the catalogue's contents, 3D materials and look, plan drawing, snapping, undo merging.

## 12. Chunks
| Chunk | Owns | Order | Model |
|---|---|---|---|
| **A: Foundation and shell** | `store.ts`; `lib/modes.ts`, `lib/modeSummary.ts`, `lib/decorPick.ts` (+tests); `components/Section.tsx`, `panelPrefs.ts`, `breakpoints.ts`, `ModeBar.tsx`, `ModePanel.tsx`, `PlotPanel.tsx`, `ReviewPanel.tsx`; `editor/ModeSummaries.tsx`; **stub** `editor/DecoratePanel.tsx`; App.tsx; styles.css; ViewMenu.tsx; SitePanel.tsx; SiteEditor.tsx; three/Viewer.tsx, House.tsx. May touch Inspectors.tsx **only** to append the three aliases / optional prop. | **Lands first** (merge, then branch B and C from it) | Sonnet medium. **Opus review** of `decorPick.ts` and the House.tsx raycast wiring. |
| **B: Plan editor** | `editor/PlanEditor.tsx`, `PlanEditor.css`, new `editor/AddItem.tsx`, `lib/catalogue.ts` (+test). Uses `BuildRoomPanel`, `DecoratePanel`, `WallInspector mode`, `FloorSettings`, `ModeSummaries` by their contracts in §3; does not edit them. | Parallel with C, after A | Sonnet medium. **Opus review** (the biggest diff; pointer gating and keyboard regressions). |
| **C: Panels** | `editor/Inspectors.tsx`, `editor/DecoratePanel.tsx` (replaces the stub), `editor/FeatureWalls.tsx`. May add selectors to `PlanEditor.css` **only at the end of the file**, inside a `/* Panels (chunk C) */` block (B avoids that block). | Parallel with B, after A | Sonnet medium |

**Merge order:** A, then C, then B. B's Playwright checks 2–3 need C's real panels, so rerun them after both are merged.

## 13. Open questions for the owner (my default in bold)
1. Should the left panel become a pull-out menu on desktop too, not just on narrow screens? **Yes: it frees about 340 px for the plan.**
2. Door and window looks (colour, glazing, frame): Build or Decorate? **Build, in a closed "Look" section.**
3. A room's outside wall finish: Decorate or Plot? **Decorate (Outside walls section); the house-wide finish stays under Plot → Exterior.**
4. Tap furniture in the 3D view in Furnish? **Not in this pass; Furnish in 3D shows the summary and a "Place furniture on the plan" button.**
5. On phones, put the mode switch at the bottom like an app tab bar? **Yes.**
