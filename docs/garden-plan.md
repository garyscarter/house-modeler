# Garden mode: implementation plan

Planner: Björk. Builders: Lily Allen (data and library), Charli XCX (Garden mode UI), Lorde (3D). Merger: the lead session.
Decisions 1-8 in the brief are settled; this file turns them into files, names and checks. House = "listing 91770873"; no address, postcode, title number or owner names anywhere.

## 0. What Chunk 0 landed (commit "Garden plan: shared types, stubs and the Garden mode entry (Björk)")

Every builder starts from this commit. These signatures are the contract: do not rename or change them; add beside them.

| File | What is there |
|---|---|
| `src/types.ts` | `Site.items?: GardenItem[]`; `GardenItem` (id, type, x, y, rot, w?, d?, h?, mount?, to?, toH?, sag?, seats?, color?, accent?, seed?); `KerbStyle`; `SiteSurface.smooth?`, `.kerb?`, `.kerbHeight?` |
| `src/lib/report.ts` | `ChangeCategory` + `"Garden"`; `CostLineId` + `newLawn newBed gardenEdging gardenFurniture gardenStructure gardenLighting gardenPlanting hedging removeGardenItem`, with `COST_LINES` entries (unit and example rate) |
| `src/lib/gardenCatalogue.ts` | `GardenCategory`, `GARDEN_CATEGORIES`, `GardenKind`, `GardenShape` (36 shapes), `RunKind`, `GardenDef`, seeded `GARDEN_ITEMS` (41 entries, one or more per shape), `gardenDef`, `isPlant`, `isLight`, `filterGarden`, `itemSize`, `KerbDef`, `KERBS`, `kerbOf` (working) |
| `src/lib/surfaceCurve.ts` | `CURVE_SAMPLES`, `closedSpline` (centripetal Catmull-Rom, working), `surfaceOutline`, `circleControls`, `rectControls`, `surfaceArea`, `surfacePerimeter`, `outlinePath` (all working) |
| `src/lib/siteItems.ts` | `P3`, `groundHeightAt`, `itemsOf`, `itemFootprint`, `itemBounds`, `runLength`, `hitItem`, `snapItem` (grid only; wall snap TODO), `moveItems`, `copyItems`, `festoonCurve` (parabola), `alongEvery`, `steppingStones`, `itemOccluders` (TODO, returns []), `placeSpot` |
| `src/lib/dusk.ts` | `DUSK_ALTITUDE`, `duskHour` (stub: 20), `lightGlow` (stub: 1) |
| `src/lib/modes.ts` | `"garden"` in `Mode`/`MODES` between furnish and plot; label "Garden", icon `flower`, subtitle; Plot's icon is now `compass`, subtitle "Boundaries, neighbours, orientation and roof"; `PLAN_TOOLS.garden = []`, `SELECTABLE.garden = []`; `editsSite(mode)` (plot or garden); `modeSwitchPatch` opens the site editor for both |
| `src/components/icons.tsx` | `flower`, `compass` icons |
| interim wiring | `App.tsx` and `store.ts` use `editsSite` instead of `mode === "plot"`; `ModePanel` shows `PlotPanel` for garden (placeholder for GardenPanel); `PlanInspector` takes `Mode` |
| tests | `gardenCatalogue.test.ts`, `surfaceCurve.test.ts`, `siteItems.test.ts`, `modes.test.ts` garden case |

## 1. Data model

All new fields are optional, so old saves, synced projects and imports load unchanged: **no `PERSIST_VERSION` bump, no migration step**. Readers must treat absent as the default below.

| Field | Default when absent | Notes |
|---|---|---|
| `Site.items` | `[]` (`itemsOf(site)`) | world metres, same frame as surfaces |
| `GardenItem.x, y` | required | centre; for a run, the first end |
| `GardenItem.rot` | required (0) | degrees clockwise on the plan; ignored for runs |
| `w, d, h` | catalogue (`itemSize`) | plants: w = d = spread, h = height |
| `mount` | `def.mount ?? 0` | wall lights: base height above ground |
| `to` | none | runs only (`def.run` set): festoon, stones, hedge, bamboo, climber |
| `toH` | `h` | festoon: height of the second end |
| `sag` | 0.3 | festoon sag at mid-span |
| `seats` | `def.seats` | dining/lounge sets |
| `color`, `accent` | `def.color`, `def.accent` | |
| `seed` | hash of `id` | plants' shape variation |
| `SiteSurface.smooth` | false | outline = `surfaceOutline(s)`; points stay control points |
| `SiteSurface.kerb` | lawn/bed: `"brick"` if `slope.base > 0`, else `"none"`; other kinds: none | `kerbOf(s)` is the only reader |
| `SiteSurface.kerbHeight` | `KERBS[style].height` | upstand above the surface's top at its edge |

Rules everyone follows:
- Any code that needs a surface's real shape (area, point-in-surface, 3D, editor path, planning) uses `surfaceOutline(s)`, never `s.polygon`. Code that edits shape (drag, insert/delete point, boundary-corner follow in `boundaryOpening.ts`) keeps editing `s.polygon`.
- An item stands at `groundHeightAt(site, {x, y})` (beds included). Runs: each end at its own ground.
- Ids: user items `uid()`; built-in baseline items fixed ids `listing-<name>` so listing updates can match them.
- Catalogue ids in `GARDEN_ITEMS` are saved data: never rename once merged; add new ones instead.
- `types.ts` is **owned by Lily Allen** after Chunk 0 (append-only, optional fields). Charli and Lorde do not edit it; if they need a field they say so in their report.

## 2. Chunks and file ownership

Each file has exactly one owner. A builder may read anything; it edits only its own files. "New" files are created by that owner.

### Lily Allen: data and library (Sonnet, medium)

Owns: `src/types.ts`; `src/lib/gardenCatalogue.ts`, `siteItems.ts`, `surfaceCurve.ts`, `siteDiff.ts`, `siteMerge.ts`, `sitePreset.ts`, `report.ts`, `layoutMerge.ts`, `presetActions.ts`, `migrate.ts`, `sunlight.ts`, `wallSteps.ts`, `planning.ts`, `export.ts`, `houses/listing91770873.ts` (each with its `.test.ts`); `src/components/ReportPanel.tsx`, `ReviewDocument.tsx`, `ListingUpdatesDialog.tsx` (only if the new group needs it); `reference/listing-91770873/NOTES.md`.

Must not touch: anything in `src/three/`, `src/editor/`, `src/components/` other than the three above, `src/store.ts`, `src/App.tsx`, `src/lib/modes.ts`, `src/lib/chassis.ts`, `src/lib/dusk.ts`, `src/lib/gardenParts.ts`, `src/lib/plantForms.ts`.

Work:
1. **Catalogue** (`gardenCatalogue.ts`): check every seeded entry's UK size and colour; add variants where useful (e.g. `dining-6` stays the baseline's "dark aluminium table and six chairs"; parasol in grey `#8c8f91`). Keep every shape used by at least one entry. Test: ids unique, every `run` entry has `pitch`, every `light` has `glow`, every plant `round` or `run`, every `costLine` in `COST_LINES`, sizes positive.
2. **siteItems.ts**: finish `snapItem` (entries with `wall`: nearest boundary edge whose kind is wall/fence or house outline edge within `reach`; back flush to it, `rot` so local -y faces the wall; runs with `climber` snap both ends onto the wall line); `itemOccluders` (plants with `shade`: canopy prism, base = 35% of h for trees, 0 for shrubs/hedges; structures: box from 0 to h; runs: strip footprint); tests for each exported function (footprints of rotated and round items, hitItem order, snap to a wall at 0°/90°, stones count and ends, `alongEvery` spacing, `placeSpot`).
3. **surfaceCurve.ts** tests: winding preserved (sign of area same as control polygon), ellipse area within 3%, perimeter of a smooth circle within 2% of 2πr, `outlinePath` closes with Z.
4. **Outline everywhere**: `wallSteps.groundAt`, `planning.ts` (`onHighway`, hard-surface rule), `siteDiff` areas use `surfaceOutline`/`surfaceArea`. Existing tests must still pass.
5. **siteDiff.ts**: add `export function gardenChanges(before: Site, after: Site): Change[]` and include it in `diffSites`. Pair items by id, then unmatched by same `type` within 0.3 m. Added: `costLine = def.costLine`, quantity in the line's unit (each: 1; m: `runLength`; m²: stones `count × w × d`), description "New <name>" (+ run length). Removed: `removeGardenItem`, 1 each, "Remove <name>". Moved ≥ 0.3 m or resized: info only (no costLine). All: `category: "Garden"`, `floor: SITE_GROUP`, `level: SITE_LEVEL`, key `site:item:<id>`. Surfaces: new or grown lawn area → `newLawn` m², bed → `newBed` m² (patio/path/drive stay `newPaving`); a kerb style that appears or changes → `gardenEdging`, quantity `surfacePerimeter` m; `smooth` toggled alone is not a change. Tests in `siteDiff.test.ts`.
6. **report.ts**: lines landed in Chunk 0; adjust labels/examples if needed; make sure `diffModels(…, sites)` passes garden changes through and `estimateCosts` totals them (test). `ReportPanel`/`ReviewDocument`: show the "Garden" category group if they group by category (check; minimal change).
7. **Listing updates**: `layoutMerge.ts` `UpdateGroup` + `"garden"`, label "Garden", in `UPDATE_GROUP_ORDER` after "neighbours". `siteMerge.ts` `export function gardenUpdates(mine: Site, latest: Site): PlotChange[]`: latest items (fixed ids) missing from mine → offered, ticked when mine has no items at all (a plot from before the garden), else unticked; same id with different type/position (> 5 cm)/size → offered unticked. `mergeKeepingEdits` applies the ticked ones; `presetActions.ts` line ~115 offers `[...neighbourUpdates(...), ...gardenUpdates(...)]`. `sitePreset.hasPlotEdits` counts items (type, x, y, to, size) and surfaces' `smooth`/`kerb`/`kerbHeight`. Tests in `siteMerge.test.ts`, `sitePreset.test.ts`.
8. **Sun study**: `sunlight.occludersFor(model, site)` adds `itemOccluders(site)`; update `sunlightKey` so items change the cache key. Test.
9. **Baseline** in `listingSite()`: bump `LISTING_SITE_PRESET.version` 6 → 7. Items (fixed ids), positions from NOTES.md "Rear garden layout" and the boundary comments in `listingSite`:
   - `listing-bin-store` (`bin-store`, grey plastic) against the west wall behind the house, about 1.4 m back from the house's rear corner on edge 10, back to the wall;
   - `listing-conifer` (`conifer`) in the long raised bed (z -9.6 to -10.5), towards the west end (judge from rear-garden; say so in NOTES);
   - `listing-buddleia` (`buddleia`, h ≈ 3) in the west raised bed (x -4.55 to -3.75, z -7.0 to -9.6);
   - `listing-washing-line` (`washing-line`) on the patio, west half;
   - `listing-dining` (`dining-6`, dark aluminium) and `listing-parasol` (`parasol`, grey) on the patio, east of centre, clear of the curved planter;
   - `listing-recycling` (`recycling-box`, grey) beside the back door (find the back door in `listing91770873()`'s ground floor; world position via `lib/geometry.toWorld`);
   - the curved planter becomes `smooth: true` with `circleControls({x: 4.1, y: -7.2}, 1.5, 0.8)` (8 points) instead of the 20-gon; raised beds get explicit `kerb: "brick"`.
   Tests in `listing91770873.test.ts`: every item id fixed and unique, every type in the catalogue, every item inside the boundary and outside the house, bin store within 0.1 m of the west wall. Add a NOTES.md bullet under "Rear garden layout" saying what is placed, from which photo, and what is estimated (replace "The conifer is not drawn").
10. `export.ts`: `changesCsv` already carries category; nothing else this pass (a site-plan SVG is deferred).

Acceptance: `npm run check`, `npm run build`. No UI checks needed.

### Charli XCX: Garden mode UI (Sonnet, medium)

Owns: `src/lib/modes.ts`, `chassis.ts`, `commands.ts`, `modeSummary.ts` (each with `.test.ts`); `src/store.ts`; `src/App.tsx`; `src/components/ModeBar.tsx`, `ModePanel.tsx`, `PlotPanel.tsx`, `SitePanel.tsx`, `SitePanel.css`, `SlopeFields.tsx`, `SurfaceFinishField.tsx`, `icons.tsx`, `useStudioKeys.ts`, `Dock.tsx`, `mobile/*`; new `components/GardenPanel.tsx` (+ `.css`), new `components/KerbFields.tsx`; `src/editor/SiteEditor.tsx`, `SiteEditor.css`, `editor/site/*` (and new files there), `editor/AddItem.tsx`, `editor/addPicker.ts`, new `editor/GardenSymbol.tsx`; `scripts/shoot-chassis.cjs`, `scripts/test-touch-plan.cjs`, new `scripts/test-garden.cjs`.

Must not touch: `src/types.ts`, `src/lib/*` except the four above, `src/three/*`, `SunControls.tsx`, Lily's components.

Decisions (made, don't reopen):
- **Plot keeps the survey, Garden takes the surfaces.** One `SiteEditor` with a `mode: "plot" | "garden"` prop. Plot: boundary edges/corners and neighbours selectable; surfaces and items drawn, faded, not hit-testable; tools select, building. Garden: surfaces and items selectable; boundary and neighbours drawn, not selectable; tools below. The "Garden surfaces" list moves from `SitePanel` to `GardenPanel`; Plot's surface tool goes.
- **Tabs:** six tabs at 390 px (Build, Decorate, Furnish, Garden, Plot, Review). If any label clips or the bar scrolls at 360 px, drop labels to 11 px and tighten padding under `[data-chassis="phone"]`; only if it still fails, merge Garden into a Plot tab with a segmented switch, and say so.

Work:
1. **Mode plumbing**: remaining `mode === "plot"` checks become `editsSite(mode)` where they mean "on the site editor" (`useStudioKeys.ts:57`, `Dock.tsx:41`), stay plot-only where they mean survey (`SitePanel.tsx:65` "go to Plot"). `commands.ts`: a "Garden" command (keywords garden, plants, lawn, patio, furniture, lights) beside Plot's; Plot's keywords drop "garden". `ModePanel`: `garden` → `<GardenPanel />`. `modeSummary.ts`: `gardenSummary(site): string` ("3 surfaces · 7 items · 2 plants") + test. `TabBar` doc comment "five" → "six".
2. **Site editor tools in Garden** (`editor/site/types.ts` Tool + `"circle" | "polygon" | "place" | "run"`; Sel + `{ type: "item"; ids: string[] }`):
   - `V` select; `R` rectangle surface (existing drag, `rectControls`); `C` circle surface (drag from centre, `circleControls`, `smooth: true`); `P` polygon surface (click points; click the first point, double-click or Enter closes; Esc cancels; Backspace drops the last point); surface kind chosen in the tool rail as today.
   - `A` Add: opens the picker (below); picking a normal entry arms `place` (ghost follows the pointer, click places at `snapItem`); picking a run entry arms `run` (click first end, click second end). Esc disarms. Phone: picking places at `placeSpot(site)` (or the view centre if it is inside the plot) and selects it.
   - Draw tools are hidden on phone: add `"polygon" | "circle"` to `DRAW_TOOLS` in `chassis.ts` (Garden's `"rect"` is already in it; the site editor's surface tool must go through `toolAllowed`).
3. **Picker**: generalise `CataloguePicker` in `AddItem.tsx` or add `GardenPicker({ onPick }: { onPick: (def: GardenDef) => void })` beside it, same look: search box + category chips from `GARDEN_CATEGORIES`, `filterGarden`, a `GardenSymbol` thumbnail per entry. `AddPopover` reused for the popover.
4. **Plan symbols** `editor/GardenSymbol.tsx`: `export function GardenSymbol({ def, item, px, selected }: { def: GardenDef; item: GardenItem; px: number; selected?: boolean })`, drawn in world metres (scale `px` = SVG units per metre as the site editor uses), top-down, one case per `GardenShape`: plants as scalloped circles in `color` (trees with a trunk dot, hedges as scalloped strips along the run, climbers as a leafy band on the wall), table with chairs per `seats`, parasol as an octagon over its set, festoon as a dashed catenary line with bulb dots every `pitch`, stones as rounded squares from `steppingStones`, structures as outlined rectangles with a ridge line. Selected: brand selection stroke (CSS tokens).
5. **Interaction** (all edits through `updateSite`, so undo/redo and sync work): drag to move (both ends of a run; dragging one end handle of a run moves that end), rotate handle (15° snaps, Shift free) and `Q`/`E` ±15°, resize handles on non-round items (plants: one spread handle), arrows nudge `NUDGE_M` (Shift `NUDGE_SHIFT_M`) via `moveItems`, `Ctrl/Cmd+D` duplicate via `copyItems`, `Ctrl/Cmd+C/V` within the site (keep a module-level garden clipboard in `editor/site/`; don't use `lib/clipboard.ts`), Delete/Backspace removes, Shift-click multi-select. Hit-testing: `hitItem` before surfaces. Smooth surfaces render with `outlinePath`; handles stay on `polygon` points; "+" mid handles insert between control points.
6. **Inspectors** (in `SiteEditor`'s inspector card, and the same components in `GardenPanel` for the 3D tab): item (name, size in cm, spread/height for plants, rotation, colour and accent swatches, seats, mount for wall lights, festoon end heights `h`/`toH` and `sag`, run length readout, Duplicate, Delete); multi (count, Delete, Duplicate); surface (kind, finish, slope as now, "Curved edges" checkbox = `smooth`, `KerbFields`: style select from `KERBS` labels + height in cm, shown for lawn and bed only).
7. **GardenPanel** (sidebar and phone sheet): Surfaces list (moved from `SitePanel`), Items grouped by category with counts and tap-to-select (selection shared with the editor: put the garden selection in the store as `gardenSel: string[]`, not persisted, cleared by `modeSwitchPatch`), an "Add" button that opens the picker and places at `placeSpot`, and a line pointing to the Sun panel's Dusk preset when there are lights.
8. **Touch**: tap selects, drag moves, two-finger pan/pinch as the editor core does; rotation by the handle (44 px touch target) and inspector buttons ±15°. Scope all phone CSS under `[data-chassis="phone"]` / `[data-touch]`; desktop unchanged.
9. **Scripts**: `shoot-chassis.cjs` shoots Garden too; `test-touch-plan.cjs` gets a Garden case (tap to add from the picker, drag it, check `__houseStore.getState()` site items moved). New `scripts/test-garden.cjs` (desktop 1440×900): mode garden → plan; add `dining-6` by picker + click; drag 1 m; `E` rotates 15°; Ctrl+D duplicates; Delete; undo restores; draw a circle lawn (smooth true, 8 points); toggle "Curved edges"; set kerb sleeper; festoon placed by two clicks has `to`. Phone 390×844: tab bar `scrollWidth <= clientWidth`, all six labels visible, no draw tools in the rail.

Acceptance: `npm run check`, `npm run build`, `npm run regress:editors -- --port <n>` unchanged for Build/Furnish, the three scripts above pass, screenshots of Garden at desktop, tablet and phone look on-brand (`<Loader>` for any wait, CSS tokens only).

### Lorde: 3D (Opus, medium; high only if the plant forms fight back)

Owns: new `src/three/SiteItems.tsx`; `src/three/Site.tsx`, `siteTextures.ts`, `Lighting.tsx`, `SunHours.tsx`, `SiteDiff.tsx`, `Effects.tsx`, `Viewer.tsx` (dev hook only); `src/components/SunControls.tsx`, `SunControls.css`; `src/lib/dusk.ts`; new `src/lib/gardenParts.ts`, new `src/lib/plantForms.ts` (each with `.test.ts`).

Must not touch: `src/types.ts`, Lily's and Charli's files, `three/Fixtures.tsx` (copy patterns, don't import private helpers; if a helper is worth sharing, copy it).

Work:
1. **Parts as data** `lib/gardenParts.ts`: `export interface GPart { g: "box" | "cyl" | "cone" | "sphere" | "ico"; p: [number, number, number]; s: [number, number, number]; mat: GMat; rotY?: number; tilt?: number }`, `export type GMat = { color: string; finish: "metal" | "timber" | "plastic" | "fabric" | "stone" | "leaf" | "bark" | "soil" | "bulb"; glow?: string }`, `export function gardenParts(def: GardenDef, item: GardenItem): GPart[]` in the item's local frame (origin centre of footprint at its base, y up, back towards -z) for every non-plant, non-run shape. Test: every non-plant, non-run entry in `GARDEN_ITEMS` yields parts inside its w × d × h box (+5%), lights have a `bulb` part with `glow`.
2. **Plants** `lib/plantForms.ts`: `export function plantParts(def: GardenDef, item: GardenItem): GPart[]` seeded by `item.seed ?? hash(item.id)` (mulberry32): trees = trunk cylinder + 3-7 `ico` canopy blobs layered to the spread/height (conifer: stacked cones; birch: white trunk, loose blobs; olive/bay: lollipop), shrubs = 1-3 squashed ellipsoids, box ball a sphere, lavender/perennials = mound + flower speckle (small `ico`s in `accent`), grass = fan of thin tilted boxes, hydrangea = mound + flower heads, buddleia = arching blobs + purple cones. Runs: `runParts(def, item): GPart[]` for hedge/bamboo (blobs or canes every `pitch` along `to`), climber (flat leafy band on the wall plane up to h), stones (from `steppingStones`). Test: deterministic for a seed, within spread × height (+10%), part count budget per plant ≤ 40.
3. **`three/SiteItems.tsx`**: `export function SiteItems({ site, quiet }: { site: Site; quiet: boolean })`, mounted by `SiteContent` in `Site.tsx`. Builds every item's parts, places them at `GROUND_Y + groundHeightAt(site, centre)` (+ `mount`), rotated by `rot` (clockwise on plan = negative about +y; check against Fixtures.tsx), and merges geometry **per material** (`BufferGeometryUtils.mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`), memoised on `site.items` and `site.surfaces`; disposes on change. Leaves `flatShading`, low-poly (`IcosahedronGeometry(1, 0|1)`), slight per-blob colour jitter via vertex colours. Festoons: `festoonCurve` between the ends at `h`/`toH`, a thin dark tube or line, bulbs from `alongEvery(curve, pitch)` as **one `InstancedMesh`** for all bulbs on the site (emissive `glow`, `emissiveIntensity = 2 × lightGlow(altitude)`), a slim post at an end that is not within 0.3 m of a boundary wall (`pointSegmentDistance`). Bollard and wall-light heads: emissive the same way. **No real lights.** Plants and structures cast and receive shadows; bulbs don't. `quiet` (as other site parts): flat colours only.
4. **Budget**: the baseline garden plus 30 extra items stays under 40 draw calls and 80k triangles for the items layer; rebuild < 30 ms. Measure in dev via `renderer.info` (add `__houseRenderer` to the existing dev hook in `Viewer.tsx`).
5. **Surfaces** in `Site.tsx`: `Surface` uses `surfaceOutline(surface)` for the shape, the slope heights and `surfaceEdge`; kerbs from `kerbOf`: material per style (brick = existing brick texture, sleeper = new timber-sleeper texture, corten = rusty steel, render = pale render; add the kinds to `siteTextures.ts`, metre UVs via `metricBox`-style mapping); the raised sides use the kerb material (keeps today's brick on raised beds); an upstand band `KERBS[style].width` wide and `height` tall on the edge when height > 0; `none` on a flat lawn draws nothing. `SunHours.tsx`: use outlines where it reads surfaces.
6. **Dusk**: `lib/dusk.ts` `duskHour` (search the evening for `DUSK_ALTITUDE` with `lib/sun.ts` `solarPosition` and `sunTimes`, which take UK clock hours) and `lightGlow` (0.15 at ≥ 15°, smooth to 1 at ≤ 0°) + tests (midsummer dusk after 21:00 BST, midwinter before 16:30 GMT at the listing's latitude/longitude, glow monotonic). `SunControls`: a "Dusk" button beside the day chips: `setSun({ enabled: true, hour: duskHour(site, SUN_YEAR, sun.dayOfYear) })`, active when within 10 min of it. `Lighting.tsx`: check that a sun at 1° already reads as dim and warm; if not, warm the key colour and lower sky/hemisphere levels below ~5°. No new `SunState` fields.
7. **Optional, if cheap**: `SiteDiff.tsx` outlines added/removed items in compare like other site pieces.

Acceptance: `npm run check`, `npm run build`; headless Chromium (CLAUDE.md flags) on the dev server: load the built-in listing (`__houseStore.getState()`), mode garden, 3D tab, camera from the rear (`__houseCamera`), screenshots by day and with Dusk; baseline items visible (conifer, buddleia, bin store, washing line, dining set + parasol, recycling box) once Lily's branch is merged in; a festoon and a few plants added through `__houseStore.getState().updateSite`; renderer.info numbers in the report.

## 3. Working in parallel

- Branches/worktrees: `garden-lily`, `garden-charli`, `garden-lorde`, all from the Chunk 0 commit. Symlink the main checkout's `node_modules`.
- Charli and Lorde test with Chunk 0's seeded catalogue and working maths; the baseline items arrive with Lily. Lorde can add items through the dev store to see them. Don't wait on another chunk; don't edit its files to unblock yourself; note the gap in the report.
- Commit trailer for every builder commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Y4SzVYAvtwKK863339S3Rz
  ```
  Commit message ends with the builder's name in brackets, e.g. "Garden: kerbs and curved surfaces in 3D (Lorde)". Do not push.

## 4. Merge order and the merger's checks

1. **Lily** first (data, baseline, preset bump). `npm run check`.
2. **Lorde** (3D reads the library). `npm run check`, `npm run build`; 3D screenshot of the baseline garden by day and at Dusk.
3. **Charli** last (UI on top). Resolve `App.tsx`/`ModePanel.tsx` (Chunk 0 interim lines). `npm run check`, `npm run build`, `scripts/test-garden.cjs`, `scripts/test-touch-plan.cjs`, `scripts/shoot-chassis.cjs`, `npm run regress:editors`.
4. Cross-checks after all three: an old save without `items` loads; Review lists the baseline-to-Proposed garden changes with costs under "Garden"; the listing-update prompt offers the garden group on an edited As listed plot; Plot mode no longer selects surfaces; phone tab bar fits at 360 and 390 px.
5. Docs: README "what it does" gets a Garden mode line; CLAUDE.md code map gains
   - under `src/lib/`: "garden: `gardenCatalogue.ts` (items and plants), `siteItems.ts` (placement, runs, shade), `surfaceCurve.ts` (smooth outlines), `dusk.ts`, `gardenParts.ts` and `plantForms.ts` (3D parts as data)";
   - under `src/three/`: `SiteItems.tsx`;
   - under `src/editor/`: `GardenSymbol.tsx`; site editor serves Plot and Garden;
   - this file, `docs/garden-plan.md`.
   `docs/modes-plan.md`: six modes, Plot vs Garden split. NOTES.md entry from Lily.
6. Push, `npm run build:hosted`, publish as CLAUDE.md says.

## 5. Deferred

Hot tubs, water features, garden offices; a site-plan SVG in the export; selecting items in the 3D view; Class E (outbuildings) check in `planning.ts` for sheds and playhouses; real point lights.
