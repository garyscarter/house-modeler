import type { GardenItem, Site } from "../types";
import { gardenDef, itemSize } from "./gardenCatalogue";
import { lightGlow } from "./dusk";
import { candela, clusterBulbs, lightsOn, type LampLight, type LightsMaster } from "./lights";
import { alongEvery, festoonCurve, groundHeightAt, itemsOf, runLength } from "./siteItems";

/**
 * Real light from the garden's lights (festoons, bollards, wall lights) as
 * lamp lights (lib/lights.ts LampLight), so they share the house's pool of
 * real lights (three/FixtureLights.tsx LampLights) and compete for its slots
 * by distance to where the view looks. All point lights, never spots.
 * World metres: x right, y up, z = plan y; `groundY` is the 3D view's ground level.
 */

/** Light output per bulb (festoons) or per fitting, lumens. */
const LUMENS = { festoon: 120, festoonWarm: 150, bollard: 300, wall: 600 } as const;
/** How far each kind of garden light reaches, metres. */
const REACH = { festoon: 7, bollard: 3.5, wall: 6 } as const;
/** Festoons shorter than this get one light at the middle of their bulbs; longer ones two (clusterBulbs over a third of the span). */
const FESTOON_SPLIT = 3;
/** Festoon bulbs hang this far below the wire (as SiteItems.tsx draws them). */
const BULB_DROP = 0.06;
/** A wall light's source stands this far out from the face of its fitting. */
const WALL_STANDOFF = 0.12;
const DEFAULT_GLOW = "#ffd9a0";

/** A garden light's sources before the night level: position, colour, candela, reach (LampLight without the dimming). */
export function gardenSources(site: Pick<Site, "items" | "surfaces">, groundY = 0): LampLight[] {
  const out: LampLight[] = [];
  for (const item of itemsOf(site)) {
    const def = gardenDef(item.type);
    if (!def || def.kind !== "light") continue;
    const color = def.glow ?? DEFAULT_GLOW;
    const { d, h } = itemSize(item);
    if (def.run === "festoon") {
      out.push(...festoonLamps(site, item, color, h, def.pitch ?? 0.5, def.id === "festoon-warm" ? LUMENS.festoonWarm : LUMENS.festoon, groundY));
    } else if (def.shape === "bollard") {
      const g = groundY + groundHeightAt(site, item);
      out.push({ id: `garden:${item.id}:0`, pos: [item.x, g + h - 0.06, item.y], color, candela: candela(LUMENS.bollard), reach: REACH.bollard });
    } else if (def.shape === "wall-light") {
      // Same facing as the 3D fitting (SiteItems.tsx): forwards is (sin yaw, cos yaw) with yaw = -rot.
      const yaw = (-item.rot * Math.PI) / 180;
      const off = d / 2 + WALL_STANDOFF;
      const mount = item.mount ?? def.mount ?? 0;
      const g = groundY + groundHeightAt(site, item);
      out.push({
        id: `garden:${item.id}:0`,
        pos: [item.x + Math.sin(yaw) * off, g + mount + h * 0.4, item.y + Math.cos(yaw) * off],
        color,
        candela: candela(LUMENS.wall),
        reach: REACH.wall,
      });
    }
  }
  return out;
}

/** A festoon's bulbs (as SiteItems.tsx places them), clustered into one light, or two from FESTOON_SPLIT metres up. */
function festoonLamps(site: Pick<Site, "surfaces">, item: GardenItem, color: string, h: number, pitch: number, lumens: number, groundY: number): LampLight[] {
  const to = item.to ?? { x: item.x, y: item.y };
  const a = { x: item.x, y: groundY + groundHeightAt(site, item) + h, z: item.y };
  const b = { x: to.x, y: groundY + groundHeightAt(site, to) + (item.toH ?? h), z: to.y };
  const len = runLength(item);
  const bulbs = alongEvery(festoonCurve(a, b, item.sag ?? 0.3, 24), Math.max(0.1, pitch)).map((p) => [p.x, p.y - BULB_DROP, p.z] as [number, number, number]);
  // Within a third of the span, greedy clustering from one end gives two clusters (about the first two thirds, then the rest).
  const groups = clusterBulbs(bulbs, len >= FESTOON_SPLIT ? len / 3 : Infinity);
  return groups.map((members, k) => {
    const pos: [number, number, number] = [0, 0, 0];
    for (const i of members) for (let j = 0; j < 3; j++) pos[j] += bulbs[i][j] / members.length;
    return { id: `garden:${item.id}:${k}`, pos, color, candela: candela(lumens) * members.length, reach: REACH.festoon };
  });
}

/** Slots the garden wants in the light pool: one per source, lit or not, so the pool resizes only when a light is added or removed. */
export const gardenPoolDemand = (site: Pick<Site, "items" | "surfaces"> | null | undefined): number => (site ? gardenSources(site).length : 0);

/**
 * How far on the garden lamps are, 0 to 1, from lib/dusk.ts lightGlow at the sun's altitude: the same threshold the
 * painted light pools in SiteItems.tsx use, so the real light comes up with them (off by day, full at dusk and night).
 */
export function lampLevel(glow: number): number {
  const t = Math.min(1, Math.max(0, (glow - 0.3) / (0.9 - 0.3)));
  return t * t * (3 - 2 * t);
}

/**
 * The garden's lit lights now: none when the Lights master keeps lights off (lightsOn) or the garden lights do not
 * glow yet (lampLevel of lightGlow), else every source dimmed by that level. `altitude` null = sun study off.
 */
export function gardenLamps(site: Pick<Site, "items" | "surfaces"> | null | undefined, master: LightsMaster, altitude: number | null, groundY = 0): LampLight[] {
  if (!site || !lightsOn(master, altitude)) return [];
  const level = lampLevel(lightGlow(altitude));
  if (level <= 0) return [];
  return gardenSources(site, groundY).map((l) => ({ ...l, candela: l.candela * level }));
}
