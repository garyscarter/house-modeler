import type { HouseModel, OpeningKind, Site } from "../types";
import { EXT_WALL_T, buildWalls, cutWall, pointInPolygon, roomWorldPolygon, type V2 } from "./geometry";
import { floorBase } from "./roof";
import { bearingToWorld, solarPosition, sunTimes } from "./sun";
import {
  GROUND_DROP,
  boundaryPrisms,
  housePrisms,
  neighbourPrism,
  prismBlocks,
  sunHoursGridFromSamples,
  type Prism,
  type SunDir,
  type SunHoursGrid,
} from "./site";

/** Opening kinds that let daylight in. */
export const GLAZED_KINDS: OpeningKind[] = ["window", "bay", "patio", "french", "bifold"];

export interface SunSample extends SunDir {
  /** Clock hour at the middle of the step. */
  t: number;
}

/** Sun directions at the middle of each step from sunrise to sunset (sun above the horizon only). */
export function sunSamples(site: Pick<Site, "latitude" | "longitude" | "frontBearing">, year: number, doy: number, stepH = 0.25): SunSample[] {
  const { sunrise, sunset } = sunTimes(site.latitude, site.longitude, year, doy);
  const out: SunSample[] = [];
  if (sunrise === null || sunset === null) return out;
  for (let t = sunrise + stepH / 2; t < sunset; t += stepH) {
    const p = solarPosition(site.latitude, site.longitude, year, doy, t);
    if (p.altitude <= 0) continue;
    const d = bearingToWorld(site.frontBearing, p.azimuth);
    const len = Math.hypot(d.x, d.z) || 1;
    out.push({ dx: d.x / len, dy: d.z / len, tan: Math.tan((p.altitude * Math.PI) / 180), t });
  }
  return out;
}

/** Share of the garden (cells with a value) getting at least `hours` of direct sun, 0-1. */
export function shareWithSun(grid: SunHoursGrid, hours: number): number {
  let n = 0;
  let lit = 0;
  for (const h of grid.hours) {
    if (Number.isNaN(h)) continue;
    n++;
    if (h >= hours) lit++;
  }
  return n ? lit / n : 0;
}

/** A spot on a room's glazing that the sun can reach, just outside the wall. */
export interface GlazingPoint {
  roomId: string;
  floorId: string;
  openingId: string;
  /** Plan position (world x, z) just outside the glass. */
  p: V2;
  /** Height above the ground, metres. */
  z: number;
  /** Outward unit normal of the wall. */
  nx: number;
  ny: number;
  /** Sun counts as reaching the glass when its horizontal direction dotted with the normal exceeds this. */
  minDot: number;
}

export function glazingPoints(model: HouseModel): GlazingPoint[] {
  const out: GlazingPoint[] = [];
  for (const floor of model.floors) {
    const polys = floor.rooms.map((r) => roomWorldPolygon(floor, r));
    const inAny = (p: V2) => polys.some((poly) => pointInPolygon(p, poly));
    for (const wall of buildWalls(floor)) {
      if (!wall.exterior) continue;
      const { placements } = cutWall(wall, model.ceilingHeight);
      for (const pl of placements) {
        if (!GLAZED_KINDS.includes(pl.opening.kind)) continue;
        let n = { x: -pl.dir.y, y: pl.dir.x };
        const c = pl.centre;
        if (inAny({ x: c.x + n.x * 0.3, y: c.y + n.y * 0.3 })) n = { x: -n.x, y: -n.y };
        if (inAny({ x: c.x + n.x * 0.3, y: c.y + n.y * 0.3 })) continue;
        const inner = { x: c.x - n.x * 0.3, y: c.y - n.y * 0.3 };
        const ri = polys.findIndex((poly) => pointInPolygon(inner, poly));
        if (ri < 0) continue;
        const bay = pl.opening.kind === "bay";
        const push = EXT_WALL_T + 0.05 + (bay ? pl.opening.depth ?? 0.6 : 0);
        const base = GROUND_DROP + floorBase(model, floor);
        for (const fu of [1 / 6, 1 / 2, 5 / 6]) {
          for (const fv of [0.25, 0.75]) {
            const along = (fu - 0.5) * pl.width;
            out.push({
              roomId: floor.rooms[ri].id,
              floorId: floor.id,
              openingId: pl.opening.id,
              p: { x: c.x + pl.dir.x * along + n.x * push, y: c.y + pl.dir.y * along + n.y * push },
              z: base + pl.y0 + (pl.y1 - pl.y0) * fv,
              nx: n.x,
              ny: n.y,
              minDot: bay ? -0.6 : 0.1,
            });
          }
        }
      }
    }
  }
  return out;
}

export interface RoomSun {
  roomId: string;
  floorId: string;
  name: string;
  floorName: string;
  /** Glazed openings on an outside wall. */
  windows: number;
  hours: number;
  /** One flag per sun sample. */
  lit: boolean[];
  /** Clock-hour spans of direct sun. */
  spans: [number, number][];
}

export function roomSunHours(model: HouseModel, occluders: Prism[], samples: SunSample[], stepH = 0.25): RoomSun[] {
  const pts = glazingPoints(model);
  const rooms: RoomSun[] = [];
  for (const floor of model.floors) {
    for (const room of floor.rooms) {
      const mine = pts.filter((g) => g.floorId === floor.id && g.roomId === room.id);
      const windows = new Set(mine.map((g) => g.openingId)).size;
      const lit = samples.map((s) =>
        mine.some((g) => s.dx * g.nx + s.dy * g.ny > g.minDot && !occluders.some((pr) => prismBlocks(g.p, s.dx, s.dy, s.tan, pr, g.z))),
      );
      const spans: [number, number][] = [];
      let prev: SunSample | null = null;
      lit.forEach((on, i) => {
        if (!on) {
          prev = null;
          return;
        }
        const s = samples[i];
        const last = spans[spans.length - 1];
        if (prev && last && Math.abs(s.t - prev.t - stepH) < 1e-6) last[1] = s.t + stepH / 2;
        else spans.push([s.t - stepH / 2, s.t + stepH / 2]);
        prev = s;
      });
      rooms.push({
        roomId: room.id,
        floorId: floor.id,
        name: room.name,
        floorName: floor.name,
        windows,
        hours: lit.filter(Boolean).length * stepH,
        lit,
        spans,
      });
    }
  }
  return rooms;
}

export interface GardenSun {
  /** Share of the garden getting 2 hours or more of sun, 0-1. */
  share2h: number;
  areaM2: number;
  litAreaM2: number;
  grid: SunHoursGrid;
}

export interface SunlightResult {
  day: number;
  sunrise: number | null;
  sunset: number | null;
  rooms: RoomSun[];
  garden?: GardenSun;
}

/** Everything that can cast a shadow: the house, the neighbours and the boundary. */
export function occludersFor(model: HouseModel, site: Site): Prism[] {
  return [...housePrisms(model), ...site.neighbours.map(neighbourPrism), ...boundaryPrisms(site)];
}

export function gardenSun(site: Site, occluders: Prism[], samples: SunSample[], cell = 1, stepH = 0.25): GardenSun | undefined {
  if (site.boundary.length < 3) return undefined;
  const grid = sunHoursGridFromSamples(site.boundary, occluders, samples, cell, stepH);
  let n = 0;
  let lit = 0;
  for (const h of grid.hours) {
    if (Number.isNaN(h)) continue;
    n++;
    if (h >= 2) lit++;
  }
  const a = cell * cell;
  return { share2h: n ? lit / n : 0, areaM2: n * a, litAreaM2: lit * a, grid };
}

export function sunlightFor(model: HouseModel, site: Site, year: number, doy: number, opts: { gardenCell?: number } = {}): SunlightResult {
  const { sunrise, sunset } = sunTimes(site.latitude, site.longitude, year, doy);
  if (sunrise === null || sunset === null) return { day: doy, sunrise, sunset, rooms: [] };
  const samples = sunSamples(site, year, doy);
  const occ = occludersFor(model, site);
  return {
    day: doy,
    sunrise,
    sunset,
    rooms: roomSunHours(model, occ, samples),
    garden: gardenSun(site, occ, samples, opts.gardenCell ?? 1),
  };
}

/** A string that changes only when something that affects the sun does (geometry, not finishes or images). */
export function sunlightKey(model: HouseModel, site: Site): string {
  return JSON.stringify([
    model.ceilingHeight,
    model.slabThickness,
    model.exterior ?? null,
    model.floors.map((f) => [
      f.id,
      f.name,
      f.level,
      f.offset,
      f.origin,
      f.pxPerM,
      f.rooms.map((r) => [r.id, r.name, r.polygon, r.roofGroup ?? null]),
      f.openings.map((o) => [o.id, o.kind, o.x, o.y, o.orientation, o.widthM, o.sill ?? null, o.head ?? null, o.depth ?? null]),
      (f.walls ?? []).map((w) => [w.id, w.a, w.b, w.height ?? null]),
      f.canopies ?? null,
    ]),
    site.boundary,
    site.boundaryEdges ?? null,
    site.neighbours.map((n) => [n.id, n.polygon, n.eaves, n.roof, n.pitchDeg ?? null]),
    site.latitude,
    site.longitude,
    site.frontBearing,
  ]);
}

export interface RoomCompare {
  name: string;
  floorName: string;
  /** Hours of sun in each layout; undefined when the room is not in that layout. */
  current?: number;
  proposed?: number;
  /** Outside glazed openings in each layout (0: show "No outside windows"). */
  currentWindows?: number;
  proposedWindows?: number;
  /** Clock-hour spans of direct sun in each layout. */
  currentSpans?: [number, number][];
  proposedSpans?: [number, number][];
}

/** Match rooms of the two layouts by id, then by name; rooms in only one layout are kept. */
export function compareRooms(a?: SunlightResult, b?: SunlightResult): RoomCompare[] {
  const left = a?.rooms ?? [];
  const right = [...(b?.rooms ?? [])];
  const out: RoomCompare[] = [];
  for (const r of left) {
    let i = right.findIndex((x) => x.roomId === r.roomId && x.floorId === r.floorId);
    if (i < 0) i = right.findIndex((x) => x.roomId === r.roomId);
    if (i < 0) i = right.findIndex((x) => x.name === r.name && x.floorName === r.floorName);
    if (i < 0) i = right.findIndex((x) => x.name === r.name);
    const m = i >= 0 ? right.splice(i, 1)[0] : undefined;
    out.push({ name: r.name, floorName: r.floorName, current: r.hours, currentWindows: r.windows, proposed: m?.hours, proposedWindows: m?.windows, currentSpans: r.spans, proposedSpans: m?.spans });
  }
  for (const m of right) out.push({ name: m.name, floorName: m.floorName, proposed: m.hours, proposedWindows: m.windows, proposedSpans: m.spans });
  return out;
}
