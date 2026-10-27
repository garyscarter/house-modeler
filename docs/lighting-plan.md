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
| `src/lib/lights.ts` | `LAMPS` (light fittings by catalogue symbol: lumens, colour, bulb position, reach), `isLightItem`, `fixtureLit`, `lightsOn`, `lampGlow`, `candela`, `LIGHT_CAP`, `pickLights`, `litRooms` | |
| `src/lib/dusk.ts` | `NIGHT_PRESET_ALTITUDE` (-8°), `nightHour` | |

Rules: a light is lit when `fixtureLit(fx, item, master, altitude)`; `altitude` is the sun study's altitude or null when the study is off. Old saves need no migration.

## Phase 1: night and switches

- **Sun panel** (`components/SunControls.tsx`): a Night preset beside Dusk (`nightHour`); the time slider runs from sunrise to the night hour so the evening is scrubbable; a Lights segmented control Auto / On / Off writing `sun.lights`.
- **Inspector** (`editor/Inspectors.tsx`): a Switched on toggle for light fixtures.
- **3D** (`three/Fixtures.tsx`): lit lamps get a point light at `LAMPS[symbol].bulb(box)` with intensity `candela(lumens)`, `decay 2`, `distance reach`, no shadows, capped with `pickLights` by camera distance; shades and bulbs use `lampGlow` for their emissive. Unlit lamps have no glow.
- **Night interior** (`three/Lighting.tsx`, `three/House.tsx`): below `NIGHT_ALTITUDE` the environment intensity drops to near nothing and room ceilings lose their emissive, so an unlit room is dark; the moon fill stays so the house is still readable.
- **Windows** (`three/shell.ts`, `three/textures.ts`): glass gets a `lit` variant; panes in a lit room (`litRooms`) glow at night, others stay dark.

Checks: `npm run check`; Playwright screenshots of the listing at the Night preset with lights Auto, On and Off, and one lamp switched off.

## Phase 2: ceiling and wall lights

Built with phase 3 (see `docs/electrics-plan.md`); the notes below are the intent.

- Catalogue: a Lighting category with the seven types; `CatalogueItem.ceiling?: boolean` (hangs from the ceiling: `z0 = ceiling - drop - h`), `Fixture.drop?` for pendants, `Fixture.warmth?: 2700 | 3000 | 4000`, `Fixture.dim?: number` (percent, default 100). `LAMPS` gains the new symbols, with `spot?: { angle, penumbra }` for downlights and spot bars (spot lights aiming down).
- Downlight grids as one fixture with `cols`/`rows` and pitch; each bulb a light, all sharing the fixture's switch.
- Plan symbols: BS EN 60617 style (circle with cross for a ceiling point, filled circle for a downlight, etc.) in `editor/FixtureSymbol.tsx`.
- 3D parts in `three/Fixtures.tsx`; inspector fields for drop, warmth and dimmer.

## Phase 3: electrics mode and wiring guide

The brief is `docs/wiring-guide-brief.md`; the implementation plan, which also covers phase 2 and phase 1's 3D, is `docs/electrics-plan.md`.
