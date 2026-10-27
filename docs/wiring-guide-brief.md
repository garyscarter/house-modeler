# Wiring guide: brief for the Electrics mode (phase 3 of docs/lighting-plan.md)

Self-contained: read this, then the code map in CLAUDE.md. Ask the owner the open questions at the end in one round, then build.

## Goal

The owner is rewiring listing 91770873. They want to place every electrical point (lights, switches, sockets and the rest) on the plan, link switches to the lights they control, and export a wiring guide the electrician can work from: a marked plan per floor plus a per-room schedule, printable and as CSV.

## What already exists (do not redo)

- Lights are fixtures. `Fixture.on?` (absent = on), `SunState.lights` (Auto / On / Off master) and `src/lib/lights.ts` (`LAMPS` by catalogue symbol, `isLightItem`, `fixtureLit`, `litRooms`) landed in phase 1. Phase 2 adds ceiling and wall lights as catalogue items with `CatalogueItem.ceiling`, `Fixture.drop`, `Fixture.warmth`, `Fixture.dim`, and BS EN 60617 plan symbols for them. Lights carry stable `Fixture.id`s a circuit can reference.
- Fixtures are placed in Furnish with `editor/plan/useDrag.ts` (wall snapping via `snapToWall` for items with `mount`), drawn on the plan by `editor/plan/layers/Fixtures.tsx` and `editor/FixtureSymbol.tsx`, edited in `editor/Inspectors.tsx`, built in 3D by `three/Fixtures.tsx` (parts merged per material).
- Modes: `src/lib/modes.ts` (`Mode`, `MODES`, labels, icons, `PLAN_TOOLS`, `SELECTABLE`, `pruneSelection`); the Garden mode (docs/garden-plan.md) is the model for adding a mode with its own panel and plan layer.
- Export: `src/lib/export.ts` `planSvg(model, floor, opts)` draws a per-floor plan to scale with a title block; `printHtml` composes the printable report; `toCsv`, `downloadBlob`. `src/lib/report.ts` has `COST_LINES` and `diffModels` for the Review changes and costs.

## Scope

1. **Electrics mode** (`"electrics"` in `Mode`, after Furnish, label "Electrics", subtitle "Lights, switches, sockets and circuits", a plug icon). On the plan it shows every floor's electrical points over a muted plan; the Furnish furniture stays visible but greyed. Tools: select, measure, place. It can select fixtures that are electrical points (lights included) and nothing else.
2. **Electrical points** as catalogue items in a new category, wall-mounted (`mount`, snap to walls) unless noted, each with a UK electrical symbol:
   - light switch: 1-gang, 2-gang, 2-way, dimmer; pull cord (bathroom)
   - socket: single, double, double with USB, floor socket, outside socket (IP66), fused spur, cooker switch and cooker outlet, shaver socket
   - fixed appliances and points: extractor fan, electric shower point, boiler and heating controls (thermostat), doorbell push and chime, smoke and heat alarms (ceiling), CO alarm, TV point, data (Ethernet) point, EV charger (outside), outside light (uses phase 2's wall light with an outdoor flag)
   - consumer unit (fuse board)
   Standard UK mounting heights as defaults (sockets 450 mm to centre, switches 1200 mm, cooker switch 1200 mm), editable per point.
3. **Circuits**: `HouseModel.circuits?: Circuit[]` with `{ id, name, kind: "lighting" | "ring" | "radial" | "cooker" | "shower" | "ev" | "other", points: string[] }` (fixture ids across floors) and a `Fixture.controls?: string[]` on switches naming the light fixture ids they switch. In 3D, a switch with `on` false darkens its lights (extend `fixtureLit`: lit = own switch on AND every controlling switch on AND master). Inspector: pick a switch, then click lights to link; a circuit list panel in the mode panel with add / rename / assign.
4. **Wiring guide export** (a button in the Electrics panel and in Review): a printable HTML (via `printHtml` or a sibling) with, per floor, `planSvg` plus an electrical layer (points with their symbols, numbered; switch-to-light links as dashed arcs; a legend), then a per-room schedule table: room, point type, count, mounting height, circuit, notes; a totals table by point type; and a CSV of the schedule. The point symbol legend is the BS EN 60617 set used on the plan.
5. **Costs**: an "electrical works" cost line in `COST_LINES` with counts of new points from `diffModels`, so Review's estimate includes the rewiring.

## Files to touch (expected)

`src/lib/modes.ts`, `src/lib/catalogue.ts` (category Electrics + symbols), `src/lib/lights.ts` (switch control), new `src/lib/electrics.ts` (+ tests: schedule rows, totals, circuit validation, numbering), `src/lib/export.ts` (electrical layer, `wiringGuideHtml`, `scheduleCsv`), `src/lib/report.ts`, `src/types.ts`, `src/editor/FixtureSymbol.tsx`, `src/editor/plan/layers/` (new `Electrics.tsx`), `src/editor/Inspectors.tsx`, `src/components/` (new `ElectricsPanel.tsx`, `ModePanel.tsx`, icons), `src/three/Fixtures.tsx` (small parts for switches and sockets), `src/components/mobile/` (tab bar gets the mode).

## Acceptance checks

- `npm run check` and `npm run build` pass; new lib code has tests.
- Placing a double socket snaps it to a wall at 0.45 m; a 1-gang switch at 1.2 m beside a door.
- Linking a switch to two lights and switching it off darkens both in 3D at the Night preset.
- The exported guide for the listing shows both floors to scale with numbered points, a legend and a schedule whose counts match the plan; the CSV opens in a spreadsheet with one row per point.
- Desktop unchanged outside the new mode; phone and tablet tab bars show the mode (`scripts/shoot-chassis.cjs`).

## Open questions for the owner (ask once, with recommendations)

1. Numbering: per floor (G1, G2, F1 ...) or per room (Kitchen S1, S2 ...)? Recommend per room: that is how an electrician walks the job.
2. Circuits in the first cut, or just switch-to-light links? Recommend links first, circuits behind a "group into circuits" step, since the electrician will design circuits anyway.
3. Should the guide also mark removed points (the existing wiring to strip out)? Recommend yes if the "As listed" layout gets points too; otherwise no.
4. Export format beyond print and CSV: a DXF for the electrician's CAD? Recommend no for now.

## Coordination

The lighting thread (phases 1 and 2) owns `src/three/Lighting.tsx`, `src/three/House.tsx`, `src/three/shell.ts`, `src/three/textures.ts`, `src/components/SunControls.tsx` and the lamp parts of `src/three/Fixtures.tsx` and `src/lib/lights.ts`. Add beside its code, keep its exports, and merge `main` before starting the catalogue and inspector work, which both threads touch.
