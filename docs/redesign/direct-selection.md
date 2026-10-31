# Direct selection: pick things where you see them

Status: proposal, not started. Written 31 Oct 2026. Source findings: UX10, UX13 (the plan-stairs part; the "hide Floor settings in 3D" part is a quick win).

## Why (the problem, with numbers and evidence)

- **3D Furnish and Electrics are dead ends.** `src/three/Fixtures.tsx` has no pointer handler at all; its own doc comment says "Fixtures have no 3D click handling, so nothing is lost". A sofa, a socket or a downlight cannot be picked in 3D.
- **The 3D card can only summarise.** `src/components/ModePanel.tsx`: the `furnish` case always renders `FurnishSummary` ("17 pieces" on listing 91770873); `electrics` renders `ElectricsPanel` with no point selected. Add calls `setUi({ tab: "plan" })` then `requestAddPicker()` (ModePanel.tsx 59-66): the user is thrown out of the view they chose.
- **Fixture selection lives in plan-local React state.** `usePlanSelection` (`src/editor/plan/useSelection.ts` line 32) holds `selectedFixtureIds` in `useState`, so nothing outside `PlanEditor` can read or set it. Rooms (`selectedRoomId`), wall faces (`selectedEdge`) and garden items (`gardenSel`) are already in the store, which is why rooms are pickable in 3D (`House.tsx` room floor `onClick`, ~line 613) and furniture is not.
- **Fixtures are merged, so ids are lost on a hit.** `buildFixtureMeshes` merges every part into one geometry per material (`mergeGeometries`, Fixtures.tsx ~199); only glowing lamp parts merge per fixture (`G|<id>|...` keys). A raycast hit says "the oak material mesh", not "the sofa".
- **Stairs are edited away from where they are.** The stairs editor is a `Section id="build.floor.stairs"` inside `FloorSettings` (`src/editor/Inspectors.tsx` 1383-1470). A tap on the plan's stair symbol selects the room under it (`useDrag.ts` `stairsDown`, `tap: (m) => backgroundTap(m)`, ~452); the symbol's tooltip says "set direction and size in the floor panel" (`plan/layers/Stairs.tsx`). Four controls and two number inputs sit two levels deep, behind calibration.
- **Hover must stay cheap.** Commit 9058334 measured 3 shader programs and 2-3 shadow redraws per room crossed when highlight materials and geometry were made per hover; a naive fixture hover would repeat that, worse, because there are many more fixtures than rooms.

## Goal and non-goals

Goal: one selection, shown in both views. Click (or tap) a piece of furniture, joinery or an electrical point in 3D and get the same inspector, keys and highlight as on the plan; click the stair symbol on the plan and get a stairs inspector.

| In | Out (non-goals) |
|---|---|
| Pick fixtures in 3D in Furnish and Electrics | Picking openings, free walls or canopies in 3D |
| Shared fixture selection in the store | Moving opening/wall/canopy selection into the store |
| Hover + selection highlight with zero shader compiles | Triangle-accurate picking (boxes are enough) |
| FixtureInspector / MultiFixtureInspector in the 3D card | Switch-to-light linking by clicking in 3D (stays plan-only) |
| Nudge, rotate, duplicate, copy/paste, delete keys in 3D | Box (marquee) select in 3D |
| Drag on the floor plane in 3D with wall snap (last chunk, may ship later) | Editing on phones in Build/Electrics/Garden/Plot |
| Garden items pickable in 3D (cheap: lib already has `hitItem`) | Stairs pickable in 3D |
| Stairs selectable on the plan with their own inspector | Changing the stairs data model (`Floor.stairs*` stays) |

## Decisions already made (by the owner; do not reopen)

1. Phone = show, walk, measure, plus light Decorate and Furnish edits. Build, Electrics, Garden and Plot are view-only on phones.
2. Devices that matter: iPhone 390x844, laptop 1440x900, desktop 1920x1080. iPad must keep working; not optimised for.
3. Full-bleed canvas, floating chrome everywhere, same brand (docs/brand.md), no Glass look.
4. Quick wins are being built now; this redesign is a spec for later.

## Assumptions (including which quick wins have landed)

All of the quick-win pass has landed on `main` before this starts:

- Full-bleed canvas and floating top islands; `--float-top` sits under them. Phone top row: mark/house menu | layout switch | undo redo.
- `lib/chassis.ts` exports `isCompact` (shortest side < 600 px) and `canEdit(mode, compact)`. On compact screens only Decorate and Furnish edit; read-only modes render inspectors in `<fieldset disabled>`.
- Phone sheet (`components/mobile/sheet.ts`) has a `hidden` detent as well as `peek | half | full`; in view-only modes with nothing selected it is hidden; a tap shows the one-line peek.
- Dock carries Measure, Walk, Show, Cameras, Capture. Gesture fade hides phone chrome while dragging or pinching.
- `Inspectors.tsx` is split by subject. **Builders grep for the symbol, not the old file**: `FixtureInspector`, `MultiFixtureInspector`, `FloorSettings`, `Section id="build.floor.stairs"`.
- Raw number inputs are `NumberField`; the stairs length/width inputs (Inspectors.tsx 1450-1451 today) are `NumberField`s.
- Viewer reads its view toggles from the store; App no longer re-renders per drag frame; one `useQuality()` resolver.
- The interim for UX10 ("open Furnish and Electrics on the Plan tab") may have landed; this spec replaces it: with picking in 3D, entering Furnish/Electrics keeps the current tab.
- Fixture ids (`uid()`) are unique across floors and layouts, so a bare id list can name a selection on any floor.
- Room hover stays as commit 9058334 left it (`RoomHover`, `HOVER_FILL`, `HOVER_LINE`, `HOVER_STAND_INS`, `useOffstageCompile` in `three/frameLoop.ts`).

## Design (what the user sees and does, per chassis)

### Principles

- Same thing, same gesture, both views: click selects, Shift+click adds the group, Ctrl/Cmd+click picks one item out of a group (as `fixtureDown` does on the plan, `useDrag.ts` ~469-500).
- What a mode can pick in 3D is exactly what it picks on the plan: `fixtureSelectable(mode, item)` (`lib/planHit.ts` 54). Furnish: furniture, joinery, lamps; not Electrics-category points. Electrics: electrical points only. Other modes: no fixtures (rooms as today).
- Selection follows you between Plan and 3D. Switching tab keeps it; switching mode prunes it (`pruneSelection`, `lib/modes.ts`).

### Desktop (1440x900, 1920x1080)

Furnish, 3D, nothing selected (today):
```
+--[mark ▾]-------[Build Decorate *Furnish* Electrics ...]------[As listed|Proposed|Compare] ↶ ↷ ⌘K--+
|                                                                                  +---------------+ |
|            (house in 3D; furniture visible; clicks fall through to rooms)        | Furnish       | |
|                                                                                  | 17 pieces     | |
|                                                                                  | [ Add ]  →Plan| |
|                                                                                  +---------------+ |
|                    [Plan|3D] [floors] [sun] [Show] [Measure] [Walk] [Cameras] [Capture]            |
+----------------------------------------------------------------------------------------------------+
```
After, hover then click a sofa:
```
|        ┌╌╌╌╌╌╌╌╌┐  ← hover: thin teal box outline, cursor pointer, title "Sofa · 3-seat"         |
|        ╎ sofa   ╎                                                    +----------------------+    |
|        └╌╌╌╌╌╌╌╌┘                                                    | Sofa · 3-seat    ✕   |    |
|   ┏━━━━━━━━━━┓  ← selected: solid teal outline + corner ticks         | Size  W 2.10 D 0.95  |    |
|   ┃ armchair ┃                                                       | Colour ●  Rotate ⟳   |    |
|   ┗━━━━━━━━━━┛                                                       | Lock  Duplicate  ⌫   |    |
|                                                                       +----------------------+    |
```
- **Hover**: dashed-look thin outline of the fixture's box (one shared line material), `cursor: pointer`. Off while walking, measuring or dragging the camera.
- **Selected**: solid outline in the brand teal (`BRAND_TEAL`, `src/lib/brand.ts`; the room hover's `#14a89b` is the lighter tint), drawn over geometry (`depthTest: false`, low opacity behind) so a piece inside a cupboard stays findable. Group members get the same outline.
- **Card**: the 3D card (ModePanel) shows exactly what the plan card shows for a fixture selection: `FixtureInspector` (one), `MultiFixtureInspector` (several). Close (✕) or Esc deselects and the card returns to the summary.
- **Electrics**: same, for points. The card shows the point inspector (number, kind, circuit, height). "Link lights" is disabled in 3D with the hint "Link on the plan" and a button that switches tab.
- **Add (3D)**: opens the same picker over the 3D view; choosing an item drops it on the floor under the screen centre (the room hit by the centre ray, or the floor of the current level), snapped to the nearest wall like a plan placement, and selects it. The plan keeps its click-to-place flow. (Open question 2.)
- **Keys (3D, when a fixture is selected and focus is on the canvas)**: arrows nudge 1 cm, Shift+arrows 10 cm (`NUDGE_M`, `NUDGE_SHIFT_M`, `lib/nudge.ts`), mapped to the world axis nearest the camera's screen right/forward so "→" moves right on screen; R rotates 90°, Shift+R 15° (`planKeyAction` already returns `{ rotate }`); Ctrl/Cmd+D duplicate, C/V copy/paste (paste lands under the screen centre), Ctrl/Cmd+G group, Delete/Backspace remove, Esc deselect. Keys are off while walking (WalkControls owns arrows) and while Measure is armed.
- **Drag (chunk E)**: press on a selected piece and drag: it slides on its own floor's plane (or along the wall for a wall point), snapping to walls and neighbours exactly like the plan; Alt drags free. The orbit control is suspended for the drag. A press on an unselected piece selects it and orbits as before (so a drag that starts on furniture never surprises).
- **Right-click** on a fixture: menu Select, Duplicate, Rotate 90°, Lock/Unlock, Delete, Walk from here (reuses `ContextMenu` and the room menu in `Viewer.tsx` `openRoomMenu`).

### Phone (390x844)

- **Furnish (edits)**: tap a piece: outline, sheet rises to half with the inspector (via `raiseSheet()`, as `select()` does now). Tap empty floor: deselect, sheet back to its summary peek. Long-press (existing `useLongPress`, House.tsx 532): the same menu as right-click, as a bottom action list. Drag is only on an already-selected piece (press-and-hold 250 ms then move); otherwise one-finger drag orbits. Gesture fade applies while dragging. Keys: none.
- **Electrics (view-only)**: tap a point: outline, sheet shows the one-line peek "Socket 12 · Kitchen · Ring 2"; tapping the active tab opens the inspector inside `<fieldset disabled>`. No long-press menu, no drag, no Add.
- **Build/Garden/Plot (view-only)**: fixtures are not pickable (not selectable in those modes anyway). Garden items: tap shows the peek with the item name only.
- Targets: a pick tolerance of at least 22 px around tiny points (sockets are 8x8 cm, ~10 px at home zoom), via box inflation (below).

```
Phone, Furnish, sofa selected (half sheet)
+------------------------------+
| ◼▾   [Listed|Proposed|Cmp] ↶↷|
|                              |
|     ┏━━━━━━┓                 |
|     ┃ sofa ┃                 |
|     ┗━━━━━━┛                 |
|------------------------------|
| Sofa · 3-seat            ✕   |
| W 2.10  D 0.95   ⟳  ⧉  ⌫    |
| Colour ●●●●●                 |
+------------------------------+
|  Plan 3D  floors  sun  ⋯     |
+------------------------------+
```

### iPad notes

- Tablet is not compact (shortest side 820), so it behaves like desktop with touch: tap selects, long-press menu, drag only on a selected piece. No keys required. No layout work beyond checking the screenshots.

### Stairs on the plan (Build)

Before: tap the stair symbol, the room under it is selected; stairs are edited from Floor settings › Stairs.
After:
- Tap/click the stair symbol: the stairs are selected (symbol drawn `active`, the room is not selected). Drag still moves them (unchanged `stairsDown`).
- The card shows a **Stairs** inspector: Direction (with a "Turn 90°" button), Foot (straight / winders left / right), Head (straight / winders / quarter landing + steps), Winders 2/3, Steps 1-3, Length, Width, Remove stairs.
- Keys: arrows nudge (1/10 cm), R turns the direction 90° clockwise (up → right → down → left), Delete removes (one undo step), Esc deselects.
- Floor settings loses the Stairs section; when a floor has no stairs, Build's floor summary keeps one "Add stairs" button (drops them in the middle of the floor, selected). The `ModeSummaries` "Stairs" row goes.
- Symbol tooltip: "Stairs. Click to edit; drag to move."
- Phone (Build is view-only): tap selects and shows the peek "Stairs · up · 2.6 m"; inspector disabled.

### States

| State | Desktop | Phone |
|---|---|---|
| Empty (no fixtures on floor) | Card: summary with Add; hover does nothing | Sheet hidden or summary peek |
| Hover | Outline + pointer cursor | n/a |
| Selected one / several | Outline(s); FixtureInspector / MultiFixtureInspector | Half sheet (Furnish); peek (Electrics) |
| Selection on another floor than the plan shows | Selecting in 3D sets `editFloorId` to that floor | same |
| Selected item deleted or undone away | Selection pruned (`liveIds` logic moves with the state); card back to summary | same |
| Locked piece | Selectable; drag and nudge refuse; lock glyph in card | same |
| Busy (geometry rebuilding after an edit, Add placing) | No spinner: rebuild is synchronous; Add shows `<Loader kind="lift">` + "Placing…" only if the picker's catalogue is still loading | same |
| Error (pick misses: id no longer in model) | Treated as empty selection; no message | same |
| Drag would clash | Plan's clash tint shows in the card ("Overlaps 1 piece"), the move is allowed | same |

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

### 1. Shared selection in the store

| Today | After |
|---|---|
| `selectedRoomId`, `selectedEdge`, `hoveredRoomId`, `gardenSel` in store (`src/store.ts` 80-106) | unchanged |
| `selectedFixtureIds` in `useState` (`useSelection.ts` 32) | **store** `selectedFixtureIds: string[]` |
| `hoverGroup` in `useState` (plan only) | stays local; 3D hover is **store** `hoveredFixtureId: string \| null` (subscribed only by the highlight) |
| opening, wall, canopy, corner, litEdge, edgeEdit in `useState` | stay local (3D does not pick them) |
| no stairs selection | local `selectedStairs: boolean` in `usePlanSelection` (plan-only) |

- `src/store.ts`: add both fields to `State` (UI section, "Not persisted"), to the `setUi` `Pick<>` key list (~160-175), to the mode-switch clears (the blocks that null `selectedRoomId` at ~272, 286, 316) and to `reset` (433). Leave the `persist` partialize alone: UI is not persisted, so **no persisted-state migration** and no `migrate.ts` change.
- `setUi` rule (beside the existing one at ~431 that clears `selectedEdge` on a room change): setting `selectedRoomId` to a non-null id clears `selectedFixtureIds`, and vice versa, so the two never both hold.
- `src/lib/modes.ts`: `PlanSelection` gains `stairs?: true`; `SelKind` gains `"stairs"`; `SELECTABLE.build` gains `"stairs"`; `pruneSelection` handles it.
- `src/editor/plan/useSelection.ts`: `selectedFixtureIds` reads `useStore((s) => s.selectedFixtureIds)`; `setSelectedFixtureIds(ids)` becomes `setUi({ selectedFixtureIds: ids })`. `select()` writes rooms and fixtures in one `setUi` call. `liveIds` keeps filtering against the floor. `Selection` type gains `stairs?: true`.
- New pure helper in `src/lib/fixtureSelection.ts` (+ test): `fixtureFloorId(model, id): string | undefined` and `liveSelection(model, ids)`. Selecting in 3D calls `setUi({ selectedFixtureIds, editFloorId: fixtureFloorId(...) })` so the plan and the card agree on the floor.
- Extract the selection-independent commands (`duplicateFixtureIds`, `copyFixtureIds`, `pasteFixtures`, `removeSelected` for fixtures, `lockFixtures`, `groupSelected`, `patchFixture`) into `useFixtureCommands(variant, floor, viewCentre)` in `src/editor/fixtureCommands.ts`, used by `usePlanSelection` and by the 3D card and keys. They read selection from the store, not from closure state.

### 2. Picking in 3D (no geometry changes)

- Fixtures stay merged. Ids are recovered analytically: every fixture's world box is already known from `fixtureBox(fx, item, ceiling)` (`lib/planMath.ts` 564), `toWorld` (`lib/geometry.ts` 82) and `fx.rot`.
- New `src/lib/fixturePick.ts` (+ `fixturePick.test.ts`), pure, no three.js import (plain `{x,y,z}` vectors):
  - `type PickBox = { id: string; cx: number; cy: number; cz: number; hw: number; hh: number; hd: number; yaw: number }` (world metres, y up).
  - `fixturePickBoxes(floor, ceiling, elevation, filter: (item) => boolean): PickBox[]` — skips unknown types and items `filter` rejects (the mode's `fixtureSelectable`); keeps rugs (selectable on the plan) with `hh` of at least 1 cm. Inflates each half-size to at least `MIN_HALF_M = 0.04` (so a socket is 8 cm and a 22 px target at home zoom; tune in the check).
  - `rayBoxes(origin, dir, boxes): { index: number; distance: number } | null` — slab test in each box's local frame; when two boxes are hit within 2 cm of each other, the smaller-volume box wins (a lamp on a bedside table, a socket on a worktop upstand).
  - Bench target: 500 boxes under 0.1 ms per ray (vitest bench or a timed test with a generous bound).
- New `src/three/FixturePicker.tsx`: one `THREE.Object3D` (no geometry, not rendered) whose `raycast(raycaster, hits)` runs `rayBoxes` on the ray in world space and pushes one intersection `{ distance, point, object: this, instanceId: index }`. r3f sorts it with every other hit, so walls in front still win and `e.instanceId` gives the box index, hence the fixture id. Mounted inside `Fixtures` only when the mode picks fixtures (`editsFixtures(mode)`) and not walking; handlers `onClick`, `onPointerMove`, `onPointerOut`, `onPointerDown`, `onContextMenu`.
- The merged meshes get `raycast={NO_RAYCAST}` so r3f never triangle-tests thousands of fixture triangles per pointer move.
- **Occlusion**: today walls and the roof only get a blocking handler in Decorate (`House.tsx` 147, 296, 311: `onClick={onPickWall ? block : undefined}`). r3f only intersects objects with handlers, so a sofa behind a wall would be picked through it. Change the condition to `onPickWall || picksFixtures` so walls, roof and slabs occlude picks in Furnish and Electrics. The room-floor meshes already have handlers; a fixture hit is nearer than the floor under it, and the picker calls `e.stopPropagation()`.
- `House.tsx` / `Viewer.tsx`: new props `onSelectFixtures(floor, ids, how: "replace" | "toggle" | "single")` and `onContextFixture(floor, id, x, y)`, threaded like `onSelectRoom`/`onContextRoom` (Viewer ~47, 134-160, 229-230), stable through the existing `live` ref so floors stay memoised.
- Group expansion and modifier rules reuse `expandToGroups` (`lib/fixtureGroups.ts`) exactly as `fixtureDown` does.

### 3. Highlight with no shader compile and no shadow redraw

- New `src/three/FixtureHighlight.tsx`, built on the 9058334 pattern:
  - Module-level, never disposed: `UNIT_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))`; `SEL_LINE = new LineBasicMaterial({ color: BRAND_TEAL, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 })`; `HOVER_LINE_FX` (lighter, opacity 0.6).
  - A fixed pool of `MAX_OUTLINES = 64` `LineSegments(UNIT_EDGES, SEL_LINE)` plus one hover segment, created once, always mounted, `visible` toggled, `matrixAutoUpdate = false`, matrix set from the `PickBox` (translate · yawRotation · scale(2hw, 2hh, 2hd)). Showing or moving an outline changes neither programs nor the renderer's geometry count, so `ShadowUpdates` never fires; `castShadow = false`, `raycast = NO_RAYCAST`, `renderOrder = 4`.
  - Stand-ins registered with `useOffstageCompile` (one `LineSegments` per material) so `Precompile` compiles both programs up front.
  - Subscribes to `hoveredFixtureId` and `selectedFixtureIds` itself (like `RoomHover`), so hover never re-renders `Floor`/`Fixtures`; calls `invalidate()` on change (frames are on demand).
  - Over 64 selected (select-all): outline the selection's combined box instead.
- Hover writes to the store only when the id changes (`if (st.hoveredFixtureId !== id)`), so pointer moves inside one piece cost a ray test and nothing else.

### 4. The 3D card

- Extract the `editsFixtures(mode)` branch of `PlanInspector` (`src/editor/plan/chrome/PlanInspector.tsx` 55-90) into `src/editor/FixtureCard.tsx`: `FixtureCard({ variant, floor, mode, ids, clashes, misfits, commands, onRefit })` rendering `MultiFixtureInspector` / `FixtureInspector` / nothing. `PlanInspector` uses it unchanged in behaviour.
- New `useFixtureFlags(floor, ceiling)` in `src/editor/fixtureFlags.ts`: the `clashes` and `misfits` derivations lifted from `useGeometry.ts` (~39-54, `overlappingIds(fixtureSolids(...))` and the misfit map), memoised; `useGeometry` calls it so there is one source.
- `ModePanel.tsx`: in `furnish` and `electrics`, when `selectedFixtureIds` has live ids on the panel's floor, render `FixtureCard`; else the summary / `ElectricsPanel` as now. The furnish `onAdd` no longer switches tab when `tab === "3d"`; it calls `requestAddPicker({ target: "3d" })`.
- `src/editor/addPicker.ts`: `requestAddPicker(opts?: { target?: "plan" | "3d" })`. In 3D the chosen item is placed by a new `placeAtView(floor, item)` in `src/three/placeAtView.ts`: cast the screen-centre ray to the floor plane at the level's elevation, convert with the new `fromWorld(floor, v)` (inverse of `toWorld`, `lib/geometry.ts`), snap with `snapFixturePlacement` (below), add, select.
- `FurnishSummary` piece rows become buttons that select the piece (the keyboard and screen-reader route to a selection in 3D).

### 5. Keys in 3D

- New `src/three/useFixtureKeys3d.ts`, mounted by `Viewer` when `tab === "3d"`, `editsFixtures(mode)`, `canEdit(mode, compact)`, not walking, Measure not armed. Uses `keyBelongsElsewhere` (`lib/nudge.ts` 31) and `planKeyAction` (`lib/planKeys.ts` 30) with `fixtureSelected` from the store; ignores the tool/image/fit/zoom actions.
- New pure `cameraArrow(key, shift, cameraYaw): Pt | null` in `lib/nudge.ts` (+ tests): `arrowDelta` rotated to the nearest plan axis of the camera's screen right/forward, in metres; caller multiplies by `pxPerM`. Locked pieces refuse (same `anyLocked`).
- Each key press is one undo step (store coalescing, `COALESCE_MS` 700, already merges a burst of nudges).

### 6. Drag on the floor plane (chunk E)

- In scope, last, behind the rest: it can ship separately.
- Extract the snap from `useGeometry.ts` `snapFixture` (114-130) into pure `snapFixturePlacement(geo: { faceLines, solids }, c, box, rot, free, exclude, how, ppm, tolPx)` in `src/lib/fixtureSnap.ts` (+ tests copied from the plan cases); `useGeometry` keeps a thin wrapper. The plan's drag path in `useDrag.ts` (~563-569) is untouched apart from calling the wrapper.
- `src/three/useFixtureDrag3d.ts`: on `pointerdown` on an already-selected, unlocked piece: `holdUndo(true)` (`store.ts` 197), disable the orbit controls, capture the pointer; each move intersects the pointer ray with the plane `y = floor elevation` (wall points: the plane of the wall face they snapped to, using `snapKind`), converts with `fromWorld`, offsets by the grab point, snaps (`how = snapKind(item)`, `free = e.altKey`), patches through `useFixtureCommands`. Group: moves the whole selection by the lead's delta. Ends with `holdUndo(false)`; Esc mid-drag restores the start positions.
- Snap tolerance in 3D: 12 screen px converted to metres at the grab depth (not the plan's zoom-based `tol()`).
- Phone: the same hook, gated by a 250 ms hold on a selected piece and `canEdit("furnish", true)`; it calls the gesture-fade start/stop the quick win added.

### 7. Touch and the phone sheet

- Move `useLongPress` out of `House.tsx` (532) into `src/three/useLongPress.ts`; rooms and the fixture picker share it.
- Fixture long-press opens `ContextMenu` at the touch point (Furnish only on compact; nothing in Electrics on compact).
- Selecting raises the sheet via `raiseSheet()` (already inside `select()`); in view-only modes the sheet goes from `hidden` to `peek` and stays there until the tab is tapped.

### 8. Garden items in 3D (cheap)

- `SiteItems.tsx` builds one merged group (`buildGarden`), and `lib/siteItems.ts` already has `hitItem(items, p, tol)` on the plot plane. Add an `onClick` on the `<primitive>` group in Garden mode: take `e.point` (x, z), call `hitItem`, `setUi({ gardenSel: [id] })` (Shift toggles). `gardenSel` is already shared with the Garden panel. No hover highlight in v1 (the panel names the item); if wanted later, reuse `FixtureHighlight` with `itemBounds`.
- Phone: Garden is view-only, so tap shows the peek only.

### 9. Stairs on the plan

- `useDrag.ts` `stairsDown`: `tap: () => sel.select({ stairs: true })` in Build (still `backgroundTap(m)` in other modes, where the symbol is not interactive anyway).
- `plan/layers/Stairs.tsx`: `active` from `sel.selectedStairs`; new title text.
- New `src/editor/StairsInspector.tsx`: the controls moved out of the FloorSettings Stairs section verbatim (they call `updateFloor(variant, floor.id, …)`), plus "Turn 90°" and Remove. New pure `turnStairs(dir: StairsDir): StairsDir` in `lib/stairs.ts` (+ test).
- `PlanInspector` Build branch: `sel.selectedStairs && floor.stairs ? <StairsInspector …/> : …`.
- `useKeys.ts`: when `selectedStairs`, arrows move `floor.stairs` by `arrowDelta × ppm`, R calls `turnStairs`, Delete clears `stairs` (all `updateFloor` calls, one undo step each).
- FloorSettings: delete the Stairs section; `BuildSummary` (`ModeSummaries.tsx`) shows "Add stairs" only when `!floor.stairs`, and Add selects them. `stairsSummary` in `lib/modeSummary.ts` feeds the stairs inspector title instead.

### Tests to add (vitest, in src/lib)

- `fixturePick.test.ts`: ray hits the right box; rotated box; nearest wins; nested smaller wins; miss returns null; min-size inflation; 500-box timing bound.
- `fixtureSelection.test.ts`: `fixtureFloorId` across floors and layouts; pruning deleted ids.
- `fixtureSnap.test.ts`: the plan's snap cases through the extracted function give identical placements (golden values taken from the current `useGeometry` path before extraction).
- `nudge.test.ts`: `cameraArrow` for yaws 0, 45 ± ε, 90, 180, 270.
- `geometry.test.ts`: `fromWorld(toWorld(p)) ≈ p`.
- `stairs.test.ts`: `turnStairs` cycle.
- `modes.test.ts` (or existing): `pruneSelection` keeps `stairs` in Build only.
- Store test: setting a room clears fixtures and vice versa; mode switch clears both.

### Performance notes

- Pointer move in 3D Furnish: one analytic ray test over the floor's boxes (tens to a few hundred) instead of triangle tests on merged meshes. Boxes are memoised on the same `geoKey` as the meshes.
- Highlight: 0 new programs, 0 geometry count changes; matrix writes only.
- `ModePanel` subscribes to `selectedFixtureIds`, never to `hoveredFixtureId`.
- No change to the merged mesh build or draw calls.

### Accessibility

- Every 3D selection has a non-pointer route: FurnishSummary rows and the Electrics schedule select pieces/points.
- On selection, an `aria-live="polite"` line in the card reads "Sofa selected" / "3 pieces selected".
- Keys never fire when focus is in a field (`keyBelongsElsewhere`).
- Outlines meet 3:1 against the walls and floors (teal at 0.9 opacity, depth-ignoring).

## Build plan (chunks for parallel Sonnet builders in separate worktrees)

Order: **A** first (alone). Then **B, C, D, G, H** in parallel. Then **F** (after B, C) and **E** (after B). **I** last. Merge order where files touch: C before G (both edit `PlanInspector.tsx`), B before F (both edit `House.tsx`).

| Chunk | Owns | Stays out of | Steps | Verify |
|---|---|---|---|---|
| **A** Store selection | `src/store.ts`, `src/editor/plan/useSelection.ts`, `src/lib/modes.ts`, new `src/lib/fixtureSelection.ts` (+test), new `src/editor/fixtureCommands.ts` | everything in `src/three/`, `PlanInspector.tsx`, `ModePanel.tsx` | §1 | `npm run check`; `npm run regress:editors -- --port <n>` unchanged; `scripts/test-touch-plan.cjs` passes |
| **B** Pick + highlight | new `src/lib/fixturePick.ts` (+test), new `src/three/FixturePicker.tsx`, new `src/three/FixtureHighlight.tsx`, `src/three/Fixtures.tsx`, `src/three/House.tsx`, `src/three/Viewer.tsx` (props, menu) | store, editor, components | §2, §3; wire `onSelectFixtures` to `setUi` | check; dev: click a sofa sets `__houseStore.getState().selectedFixtureIds`; program-count check (I) |
| **C** 3D card + Add | new `src/editor/FixtureCard.tsx`, new `src/editor/fixtureFlags.ts`, `PlanInspector.tsx` (fixture branch only), `src/components/ModePanel.tsx`, `src/editor/addPicker.ts`, new `src/three/placeAtView.ts`, `src/lib/geometry.ts` (`fromWorld`), `ModeSummaries.tsx` (FurnishSummary rows only), `useGeometry.ts` (flags only) | `src/three/House.tsx`, `Fixtures.tsx`, `useDrag.ts` | §4 | check; select via store in 3D shows FixtureInspector; Add in 3D adds and selects |
| **D** 3D keys | new `src/three/useFixtureKeys3d.ts`, `src/lib/nudge.ts` (+test), one mount line in `Viewer.tsx` (coordinate with B: merge after B) | plan `useKeys.ts` | §5 | check; Playwright: select, ArrowRight moves `x` by 0.01 m × ppm, R rotates 90, Delete removes, Ctrl+Z restores |
| **E** 3D drag | new `src/lib/fixtureSnap.ts` (+test), `useGeometry.ts` (wrapper), new `src/three/useFixtureDrag3d.ts`, orbit-control suspend in `Viewer.tsx` | `useDrag.ts` beyond the wrapper call | §6 | check; regress:editors identical; Playwright drag sofa toward a wall ends flush (back face within 1 cm of wall face) |
| **F** Touch | new `src/three/useLongPress.ts` (moved), `House.tsx` (import), `FixturePicker.tsx` (long-press), `components/mobile/` only if the sheet needs a hook | store, editor | §7 | `scripts/test-touch-plan.cjs`; new phone checks in I |
| **G** Stairs on plan | new `src/editor/StairsInspector.tsx`, the FloorSettings file (remove section), `useDrag.ts` (`stairsDown` tap only), `plan/layers/Stairs.tsx`, `useKeys.ts` (stairs branch), `PlanInspector.tsx` (Build branch line), `ModeSummaries.tsx` (BuildSummary), `lib/stairs.ts` (`turnStairs` + test), `useSelection.ts` (`selectedStairs` only, after A) | `src/three/` | §9 | check; regress:editors; Playwright: click symbol shows "Stairs" card, R turns, Delete removes, undo restores |
| **H** Garden 3D | `src/three/SiteItems.tsx` | everything else | §8 | `scripts/test-garden.cjs`; click a bench in 3D sets `gardenSel` |
| **I** Checks + shots | new `scripts/test-direct-select.cjs`, `scripts/shoot-chassis.cjs` (new views), dev hook `window.__projectFixture(id)` in `Viewer.tsx` under `import.meta.env.DEV` | product code | write the checks below | runs green against a dev server |

## Acceptance checks (runnable)

- `npm run check` and `npm run build` pass; GitHub Actions green.
- `npm run regress:editors -- --port <n>`: no diff in plan behaviour.
- `scripts/test-touch-plan.cjs`, `scripts/test-garden.cjs`, `scripts/test-electrics.cjs` pass.
- New `scripts/test-direct-select.cjs` (Playwright, Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), listing 91770873, at 1440x900 and 390x844:
  - Furnish, 3D: click the screen point from `__projectFixture(sofaId)` → `selectedFixtureIds` equals the sofa's group; card contains "Sofa"; tab still `3d`.
  - Switch to Plan: same ids selected, plan outline drawn; switch back: still selected.
  - Electrics, 3D: click a socket → selected; on 390x844 the inspector `fieldset` is `disabled`.
  - A piece behind a wall (camera placed outside) is not picked; the click selects nothing.
  - Hover across 20 fixtures at night with lights on, High quality: `renderer.info.programs.length` unchanged, shadow redraw count 0 (same probe as 9058334).
  - Pointer-move handler median under 1 ms on desktop (performance marks around the picker's raycast).
  - Keys: ArrowRight, R, Ctrl+D, Delete, Ctrl+Z give the expected model changes.
  - Phone Furnish: tap selects and the sheet detent is `half`; long-press opens the menu; Electrics tap gives `peek`.
  - Build, plan: click the stair symbol → card title "Stairs", `selectedRoomId` null; Floor settings has no Stairs section.
  - Garden, 3D (desktop): click a garden item → `gardenSel` has its id.
- Screenshots via `scripts/shoot-chassis.cjs`, new views `3d-furnish-selected`, `3d-electrics-selected`, `plan-build-stairs`, at phone 390x844, desktop 1440x900 and desktop-wide 1920x1080 (tablet-land 1180x820 as a smoke check). Reviewer checks: outline visible and on-brand; card not covering the selection at 1440x900; phone sheet half leaves the piece visible.
- Targets: click-to-card under 100 ms on desktop; pick tolerance at least 22 px on a socket at the phone home view.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Box picking feels wrong for odd shapes (L-shaped sofa, corner units) | Nested-smaller rule; corner units already carry their own box; accept box precision (non-goal) and revisit with per-fixture glow-style meshes only if the owner objects |
| Picks through walls in modes without blocking handlers | §2 occlusion change; acceptance check for the behind-the-wall case |
| Lifting selection into the store regresses the plan (stale ids, double renders) | Chunk A alone first; regress:editors and touch checks; `liveIds` pruning kept |
| Store churn on hover re-renders panels | Only `FixtureHighlight` subscribes to `hoveredFixtureId`; write only on change |
| Highlight compiles a program on first show | Stand-ins in `useOffstageCompile`; program-count check |
| 3D keys clash with Walk, Measure, the palette, plan keys | Mounted only on the 3D tab, not walking, not measuring; `keyBelongsElsewhere` |
| Drag fights the orbit on touch | Drag only on an already-selected piece after a 250 ms hold; else orbit |
| Floors stack: a pick on the upper floor hits a lower floor's box | Boxes per floor are only built for floors shown (respect `maxLevel`); world elevation in `fixturePickBoxes` |
| Merge conflicts in `PlanInspector.tsx`, `House.tsx`, `Viewer.tsx` | Merge order C→G, B→F, B→D; each chunk edits a named region only |
| Compare / Wipe shows two layouts | Picking only on the active layout's viewer (`active` prop on Viewer); the ghost layout never picks |

## Open questions for the owner

1. **3D drag: ship it in this redesign?** (a) Desktop and phone, phone only on an already-selected piece; (b) desktop only; (c) not now: select, keys and inspector only. **Recommend (a)**, built last so the rest can ship without it.
2. **Add in 3D:** (a) place under the screen centre in 3D, snapped to a wall, selected; (b) keep jumping to the Plan picker. **Recommend (a)**: it keeps you where you were.
3. **Electrics in 3D on desktop:** (a) select, inspect, nudge, delete; linking switches to lights stays on the plan; (b) also link lights by clicking them in 3D. **Recommend (a)** now; (b) is a follow-up once picking proves itself.
4. **Stairs in 3D:** (a) not pickable (Build in 3D picks rooms); (b) pickable in Build on desktop, opening the stairs inspector. **Recommend (a)**: the plan is where stairs are placed.

## Out of scope

- Picking openings, walls, canopies, roofs in 3D; marquee select in 3D.
- Editing anything on phones beyond Decorate and Furnish.
- Changing how fixtures are built or merged; BVH libraries.
- Garden item drag or hover highlight in 3D; Plot items in 3D.
- iPad-specific layout.

## Effort (S/M/L per chunk and in total)

| Chunk | Effort | Model |
|---|---|---|
| A Store selection | M | Sonnet, medium |
| B Pick + highlight | M | Sonnet, medium; Opus review of the picker and highlight |
| C 3D card + Add | M | Sonnet, medium |
| D 3D keys | S | Sonnet, medium |
| E 3D drag | L | Sonnet, medium; Opus high review (snap, wall planes) |
| F Touch | S | Sonnet, medium |
| G Stairs on plan | M | Sonnet, medium |
| H Garden 3D | S | Haiku/Sonnet, low |
| I Checks + shots | S | Sonnet, medium |
| **Total** | **L** (without E: M-L) | |
