# Lighting: feature plan

Owner's brief (Oct 2026): switch lights, lamps included, on and off to judge the house in the evening and at night; model the kinds of room and ceiling light; later place lights, sockets and switches and export a wiring guide for the electrician. Decisions 1-9 below are settled. House = "listing 91770873"; no address, postcode, title number or owner names anywhere.

## Decisions (settled)

1. Lights live in the Furnish catalogue (a Lighting category) until the Electrics mode arrives in phase 3.
2. Switching is per light plus one master (Auto / On / Off) in the sun study. Room switches come with circuits in phase 3.
3. Real three.js lights are capped: the nearest 12-16 lit lights on the viewed floors are point or spot lights (no shadows); the rest only glow.
4. Each light has a colour temperature (warm 2700K, soft 3000K, cool 4000K) and a dimmer percent.
5. First-cut ceiling and wall types: single pendant, multi-drop pendant, flush ceiling light, recessed downlights (single and grid), spot bar, interior wall light, under-cabinet strip.
6. Ceiling and wall lights use UK electrical drawing symbols on the plan; plug-in lamps keep their furniture symbols.
7. At night ceilings stop glowing and window glass glows only for rooms with a lit light.
8. The wiring guide is a per-floor plan plus a per-room schedule, printable and as CSV.
9. Lighting costs wait for phase 3 (an electrical works line in Review).

## Shared data model (lands with phase 1; phases 2 and 3 add beside it, never rename)

| Where | Field | Default when absent |
|---|---|---|
| `Fixture` (`src/types.ts`) | `on?: boolean` | on |
| `SunState` (`src/store.ts`) | `lights?: LightsMaster` (`"auto" \| "on" \| "off"`) | auto |
| `src/lib/lights.ts` | `LAMPS` (light fittings by catalogue symbol: lumens, colour, bulb position, reach), `isLightItem`, `fixtureLit`, `lightsOn`, `lampGlow`, `candela`, `POOL` (the most lights per quality), `poolFor`, `pickLights`, `assignSlots`, `litRooms` | |
| `src/lib/dusk.ts` | `NIGHT_PRESET_ALTITUDE` (-8°), `nightHour` | |

Rules: a light is lit when `fixtureLit(fx, item, master, altitude)`; `altitude` is the sun study's altitude or null when the study is off. Old saves need no migration.

## Phase 1: night and switches

- **Sun panel** (`components/SunControls.tsx`): a Night preset beside Dusk (`nightHour`); the time slider runs from sunrise to the night hour so the evening is scrubbable; a Lights segmented control Auto / On / Off writing `sun.lights`.
- **Inspector** (`editor/Inspectors.tsx`): a Switched on toggle for light fixtures.
- **3D** (`three/FixtureLights.tsx`): lit lamps get a point light at `LAMPS[symbol].bulb(box)` with intensity `candela(lumens)`, `decay 2`, `distance reach`, no shadows, from a fixed pool of slots (`POOL`, filled nearest the camera by `assignSlots`); shades and bulbs use `lampGlow` for their emissive (`three/Fixtures.tsx`). Unlit lamps have no glow.
- **Night interior** (`three/Lighting.tsx`, `three/House.tsx`): below `NIGHT_ALTITUDE` the environment intensity drops to near nothing and room ceilings lose their emissive, so an unlit room is dark; the moon fill stays so the house is still readable.
- **Windows** (`three/shell.ts`, `three/textures.ts`): glass gets a `lit` variant; panes in a lit room (`litRooms`) glow at night, others stay dark.

Checks: `npm run check`; Playwright screenshots of the listing at the Night preset with lights Auto, On and Off, and one lamp switched off.

## Phase 2: ceiling and wall lights (foundation landed; builders: Dua Lipa for the plan and inspector, Bowie for 3D)

Phase 3 (`docs/electrics-plan.md`) builds on this; the Electrics mode adds the switches that control these lights.

Foundation on main (keep these; add beside them):

| Where | What |
|---|---|
| `src/types.ts` | `Fixture.drop?`, `.warmth?: LightWarmth` (2700 \| 3000 \| 4000), `.dim?` (1-100), `.pitch?`, `.cols?` / `.rows?` (a set count across and down, spread over the grid) |
| `src/lib/catalogue.ts` | `CatalogueItem.ceiling?`, `.drop?`, `.pitch?`; symbols `pendant`, `pendant-multi`, `flush-light`, `downlight`, `downlight-grid`, `spot-bar`, `wall-light`, `strip-light`; category "Lighting" (8 entries); `dropOf`, `pitchOf`, `gridOf` (`GridLayout`: pitch, cols?, rows?), `isCeilingItem`, `DEFAULT_CEILING` |
| `src/lib/planMath.ts` | `fixtureBox`: a ceiling item's `z0 = ceiling - drop - h` (ceiling defaults to 2.4 when not given) |
| `src/lib/lights.ts` | `LampDef.bulbs(box, grid)` (several bulbs per fitting), `.spot` (cone aimed down), `gridPoints`, `gridCounts`; `WARMTHS`, `WARMTH_LABEL`, `WARMTH_COLOR`, `warmthOf`, `dimOf`, `lightColor`, `lampGrid`; `LampLight.spot`; `bulbsWorld`, `floorLamps` (one light per bulb, lumens split, dimmed; bulbs within `CLUSTER_M` of each other merge into one light, `clusterBulbs`); `POOL[quality].casters` (4 shadowed spots on high) |

- **Plan** (`editor/FixtureSymbol.tsx`, `editor/plan/layers/Fixtures.tsx`): BS EN 60617 style symbols. Pendant: circle with a cross through it. Multi-pendant: a bar with three such circles. Flush light: circle with a cross and a filled centre. Downlight: small filled circle in a ring; a grid draws one per `gridPoints`. Spot bar: a bar of three arrows-in-circles. Wall light: a half circle on the wall with a cross. Strip: a thin bar with a dashed centre line. Ceiling items are drawn above furniture, outline only (no filled body), in the plan's ink colour; lamps keep their furniture symbols.
- **Placement** (`editor/plan/useGeometry.ts`, `useDrag.ts`): ceiling items never snap to a wall and never abut neighbours; they place freely (grid snap only).
- **Inspector** (`editor/Inspectors.tsx`): for lights, Warmth (select), Dimmer (range 10-100, shown as %); for ceiling items a Drop field with a reset (in place of Height above floor); for grids a Spacing field. The existing Switched on toggle stays.
- **3D** (`three/Fixtures.tsx`): parts for each new symbol (a flex and shade, a bar with three small shades, a shallow diffuser disc, a recessed ring with a lens, a bar with three tilted heads, a backplate with an up-and-down shade, a slim strip). `LampLights` (`three/FixtureLights.tsx`) fills a fixed pool of `spotLight`s aimed straight down (lights with `spot`) and `pointLight`s; the nearest `POOL[quality].casters` spot lights cast shadows (small maps, 512). Lit parts glow by `lampGlow × dimOf`, in the fixture's light colour.
- **Windows, both sides** (`three/shell.ts`, `three/textures.ts`): the lit-room glow must show only on the pane's face that looks into the lit room from the other side. Shell gives every glass quad a `glow` vertex attribute (1 when the room behind that face, seen from where the face points, is lit; 0 otherwise); the glass shader multiplies its emissive by it. From inside a lit room the window stays dark glass; from outside it glows. The same attribute will carry outside lights (garden) onto the inner face later. The `glass|lit` material variant goes away.

Checks: `npm run check`, `npm run build`; screenshots of the listing with a pendant, a downlight grid and a spot bar at the Night preset from inside and outside; a plan screenshot of the Lighting symbols.

## Phase 3: electrics mode and wiring guide

The brief is `docs/wiring-guide-brief.md`; the implementation plan, which also covers phase 2 and phase 1's 3D, is `docs/electrics-plan.md`.

## Switching lights without a stall

Three bakes the number of point, spot and shadow-casting lights into every lit material's shader, so mounting lamp lights only while they are lit recompiled every material at the switch. Now:

- **A pool sized to the house** (`poolFor`: a slot per lamp bulb the house has, spot or point, capped by `POOL`: 24 lights on high with 4 shadowed spots, 12 on balanced, 8 on low, spots and points sharing the cap by demand): every slot stays mounted, an empty one parked dark; the pool is hidden while no lamp is lit. Every slot is shaded on every pixel, so the size follows the house, not the cap, and changes only when a light fitting is added or removed (then both lamp states compile again, in the background). Slots go to the lights nearest where the view is looking (`focusPoint`: the point at lamp height in the middle of the screen, not the eye, which from above is nearest to every ceiling), and `assignSlots` keeps a lamp in its slot while it stays among the nearest, so orbiting doesn't reshuffle. A fitting's close-set bulbs (a pendant bar, a spot bar, a strip) share one light, so a kitchen's fittings fit the cap.
- **Both lamp states precompiled** (`three/frameLoop.tsx` `Precompile`): after the first frame the other state (pool shown or hidden) is compiled in the background and each new program given its first use a couple per frame; it runs again for materials that appear later and when the pool changes size.
- **Lit and unlit swap materials only**: fixture geometry ignores on, dim and warmth (`lib/fixtureGlow.ts`), and window glass glows by a per-floor room mask (`lib/glassGlow.ts`), so neither the fixtures nor the shell are rebuilt.

