# Electrics mode and wiring guide: implementation plan

Planner: Lady Gaga. Builders: Dua Lipa (schedule, guide, costs), Sia (symbols, catalogue, lights lib, inspector), Ellie Goulding (3D lights and night), Janet Jackson (Electrics mode UI). Merger: the lead session.
Sources: `docs/wiring-guide-brief.md` (phase 3), `docs/lighting-plan.md` (phases 1 and 2; decisions 1-9 settled). This work folds in phase 2 and phase 1's 3D. House = "listing 91770873"; no address, postcode, title number or owner names anywhere.

Owner's decisions (settled, do not reopen):
1. Phase 2 and phase 1's 3D are part of this work: seven ceiling and wall light types with BS EN 60617 plan symbols, `CatalogueItem.ceiling`, `Fixture.drop/warmth/dim`, LAMPS with spots; lit lights are real three.js point/spot lights capped by `pickLights`, with glowing shades; at night (below the night altitude) unlit rooms go dark and window glass glows only for `litRooms`. A downlight grid is one fixture (cols, rows, pitch), each bulb a light sharing the switch.
2. Numbering per room, a prefix per point kind, restarting in each room (L1.., SW1.., S1..). Points outside every room go under **Outside** (see section 3).
3. Links first, circuits light: `Fixture.controls` on switches is the main interaction; `HouseModel.circuits` with a simple list (add, rename, delete, assign). No validation beyond dropping dangling ids. `fixtureLit`: own switch on AND every controlling switch on AND master.
4. The guide shows new (proposed) points only; no removed-points marking.

## 0. What Chunk 0 landed (commit "Electrics plan: shared types, catalogue, lib contracts and the Electrics mode entry (Lady Gaga)")

Every builder starts from this commit. These names are the contract: do not rename or change their signatures; add beside them. Catalogue ids are saved data: never rename.

| File | What is there |
|---|---|
| `src/types.ts` | `Fixture.controls?`, `drop?`, `warmth?: LightWarmth`, `dim?`, `cols?`, `rows?`, `pitch?`; `LightWarmth = 2700 \| 3000 \| 4000`; `CircuitKind`; `Circuit { id, name, kind, points }`; `HouseModel.circuits?` |
| `src/lib/catalogue.ts` | `CatalogueItem.ceiling?`, `drop?`, `outdoor?`, `grid?: { cols, rows, pitch }`; 34 new `Symbol` members; 9 `Lighting` + 26 `Electrics` entries (section 2); `LIGHTING`, `ELECTRICS`, `PickerScope`, `SCOPE_CATEGORIES`, `isFittedLight`, `isElectricalItem`, `gridOf`, `dropOf`, `DOWNLIGHT_D`; `filterCatalogue(query, category, extra, scope = "furnish")` (Furnish never lists Electrics) |
| `src/lib/planMath.ts` | `fixtureBox`: ceiling items' `z0 = ceiling - drop - h` (ceiling defaults to `CEILING_FALLBACK` 2.4 when not given); a grid's w and d from its bulbs |
| `src/lib/lights.ts` | `LampDef.spot?`; LAMPS for `pendant pendant-multi ceiling-flush downlight downlight-grid spot-bar wall-light strip-light` (lumens per bulb); `WARMTH_COLOR`, `WARMTHS`, `WARMTH_LABEL`; `lampBulbs(fx, item, box)`; `lampOutput(fx, item)`; `fixtureLit(fx, item, master, altitude, controllers = [])` |
| `src/lib/electrics.ts` | working: `PointKind`, `POINT_KINDS`, `POINT_PREFIX`, `POINT_KIND_LABEL`, `pointKind`, `isSwitchItem`, `isElectricalFixture`, `pointQuantity`, `centreHeight`, `mountForCentre`, `isWallPoint`, `glyphOffset`, `OUTSIDE`, `ROOM_REACH`, `RoomRef`, `roomOf`, `Point`, `pointsOf`, `NumberedPoint`, `numberPoints`, `controlIndex`, `controllersOf`, `toggleLink`, `Link`, `links`, `pruneLinks`, `CIRCUIT_KINDS`, `CIRCUIT_KIND_LABEL`, `addCircuit`, `renameCircuit`, `setCircuitKind`, `deleteCircuit`, `assignToCircuit`, `circuitOf`, `pruneCircuits`. Stubs (return []): `pointRows`, `scheduleRows`, `totals` with types `PointRow`, `ScheduleRow`, `TotalRow` |
| `src/lib/electricSymbols.ts` | `SymPrim`, `ELECTRIC_GLYPH_M` (0.25 m), `GLYPH_MM` (3.5), `ELECTRIC_SYMBOLS`, `hasElectricSymbol`, `electricSymbol(symbol)` (placeholder: circle + letter), `glyphSvg(symbol, cx, cy, size, { rot, ink, stroke })` |
| `src/editor/ElectricGlyph.tsx` | `ElectricGlyph({ symbol, size, stroke, ink?, paper? })`: renders `electricSymbol` prims (working) |
| `src/lib/export.ts` | `PlanSvgOptions.overlay?: (frame: PlanFrame) => string` (inserted above room labels, below north arrow and title block); `PlanFrame { scale, k, x(p), y(p), width, height }` |
| `src/lib/wiringGuide.ts` | `WiringGuideInput`, `electricalLayerSvg(model, floor, numbered, frame)` (stub ""), `wiringGuideHtml(input)` (stub page), `scheduleCsv(model)` (header + `pointRows`) |
| `src/components/wiringGuideExport.ts` | `exportWiringGuide(kind: "html" \| "csv"): Promise<string \| void>`: picks Proposed (else the active layout), names `${prefix}-wiring-guide-${date}.html/.csv` (working, plain) |
| `src/lib/report.ts` | `ChangeCategory` + `"Electrics"`; `CostLineId` + `"electricalWorks"`; COST_LINES `{ electricalWorks, "Electrical works (per new point)", each, example 120 }`; `electricalChanges(fa, fb)` (stub []) already called in `diffModels` after joinery |
| `src/lib/modes.ts` | `"electrics"` in `Mode`/`MODES` after furnish; label "Electrics", icon `plug`, subtitle "Lights, switches, sockets and circuits"; `PLAN_TOOLS.electrics = ["select","measure","place"]` (place is armed by Add, never a rail button); `SELECTABLE.electrics = ["fixture"]`; `editsFixtures(mode)` (furnish or electrics); `ModeUi.linkSwitchId?`, cleared by `modeSwitchPatch` |
| `src/store.ts` | `linkSwitchId: string \| null` (UI only, not persisted, in `setUi`, cleared by reset and mode switch) |
| `src/components/icons.tsx` | `plug` |
| interim wiring | `AddItem.tsx`: `AddPopover`/`CataloguePicker` take `scope` (default furnish; Electrics has no "Mine"); `MyFurniture.tsx` "Draws as" uses `SCOPE_CATEGORIES.furnish`; `ModePanel`: electrics shows one muted line (placeholder); `scripts/shoot-chassis.cjs` shoots `plan-electrics`; TabBar comment says seven |
| tests | `electrics.test.ts`, `electricSymbols.test.ts`, `wiringGuide.test.ts`; additions in `catalogue.test.ts`, `lights.test.ts`, `planMath.test.ts`, `modes.test.ts` |

What Chunk 0 did **not** do (the builders' seams): PlanEditor and its hooks still treat electrics like a view-only mode (no Add button, fixtures greyed, inspector falls to the Build branch); FixtureSymbol draws the new symbols as boxes (its `default:`); nothing in `src/three` uses the new fields.

## 1. Data model

All fields optional: old saves, synced projects and imports load unchanged. **No `PERSIST_VERSION` bump, no migration.** Readers treat absent as the default.

| Where | Field | Default when absent | Read by |
|---|---|---|---|
| `Fixture` | `on` (phase 1) | on | lights.ts `switchedOn`; switches use it too (a switch with `on: false` darkens what it controls) |
| `Fixture` | `controls: string[]` | none | electrics.ts `controlIndex`/`links`; 3D lit test; plan links layer; guide arcs and notes |
| `Fixture` | `drop` | `item.drop ?? 0` (`dropOf`) | planMath `fixtureBox` (z0), 3D flex length, inspector |
| `Fixture` | `warmth` | 2700 | `lampOutput` colour; inspector |
| `Fixture` | `dim` (1-100) | 100 | `lampOutput` lumens; inspector |
| `Fixture` | `cols`, `rows`, `pitch` | `item.grid` (`gridOf`, clamped 1-12, 0.2-3 m) | `fixtureBox` footprint, `lampBulbs`, `pointQuantity`, plan/print symbols per bulb |
| `Fixture` | `mount` (existing) | `item.mount` | **base height** as for all items. Wall points' catalogue mounts are set so the **centre** is at the UK height; the Electrics inspector and the guide show the centre (`centreHeight`), and write back with `mountForCentre` |
| `CatalogueItem` | `ceiling` | false | `fixtureBox` (`z0 = ceiling - drop - h`, mount ignored); placement (no wall snap) |
| `CatalogueItem` | `drop`, `grid` | 0, none | as above |
| `CatalogueItem` | `outdoor` | false | `roomOf` (always Outside), guide notes "Outdoor" |
| `HouseModel` | `circuits: Circuit[]` | `[]` | ElectricsPanel list, inspector circuit field, guide circuit column (blank when unassigned) |
| `Circuit.points` | fixture ids across floors | | a point is on at most one circuit (`assignToCircuit` enforces) |

Rules everyone follows:
- A fixture is an **electrical point** iff `isElectricalItem(item)` (category Lighting or Electrics). Plug-in lamps (floor, table, desk lamps, lit mirror) are lights (LAMPS) but not points: they stay furniture, keep their furniture symbols and are not numbered.
- A light is lit when `fixtureLit(fx, item, master, altitude, controllersOf(model, fx.id))`. Compute `controlIndex(model)` once per model change, not per fixture.
- Links may cross floors (a 2-way switch on the landing controls the hall light). Dangling ids are harmless: every reader goes through `links`/`controlIndex` lookups. Janet prunes after deletes (section 8).
- `types.ts` is **owned by Dua Lipa** after Chunk 0 (append-only, optional fields). Others ask in their report if they need a field.

## 2. Catalogue (landed; Sia may polish sizes, colours and notes, never ids or symbols)

Plate sizes: single 86 × 86 mm, double 146 × 86 mm. `mount` = centre - h/2. Symbols are drawn in a unit square, wall side at the top (local -y), y down; fixed size `ELECTRIC_GLYPH_M` (0.25 m) on the plan and `GLYPH_MM` (3.5 mm) in print. Strip lights and downlight grids are drawn at their real length/bulb positions.

| id | name | cat | w × d × h m | mount / place | symbol | drawing (BS EN 60617 style) |
|---|---|---|---|---|---|---|
| light-pendant | Pendant (single) | Lighting | .30 × .30 × .25 | ceiling, drop .55 | pendant | circle with a diagonal cross (lighting outlet), small dot at centre (rose) |
| light-pendant-3 | Pendant cluster (3 drops) | Lighting | .90 × .25 × .20 | ceiling, drop .7 | pendant-multi | three small crossed circles on a horizontal line |
| light-flush | Flush ceiling light | Lighting | .35 × .35 × .10 | ceiling | ceiling-flush | crossed circle inside a second concentric circle |
| light-downlight | Downlight (recessed) | Lighting | .09 × .09 × .02 | ceiling | downlight | filled disc inside an open ring (recessed luminaire) |
| light-downlight-grid | Downlights (grid) | Lighting | grid 3 × 2 @ 1.0 | ceiling | downlight-grid | the downlight glyph at every bulb (`lampBulbs`), legend shows one |
| light-spot-bar | Spotlight bar (3 heads) | Lighting | .75 × .08 × .15 | ceiling | spot-bar | horizontal bar with three small circles each with a centre dot |
| light-wall | Wall light | Lighting | .15 × .12 × .20 | centre 1.8 | wall-light | crossed circle on a short stem from the wall line |
| light-outside | Outside wall light | Lighting | .12 × .12 × .22 | centre 1.9, outdoor | wall-light | as wall light (legend row says "outdoor, IP44") |
| light-strip | Under-cabinet LED strip | Lighting | .60 × .03 × .01 | base 1.44 | strip-light | long thin rectangle at real length with short end ticks (linear luminaire) |
| switch-1g | Light switch (1-gang) | Electrics | .086 × .03 × .086 | centre 1.2 | switch-1g | small filled circle, one stroke rising at 45° with a short end tick |
| switch-2g | Light switch (2-gang) | Electrics | .146 × .03 × .086 | centre 1.2 | switch-2g | as 1-gang with two parallel ticks |
| switch-2way | Light switch (2-way) | Electrics | .086 × .03 × .086 | centre 1.2 | switch-2way | filled circle, stroke through both ways with a tick at each end |
| switch-dimmer | Dimmer switch | Electrics | .086 × .035 × .086 | centre 1.2 | switch-dimmer | 1-gang with an arrow crossing the stroke |
| switch-pull-cord | Pull-cord switch | Electrics | .06 × .06 × .05 | ceiling | switch-pull | 1-gang with a small open circle at the stroke's end |
| socket-single | Socket (single) | Electrics | .086 × .035 × .086 | centre .45 | socket-1 | semicircle, flat side on the wall, one stroke out from the arc |
| socket-double | Socket (double) | Electrics | .146 × .035 × .086 | centre .45 | socket-2 | semicircle with two strokes |
| socket-double-usb | Socket (double, USB) | Electrics | .146 × .04 × .086 | centre .45 | socket-usb | double socket with "USB" under it |
| socket-floor | Floor socket | Electrics | .15 × .15 × .02 | floor | socket-floor | socket symbol inside a square |
| socket-outdoor | Outside socket (IP66) | Electrics | .12 × .07 × .15 | centre .45, outdoor | socket-outdoor | filled semicircle with one stroke and "IP" |
| shaver-socket | Shaver socket | Electrics | .146 × .05 × .086 | centre 1.3 | shaver-socket | semicircle with two interlocking small circles (isolating transformer) |
| fused-spur | Fused spur (FCU) | Electrics | .086 × .035 × .086 | centre 1.1 | fused-spur | square with a small fuse rectangle on a line through it |
| cooker-switch | Cooker switch (45 A) | Electrics | .146 × .04 × .146 | centre 1.2 | cooker-switch | square with a diagonal switch stroke and "C" |
| cooker-outlet | Cooker outlet | Electrics | .086 × .035 × .086 | centre .45 | cooker-outlet | square with "CCU" |
| shower-point | Electric shower | Electrics | .32 × .10 × .45 | centre 1.55 | shower-point | rectangle with "ES" |
| extractor-fan | Extractor fan | Electrics | .15 × .10 × .15 | centre 2.1 | extractor-fan | circle with two curved blades |
| thermostat | Heating thermostat | Electrics | .086 × .025 × .086 | centre 1.5 | thermostat | square with "θ" |
| doorbell-push | Doorbell push | Electrics | .04 × .025 × .09 | centre 1.4, outdoor | bell-push | small circle with a centre dot (push button) |
| doorbell-chime | Doorbell chime | Electrics | .15 × .05 × .10 | centre 2.0 | bell-chime | bell: dome on a flat base line |
| smoke-alarm | Smoke alarm (mains) | Electrics | .12 × .12 × .05 | ceiling | smoke-alarm | circle with "S" |
| heat-alarm | Heat alarm (mains) | Electrics | .12 × .12 × .05 | ceiling | heat-alarm | circle with "H" |
| co-alarm | Carbon monoxide alarm | Electrics | .10 × .04 × .12 | centre 1.5 | co-alarm | circle with "CO" |
| tv-point | TV aerial point | Electrics | .086 × .035 × .086 | centre .45 | tv-point | square with "TV" |
| data-point | Data point (Ethernet) | Electrics | .086 × .035 × .086 | centre .45 | data-point | square with "D" |
| ev-charger | EV charger (7 kW) | Electrics | .25 × .12 × .35 | centre 1.0, outdoor | ev-charger | rectangle with "EV" |
| consumer-unit | Consumer unit | Electrics | .40 × .12 × .30 | centre 1.5 | consumer-unit | rectangle split by a diagonal, one half filled |

Pickers: Furnish offers every category except Electrics (Lighting included); Electrics offers Lighting and Electrics (`SCOPE_CATEGORIES`).

## 3. Numbering

- `numberPoints(model)`: floors by level; rooms in `floor.rooms` order, then **Outside**; kinds in `POINT_KINDS` order (board, light, switch, socket, connection, appliance, alarm, data); within a room and kind, reading order (0.5 m rows from the top of the plan, then left to right, ties by id). Numbers restart per room and kind.
- Prefixes: L lights, SW switches, S sockets (incl. floor, outdoor, shaver), C spurs and isolators (fused spur, cooker switch, cooker outlet), P fixed appliances (shower, fan, thermostat, bell push and chime, EV charger), A alarms, D TV and data, CU consumer unit.
- Room: the topmost room containing the centre; else the nearest room edge within `ROOM_REACH` (0.35 m: a point in a wall's thickness); else Outside (one Outside group per floor). Outdoor items are always Outside. A point is named "Kitchen S2" (room + label); the guide prints the label beside the symbol and the room in the schedule.
- A downlight grid is **one** numbered point with quantity cols × rows (counts and costs use the quantity; the CSV row carries it).

## 4. lib/electrics.ts: what is left (Dua Lipa)

Landed functions are listed in section 0. Dua implements, with tests:
- `pointRows(model, numbered = numberPoints(model)): PointRow[]`: one row per numbered point, in numbering order. `floor` = `floor.name`; `room` = room name; `label`; `kind`; `type` = item name; `quantity` = `pointQuantity`; `height` = `"Ceiling"` for ceiling items, `"Floor"` for the floor socket, else `${Math.round(centreHeight * 1000)} mm`; `circuit` = `circuitOf(model.circuits, id)?.name ?? ""`; `notes` = joined with "; ": `fx.label`, `"Outdoor"` if `item.outdoor`, for a switch "Switches L1, L2" (labels of its linked lights; prefix the room for a light in another room, and the floor for another floor), for a light "On SW1" (its switches, same rule), for a grid "3 × 2 at 1.0 m", for a dimmable light with `dim` < 100 nothing (it is a scene setting, not wiring).
- `scheduleRows(rows)`: group consecutive rows by floor + room + type + height + circuit; `count` = sum of quantity; `labels` = "S1–S4" for a run of consecutive numbers, else comma list; `notes` = unique notes joined.
- `totals(rows)`: one row per catalogue type with summed quantity, ordered by `POINT_KINDS` then name.
Tests: the Chunk 0 test model (or a new one) gives exact rows; a grid counts 6; a cross-floor link note; the height strings; schedule labels "S1–S2".

## 5. Wiring guide export (Dua Lipa)

- `electricalLayerSvg(model, floor, numbered, frame)`: for each numbered point on `floor`: symbol via `glyphSvg(symbol, x, y, GLYPH_MM, { rot: fx.rot })` at `frame.x/y(toWorld(floor, fx) + glyphOffset(fx, item, GLYPH_MM / frame.k))`; grids and strips: one downlight glyph per `lampBulbs` position (local x, z → plan local x, y, rotated by `rot`) and the strip as a line at its real length; the label (e.g. "S2") in 2 mm text beside the symbol, away from the wall; links on this floor as dashed quadratic arcs (`stroke-dasharray="1 0.8"`, bowed 20% of their length to one side) from the switch symbol to each light symbol; a cross-floor link as a short dashed stub with "to First floor L1". Ink `#1f2937`, links in the brand teal (`BRAND_TEAL`).
- `wiringGuideHtml(p)`: printHtml's look (copy its header, `@page`, table CSS and footer; do not refactor printHtml): heading "Wiring guide", eyebrow date, the layout name, a note "New points only. Heights are to the centre of the plate. Check every position on site with the electrician." Then per floor (by level) `planSvg(model, floor, { variant, date, site, extent: planExtent([model]), scale: planScale(extent), title: "Wiring guide", overlay: (f) => electricalLayerSvg(model, floor, numbered, f) })` in a `section.plan`; then the **legend**: one row per symbol used anywhere in the model (glyph + catalogue name, grouped by `POINT_KIND_LABEL`); the **schedule** table per floor and room (Room, Point, Type, Count, Height, Circuit, Notes); the **totals** table (Type, Count) with a grand total; a circuits table when `model.circuits?.length` (name, kind, points' labels). Empty model: one muted paragraph "No electrical points yet: place them in Electrics mode."
- `scheduleCsv(model)`: landed shape; header `Floor,Room,Point,Type,Quantity,Height,Circuit,Notes`, one row per point (`pointRows`). The BOM is added by the caller.
- `components/wiringGuideExport.ts`: keep the signature; open a print window like ReportPanel's `print` (open the window in the click, fall back to a download when blocked), embed the report font (move `reportFontCss` from ReportPanel.tsx into this file and import it back).
- Tests (`wiringGuide.test.ts`): a listing model with points added programmatically (both floors: a socket, a switch linked to two pendants, a grid, an outdoor light) gives one `<svg` per floor, each label once in the right floor's svg, a legend row per used symbol and none for unused, schedule counts equal to `pointRows` quantities summed, CSV line count = points + 1, cross-floor stub text present. `export.test.ts`: `overlay` output appears inside the svg before the title block.
- The listing's built-in models get **no** seeded points (the owner places them); tests add their own.

## 6. Lighting in 3D (Ellie Goulding)

- **Parts** (`three/Fixtures.tsx` `fixtureParts`): pendant (flex: thin dark cylinder from the fitting top up `drop` to the ceiling; drum or cone shade; bulb), cluster (three of them across w), flush (disc + diffuser), downlight (thin bezel ring + diffuser disc per bulb), spot bar (bar + three tilted heads), wall light (back plate + shade), strip (thin bar + diffuser), and small parts for every Electrics symbol (faceplate box in `item.color`, rockers/socket holes as tiny darker boxes, alarms as discs, consumer unit a box with a lid line, EV charger a box with a cable stub). Pass the fixture (or its `drop`, grid and bulbs) into `fixtureParts`; it is private, change its signature freely. Glowing parts (shade inside, diffuser, bulb) use the `glow` finish only when lit; unlit they are matt white/the shade colour.
- **Lit state**: `House.tsx` computes once per model + sun change `const idx = controlIndex(model)`, `master = lightsMaster(sun)`, `altitude` (null when the study is off, from `useSunInfo`), and passes `lit: (fx) => fixtureLit(fx, item, master, altitude, idx.get(fx.id) ?? [])` to `Fixtures`. Toggling a switch must rebuild only the glow materials/meshes, not every fixture: build glow parts into their own merged mesh(es) keyed by lit state, or put lit and unlit glow on separate materials and swap.
- **Real lights** (new `three/FixtureLights.tsx`, mounted by `House.tsx` for the viewed floors): every lit light's `lampBulbs` in world space (`toWorld`, `z0` from `fixtureBox(fx, item, ceiling)`, rotation `-rot` about +y as Fixtures does, plus the floor's base y), with `lampOutput` → `intensity = candela(lumens)`, `color`, `distance = reach`, `decay = 2`, no shadows; `spot` lamps are SpotLights aimed straight down (target 1 m below) with `angle`/`penumbra`. Cap with `pickLights(bulbs, cameraPos, LIGHT_CAP[quality])`, re-picked when the camera stops (controls `end`) or every 500 ms while moving, not per frame. **Keep a fixed pool** of `LIGHT_CAP` point lights and `LIGHT_CAP` spot lights mounted all the time with intensity 0 when unused, so three.js never recompiles shaders when the count changes. Grid bulbs count individually against the cap.
- **Night interior** (`Lighting.tsx`, `House.tsx`): below `NIGHT_ALTITUDE` (-4°) the environment intensity drops to ~0.03 and the hemisphere fill to ~0.05; the moon fill stays. `RoomCeiling`'s emissive (0.35 today) goes to 0 at night so an unlit room is dark; lit rooms read from the real lights.
- **Lit glass** (`shell.ts`, `textures.ts`): today `setGlassMode(high, lit)` lights every pane at night. Add a lit variant: `glassMaterial(color, { lit: true })` that glows at night and a plain one that stays dark; panes of openings whose room is in `litRooms(floor, lit)` use the lit variant. New pure helper `lib/nightGlass.ts` `openingRoom(floor, opening): string | undefined` (the room whose polygon edge lies within 0.25 m of the opening centre and whose interior is on the inside; tests). Toggling a light swaps materials on the glass meshes, never rebuilds wall geometry (group glass per room).
- **Dev hook** (`Viewer.tsx`, dev only): `window.__houseLights = () => ({ point: n, spot: n, active: n })` so scripts can check lights without reading pixels.
- Budget: the listing with 30 lights at Night stays above 30 fps on the balanced setting in headless swiftshader (report `renderer.info.render.calls`); rebuild on a switch toggle < 20 ms.

## 7. Costs (Dua Lipa)

`report.ts` `electricalChanges(fa, fb)`: pair points (fixtures with `isElectricalItem`) by id, then unmatched by same type within 0.3 m (as `joineryChanges`). Group per room (`roomOf` on fb) and catalogue type: new points → `{ key: "elec:new:<roomKey>:<type>", category: "Electrics", description: "New <name, lower case> in the <room>" (+ " × n" when n > 1), quantity: Σ pointQuantity, unit: "each", costLine: "electricalWorks" }`; moved ≥ 0.3 m → same line, "Move …"; removed → info only ("<Name> removed from the <room>", no costLine). Changes to `on`, `dim`, `warmth`, `controls`, circuits: nothing. Tests: As listed (none) → Proposed with 5 points gives quantity 5 on electricalWorks and `estimateCosts` includes it at a rate; a grid of 6 counts 6; a moved socket counts 1; a re-linked switch counts 0.

## 8. Electrics mode UI (Janet Jackson)

- **Mode plumbing**: replace `mode === "furnish"` with `editsFixtures(mode)` where it means "fixtures are placed, picked and moved here": `PlanEditor.tsx` (`furnish` at line 53 and its uses: clearances, FixtureSymbols props, SelectionBox, HoverBox), `useDrag.ts` (marquee ~112, backgroundTap ~141/222, ~465), `useKeys.ts` (36-120: Add `A`, Delete; keep Ctrl+G grouping Furnish-only), `useMenu.ts` (44-103), `planHit.ts` `planTargetAt` (~53), `planKeys.ts` (~42 `a` opens Add), `PlanRail.tsx` (~50: Add button; label "Add point" and `scope="electrics"` in Electrics), `PlanInspector.tsx` (~55: an electrics branch showing Fixture/MultiFixture inspectors for points, else `ElectricsPanel`'s summary), `PlanStatus.tsx` (~88-100 hints). Keep Furnish's behaviour identical.
- **What is selectable** in Electrics: only fixtures with `isElectricalItem`. Hit shapes for points are the glyph square (`ELECTRIC_GLYPH_M`) at `glyphOffset`, so a 86 mm socket is easy to hit; furniture is drawn greyed (opacity 0.35, `pointer-events: none`) by `FixtureSymbols` (give it a `dimmed?: (fx) => boolean`). In Furnish, Electrics-category points are drawn greyed and not hit-testable; Lighting items are normal furniture there.
- **Electrics layer** (new `editor/plan/layers/Electrics.tsx`, memoised like the others): for the floor's points (`pointsOf` + `numberPoints(model)` filtered to the floor), `ElectricGlyph` at size `ELECTRIC_GLYPH_M * ppm` at `fx + glyphOffset(...) * ppm`, rotated by `rot`; grids and strips per bulb/length as in section 5; the number label at 11 screen px (`px * 11`) beside each; selected points in `var(--plan-sel)`; links from each switch on this floor to its lights as dashed arcs (`var(--plan-sel)` when the switch is selected or being linked, else a muted token); a cross-floor link as a stub with "↑ First floor L1". Pointer down on a glyph goes to `h.fixtureDown`.
- **Placing**: `PlanRail` Add in Electrics opens `AddPopover scope="electrics"`; `useDrag` place (~145-160) and `PlanEditor` ghost (~197-202): ceiling items and the floor socket place where clicked (no wall snap); wall items use `snapToWall` (no `abutNeighbours`, no furniture alignment), rotation from the wall; no `mount` written (catalogue default gives 0.45 / 1.2 centres). Moving (~530-550) follows the same rules. Alt places freely as today. Phone: picking places at the view centre (as Furnish does) and selects it.
- **Clashes**: `useGeometry.ts` leaves electrical points out of `clashes`, `misfits` and the `footprints` furniture abuts against (a socket behind a sofa is not a clash; a sofa does not stop at a socket).
- **Linking** (store `linkSwitchId`, set by Sia's inspector "Link lights" button): while set, tapping a light point toggles it with `toggleLink` on the switch, on whichever floor the switch is (find its floor in the model; `updateFloor(variant, floorId, …)`); other taps do nothing; Esc, tapping empty plan or the inspector's Done clears it. Status line: "Linking SW1 (Kitchen): tap lights to switch them, Esc when done". Lights linked to the switch are ringed.
- **Deleting points**: after `removeSelected` removes fixtures, if the model has `controls` or `circuits`, apply `pruneLinks` and `pruneCircuits` through `updateModel` (all modes; a no-op otherwise).
- **ElectricsPanel** (new `components/ElectricsPanel.tsx` + `.css`, shown by `ModePanel` for electrics and by `PlanInspector` when nothing is selected): counts by kind for the floor and the house (`numberPoints`, `POINT_KIND_LABEL`); an Add button (opens the plan picker like Furnish's `onAdd`); **Circuits**: list with name (`NameField`), kind select (`CIRCUIT_KIND_LABEL`), point count, delete; "Add circuit" (kind select + button, `addCircuit(list, kind, uid())`) via `updateModel(variant, { circuits })`; a muted line "Assign points to a circuit in the inspector"; **Wiring guide**: "Wiring guide (print)" and "Schedule (CSV)" buttons calling `exportWiringGuide`, busy state `<Loader kind="lift" size={14} />Preparing…`; a hint "See it at night: Sun panel → Night" when there are lights. CSS tokens only.
- **Modes elsewhere**: `ModeBar` gets the button automatically; check it fits at 1280 px. `commands.ts`: "Electrics" command (keywords electrics, wiring, sockets, switches, lights, circuits); `modeSummary.ts`/`ModeSummaries.tsx` if Furnish has one: an `ElectricsSummary` line ("12 points · 3 circuits").
- **Phone and tablet**: the tab bar shows seven tabs; at 360 and 390 px no label may clip and `scrollWidth <= clientWidth`; if "Electrics" or "Decorate" clips, under `[data-chassis="phone"] .tab-bar button` drop to 10 px and `letter-spacing: -0.01em` (scoped; desktop untouched). The bottom sheet shows the ElectricsPanel; tap selects a point, drag moves it, the link flow works by taps.

## 9. Builders

Every builder: Sonnet, medium effort; own git worktree off the Chunk 0 commit (`elec-dua`, `elec-sia`, `elec-ellie`, `elec-janet`), `node_modules` symlinked from the main checkout. Edit only owned files; read anything. Don't wait on another chunk or edit its files to unblock yourself; note the gap in the report. `npm run check` and `npm run build` must pass before each commit. Commit trailer (message ends with the builder's name in brackets, e.g. "Electrics: wiring guide HTML and CSV (Dua Lipa)"); do not push:
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A6T19d2GJT3Tnt1r9RCGi7
```
UI checks: Playwright in headless Chromium from `/opt/node22/lib/node_modules`, launched with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, against `npm run dev -- --port <n>`; `window.__houseStore` in dev builds (`setMode`, `setUi`, `setSun`, `updateFloor`, `updateModel`).

### Dua Lipa: schedule, wiring guide and costs
Goal: the guide the electrician works from and the Review cost line. Sections 4, 5, 7.
Owns: `src/types.ts`; `src/lib/electrics.ts`, `wiringGuide.ts`, `export.ts`, `report.ts` (each with `.test.ts`); `src/components/wiringGuideExport.ts`, `ReportPanel.tsx`, `ReportPanel.css`.
Leave alone: `src/three/*`, `src/editor/*`, every other component, `store.ts`, `modes.ts`, `catalogue.ts`, `lights.ts`, `electricSymbols.ts` (use `glyphSvg` as it is; Sia fills the drawings).
Tasks: `pointRows`, `scheduleRows`, `totals`; `electricalLayerSvg`, `wiringGuideHtml`, `scheduleCsv` (keep); `electricalChanges`; ReportPanel Exports gets a "Wiring guide" group with "Wiring guide (print)" and "Schedule (CSV)" calling `exportWiringGuide` with the Loader busy state, disabled when the layout has no points; move `reportFontCss` into `wiringGuideExport.ts`.
Checks: tests in section 4, 5, 7; `npm run check`, `npm run build`; a node script (vitest is fine) writes the guide for the listing Proposed with points added to the scratchpad: open it in headless Chromium and screenshot both plan pages and the schedule.

### Sia: symbols, catalogue, lights library and inspector
Goal: every light and point looks right on the plan and in the picker, and can be set up in the inspector. Sections 2, 1.
Owns: `src/lib/electricSymbols.ts`, `catalogue.ts`, `lights.ts` (each with `.test.ts`); `src/editor/ElectricGlyph.tsx`, `FixtureSymbol.tsx`, `Inspectors.tsx`; `src/components/Inspector.css`.
Leave alone: `types.ts` (ask Dua), `electrics.ts` (read only), `src/three/*`, `src/editor/plan/*`, `PlanEditor.tsx`, `AddItem.tsx`, `store.ts`, `modes.ts`.
Tasks:
1. `electricSymbol`: real primitives for all 34 symbols per the drawing column (unit frame, wall at y = -0.5); text sizes ≥ 0.28 so "CO", "EV", "USB" read at 3.5 mm. Test: every prim inside [-0.5, 0.5]² (text by anchor), every symbol differs from every other (JSON), wall symbols touch y = -0.5.
2. `FixtureSymbol.tsx`: for `hasElectricSymbol(item.symbol)` draw `ElectricGlyph` at `max(min(w, d), ELECTRIC_GLYPH_M * m)` centred with `glyphOffset` (in px: × m) so picker thumbnails and Furnish's plan show the symbol; grids: one glyph per `lampBulbs` position at real spacing; strips: the bar at real length. Selected/clash/ghost colours as the existing `outline` rule.
3. `lights.ts`: tune LAMPS values if needed (keep `bulb` inside the box: the existing test), keep every export; nothing else is required.
4. `catalogue.ts`: check sizes, colours and notes against UK products; do not change ids, symbols, categories, `ceiling`, `outdoor`, or the default centre heights (0.45 / 1.2 / 1.2 m are acceptance checks).
5. `Inspectors.tsx` `FixtureInspector`: when `isFittedLight(item)`: Drop (cm, only if `item.drop !== undefined`), Colour temperature (`WARMTHS`/`WARMTH_LABEL` select, absent = 2700), Dimmer (range 10-100 %, absent = 100), and for `item.grid`: Across, Down, Spacing (cm) writing `cols/rows/pitch`. When `pointKind(item)`: the wall-height field becomes "Centre height (m)" for `isWallPoint` items (`centreHeight` / `mountForCentre`, reset link to the catalogue default), hidden for ceiling items; "Switched on" for switches too; for switches a "Lights" list (labels from `numberPoints(model)` of the active layout, each with an unlink ×) and a "Link lights" toggle button setting `useStore.setUi({ linkSwitchId: fixture.id })` / null ("Done"); for every point a Circuit select (none + `model.circuits`) writing `assignToCircuit` via `updateModel(variant, { circuits })`. Add an optional `variant?: VariantKey` prop to `FixtureInspector` and `MultiFixtureInspector` (Janet passes it); without it the circuit field is hidden. `MultiFixtureInspector`: a Circuit select for a selection of points ("Mixed" when they differ).
Checks: `npm run check`, `npm run build`; Playwright desktop: Furnish picker shows Lighting with symbol thumbnails and no Electrics chip; place a pendant and a downlight grid via the store (`updateFloor`), select them (`setUi` + plan click), screenshot the inspector with the new fields; change Across to 4 and see 8 glyphs on the plan.

### Ellie Goulding: 3D lights and the night house
Goal: lit lights light the rooms at night, switched-off ones go dark, windows glow only where a light is on. Section 6.
Owns: `src/three/Fixtures.tsx`, `Lighting.tsx`, `House.tsx`, `shell.ts`, `textures.ts`, `Viewer.tsx` (dev hook only), new `src/three/FixtureLights.tsx`, new `src/lib/nightGlass.ts` (+ `.test.ts`); `src/components/SunControls.tsx` only if a control must change (none expected).
Leave alone: everything in `src/lib` except `nightGlass.ts` (read `lights.ts`, `electrics.ts`, `catalogue.ts`, `planMath.ts`), `src/editor/*`, other components, `store.ts`.
Checks: `npm run check`, `npm run build`; Playwright on the dev server with the listing loaded: add to the Proposed ground floor (via `updateFloor`) two pendants in the living room and a `switch-1g` with `controls` of both, plus a downlight grid in the kitchen; `setSun({ enabled: true, hour: nightHour(site, SUN_YEAR, sun.dayOfYear) (lib/dusk.ts, as the Night preset does), lights: "auto" })`; 3D from the front and the rear (`__houseCamera`): screenshots with the switch on and with it `on: false`; `__houseLights()` shows the active count drop by 2 and the pool size unchanged; living-room windows dark when off, kitchen windows lit; by day the house looks as it does on main (screenshot diff by eye).

### Janet Jackson: the Electrics mode
Goal: place, pick, move and link points on the plan, manage circuits, export the guide, on desktop, tablet and phone. Section 8.
Owns: `src/lib/modes.ts`, `chassis.ts`, `commands.ts`, `planKeys.ts`, `planHit.ts`, `planMath.ts`, `modeSummary.ts` (each with `.test.ts`); `src/store.ts`; `src/App.tsx`; `src/components/ModePanel.tsx`, `ModeBar.tsx`, new `ElectricsPanel.tsx` (+ `.css`), `mobile/*`; `src/editor/PlanEditor.tsx`, `PlanEditor.css`, `editor/plan/**` (hooks, `layers/` incl. new `Electrics.tsx`, `chrome/`), `editor/AddItem.tsx`, `editor/ModeSummaries.tsx`, `editor/MyFurniture.tsx`; `scripts/shoot-chassis.cjs`, `scripts/test-touch-plan.cjs`, new `scripts/test-electrics.cjs`.
Leave alone: `types.ts`, `electrics.ts`, `catalogue.ts`, `lights.ts`, `electricSymbols.ts`, `ElectricGlyph.tsx`, `FixtureSymbol.tsx`, `Inspectors.tsx`, `src/three/*`, Dua's files.
Checks: `npm run check`, `npm run build`, `npm run regress:editors -- --port <n>` unchanged for Build and Furnish; new `scripts/test-electrics.cjs` (desktop 1440 × 900, listing Proposed): mode electrics → plan; Add → picker shows only All/Lighting/Electrics; place `socket-double` by clicking 5 cm off a wall → fixture has no `mount`, `centreHeight` 0.45, back on the wall (rot faces the wall); place `switch-1g` beside a door → 1.2; place two `light-pendant`s mid-room (no wall snap); select the switch, `setUi({ linkSwitchId })` (Sia's button arrives at merge), tap both pendants → `controls` has both; Esc clears; furniture taps select nothing; Delete a pendant → its id leaves `controls`; add a circuit in the panel and see it listed; "Schedule (CSV)" triggers a download named `*-wiring-guide-*.csv`. Phone 390 × 844 and 360 × 780: seven tab labels visible, `scrollWidth <= clientWidth`; tap Add, pick a socket, it lands and is selected. `scripts/shoot-chassis.cjs` shots of the Electrics plan at phone and both iPad sizes.

## 10. Merge order and the lead's checklist

1. **Dua Lipa** (types owner, lib, guide, costs). `npm run check`.
2. **Sia** (symbols and inspector). `npm run check`; Furnish picker thumbnails.
3. **Ellie Goulding** (3D). `npm run check`, `npm run build`; Night screenshots.
4. **Janet Jackson** last (UI on top; resolves the Chunk 0 interim line in `ModePanel.tsx`; wires `variant` into Sia's inspectors in `PlanInspector.tsx`). `npm run check`, `npm run build`, `scripts/test-electrics.cjs`, `scripts/test-touch-plan.cjs`, `scripts/shoot-chassis.cjs`, `npm run regress:editors`.
5. Brief acceptance, end to end on the merged tree: a double socket snaps to a wall at 0.45 m and a 1-gang switch at 1.2 m; link a switch to two lights in the inspector + plan, switch it off, both go dark in 3D at the Night preset; export the guide for the listing with points on both floors: both floors to scale, numbered points, legend, schedule counts equal to the plan; the CSV opens with one row per point; Review's estimate has "Electrical works (per new point)"; desktop unchanged outside the new mode (Build, Decorate, Furnish, Garden, Plot screenshots against main); phone and tablet tab bars show Electrics.
6. Old save without any new field loads; a synced project round-trips `controls` and `circuits`.
7. Docs: README "what it does" gets an Electrics line; CLAUDE.md code map gains `electrics.ts`, `electricSymbols.ts`, `wiringGuide.ts`, `nightGlass.ts` under `src/lib/`, `FixtureLights.tsx` under `src/three/`, `ElectricGlyph.tsx`, `layers/Electrics.tsx`, `ElectricsPanel.tsx`, and this file; `docs/lighting-plan.md` phases 2 and 3 point here.
8. Push, `npm run build:hosted`, publish as CLAUDE.md says.

## 11. Deferred

Removed-points marking (owner: no); DXF export; circuit design checks (load, RCD grouping, ring sizes); auto-suggesting switch positions by doors; placing points in the 3D view; switched sockets controlling lamps; scene presets for dimmers.
