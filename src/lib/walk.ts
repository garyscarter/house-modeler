import type { Floor, HouseModel, OpeningKind, StairsDir } from "../types";
import {
  buildWalls,
  cutWall,
  polygonArea,
  polygonCentroid,
  pointInPolygon,
  roomWorldPolygon,
  toWorld,
  type V2,
} from "./geometry";
import { outwardSign, wallThickness } from "./walls";
import { bayOutline } from "./openings";

/**
 * Walk-mode physics on the plan: the walker is a circle that slides along
 * walls (each a capsule of the wall's half thickness), and straight flights
 * of stairs carry it between floors. Everything here is in world metres on
 * the (x, z) plane, with V2.y meaning world z.
 */

/** Radius of the walker's body, metres. */
export const WALKER_RADIUS = 0.25;

/** A wall's centre line and half thickness; the walker keeps WALKER_RADIUS + t from it. */
export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  t: number;
}

/** Openings you can walk through. Front and garage doors are drawn closed; windows and bays block. */
const PASSABLE: ReadonlySet<OpeningKind> = new Set<OpeningKind>(["door", "gap", "patio", "french", "bifold"]);

/** Wall pieces lower than this (sills) still block; anything starting higher is a lintel or window head. */
const KNEE = 0.5;

const seg = (a: V2, b: V2, t: number): Seg => ({ ax: a.x, ay: a.y, bx: b.x, by: b.y, t });

/**
 * Collision segments for one floor: every wall piece that reaches the floor
 * (so sills under windows block and lintels over doors don't), closed doors,
 * and the glazing of canted bays so you can step into the bay but not out
 * of it. Free-standing walls come through buildWalls too.
 */
export function collisionSegments(floor: Floor, ceiling: number): Seg[] {
  const out: Seg[] = [];
  const polys = floor.rooms.map((r) => roomWorldPolygon(floor, r));
  for (const wall of buildWalls(floor)) {
    if (Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) < 1e-6) continue;
    const t = wallThickness(wall) / 2;
    const { pieces, placements } = cutWall(wall, wall.height ?? ceiling);
    for (const p of pieces) if (p.y0 < KNEE) out.push(seg(p.a, p.b, t));
    for (const pl of placements) {
      const kind = pl.opening.kind;
      if (PASSABLE.has(kind) || pl.y0 >= KNEE) continue;
      const half = { x: (pl.dir.x * pl.width) / 2, y: (pl.dir.y * pl.width) / 2 };
      const side = kind === "bay" ? outwardSign(pl, polys) : 0;
      if (kind === "bay" && side) {
        const pts = bayOutline(pl.width, t * 2, pl.opening.depth).map((p) => ({
          x: pl.centre.x + pl.dir.x * p.x - pl.dir.y * p.z * side,
          y: pl.centre.y + pl.dir.y * p.x + pl.dir.x * p.z * side,
        }));
        for (let i = 1; i < pts.length; i++) out.push(seg(pts[i - 1], pts[i], 0.05));
        // The bay's ends meet the wall's outer face; close the gap back to the centre line.
        out.push(seg({ x: pl.centre.x - half.x, y: pl.centre.y - half.y }, pts[0], 0.05));
        out.push(seg({ x: pl.centre.x + half.x, y: pl.centre.y + half.y }, pts[pts.length - 1], 0.05));
      } else {
        out.push(seg({ x: pl.centre.x - half.x, y: pl.centre.y - half.y }, { x: pl.centre.x + half.x, y: pl.centre.y + half.y }, t));
      }
    }
  }
  return out;
}

/** A straight flight from `lowerId` (at its stairs point) up to `upperId`. */
export interface Flight {
  lowerId: string;
  upperId: string;
  /** Plan centre of the flight. */
  centre: V2;
  /** Unit plan direction the flight rises in. */
  dir: V2;
  run: number;
  width: number;
  /** Floor level of the lower floor and the total rise, metres. */
  baseY: number;
  rise: number;
  /** Ceiling height of the lower floor, metres above its floor. */
  ceiling: number;
  /** Distance up the run where the side rails begin; below it you can step on or off sideways. */
  railStart: number;
  /** Distance up the run where the stairwell opening in the upper floor begins (headroom for the eye). */
  wellStart: number;
}

/** Plan direction each StairsDir rises in (+y is world +z, the bottom of the plan). Matches Stairs in House.tsx. */
export const STAIRS_VECTOR: Record<StairsDir, V2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Floor level of a floor, metres (same as floorBaseY in House.tsx). */
export function levelY(model: HouseModel, level: number): number {
  return level * (model.ceilingHeight + model.slabThickness);
}

/**
 * Every flight in the model: a floor with a stairs point and a floor one
 * level above. `eye` sets where the stairwell opening starts, so the eye
 * clears the ceiling all the way up.
 */
export function stairFlights(model: HouseModel, eye: number): Flight[] {
  const out: Flight[] = [];
  const H = model.ceilingHeight;
  const rise = H + model.slabThickness;
  for (const f of model.floors) {
    if (!f.stairs) continue;
    const upper = model.floors.find((u) => u.level === f.level + 1);
    if (!upper) continue;
    const run = f.stairsLen ?? 2.6;
    const s0 = ((H - 0.15 - eye) / rise) * run;
    out.push({
      lowerId: f.id,
      upperId: upper.id,
      centre: toWorld(f, f.stairs),
      dir: STAIRS_VECTOR[f.stairsDir ?? "up"],
      run,
      width: f.stairsWidth ?? 0.9,
      baseY: levelY(model, f.level),
      rise,
      ceiling: H,
      railStart: Math.min(run * 0.4, 1),
      wellStart: Math.max(0, Math.min(run * 0.9, s0)),
    });
  }
  return out;
}

/** Metres up a flight's run from its foot (scalars rather than an object: this runs several times a frame). */
export function flightS(f: Flight, x: number, y: number): number {
  return (x - f.centre.x) * f.dir.x + (y - f.centre.y) * f.dir.y + f.run / 2;
}

/** Metres to the side of a flight's centre line. */
export function flightL(f: Flight, x: number, y: number): number {
  return (y - f.centre.y) * f.dir.x - (x - f.centre.x) * f.dir.y;
}

/** Plan point at (s, l) on a flight. */
export function flightPoint(f: Flight, s: number, l: number): V2 {
  const u = s - f.run / 2;
  return { x: f.centre.x + f.dir.x * u - f.dir.y * l, y: f.centre.y + f.dir.y * u + f.dir.x * l };
}

/** Height of the treads at `s` up the run, metres above the lower floor (a smooth ramp; the eye is eased anyway). */
export function flightHeight(f: Flight, s: number): number {
  return (Math.max(0, Math.min(f.run, s)) / f.run) * f.rise;
}

function railSegs(f: Flight, s0: number, s1: number): Seg[] {
  const w = f.width / 2;
  return [seg(flightPoint(f, s0, -w), flightPoint(f, s1, -w), 0.03), seg(flightPoint(f, s0, w), flightPoint(f, s1, w), 0.03)];
}
const capSeg = (f: Flight, s: number) => seg(flightPoint(f, s, -f.width / 2), flightPoint(f, s, f.width / 2), 0.03);

/** Everything the walker collides with, per floor, plus each flight's own rails. */
export interface WalkWorld {
  flights: Flight[];
  /** Per floor id: its walls, the side rails and top end of flights rising from it, and the edges of stairwells arriving at it. */
  floors: Map<string, { baseY: number; segs: Seg[]; walls: Seg[] }>;
  /** Per flight: the rails that keep you on it, and those plus the lower floor's walls for near its foot. */
  rails: Seg[][];
  foot: Seg[][];
}

export function buildWalkWorld(model: HouseModel, eye: number): WalkWorld {
  const flights = stairFlights(model, eye);
  const floors = new Map<string, { baseY: number; segs: Seg[]; walls: Seg[] }>();
  for (const f of model.floors) {
    const walls = collisionSegments(f, model.ceilingHeight);
    const segs = [...walls];
    for (const fl of flights) {
      // Below a flight: no walking under it or into the void under the landing.
      if (fl.lowerId === f.id) segs.push(...railSegs(fl, fl.railStart, fl.run), capSeg(fl, fl.run));
      // Above a flight: the stairwell is open only at its top end.
      if (fl.upperId === f.id) segs.push(...railSegs(fl, fl.wellStart, fl.run), capSeg(fl, fl.wellStart));
    }
    floors.set(f.id, { baseY: levelY(model, f.level), segs, walls });
  }
  const rails = flights.map((fl) => railSegs(fl, fl.railStart, fl.run));
  const foot = flights.map((fl, i) => [...rails[i], ...(floors.get(fl.lowerId)?.walls ?? [])]);
  return { flights, floors, rails, foot };
}

/** Where the walker is: plan position, the floor it stands on, and the flight it is on (-1 for none). */
export interface WalkState {
  x: number;
  y: number;
  floorId: string;
  flight: number;
}

/** Height of the ground under the walker, world metres. */
export function groundY(world: WalkWorld, st: WalkState): number {
  if (st.flight >= 0) {
    const f = world.flights[st.flight];
    return f.baseY + flightHeight(f, flightS(f, st.x, st.y));
  }
  return world.floors.get(st.floorId)?.baseY ?? 0;
}

/** The floor to show and list as current: on a flight, whichever end is nearer. */
export function displayFloorId(world: WalkWorld, st: WalkState): string {
  if (st.flight < 0) return st.floorId;
  const f = world.flights[st.flight];
  return flightS(f, st.x, st.y) > f.run / 2 ? f.upperId : f.lowerId;
}

/** Push the circle at `p` out of every segment it overlaps; `prev` breaks ties when it sits on a centre line. */
function resolve(p: { x: number; y: number }, prev: V2, segs: Seg[], r: number) {
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const s of segs) {
      const ex = s.bx - s.ax;
      const ey = s.by - s.ay;
      const len2 = ex * ex + ey * ey;
      const k = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.ax) * ex + (p.y - s.ay) * ey) / len2)) : 0;
      const cx = s.ax + ex * k;
      const cy = s.ay + ey * k;
      let nx = p.x - cx;
      let ny = p.y - cy;
      const d = Math.hypot(nx, ny);
      const R = r + s.t;
      if (d >= R) continue;
      if (d > 1e-9) {
        nx /= d;
        ny /= d;
      } else {
        // Exactly on the line: push back towards the side we came from.
        const len = Math.sqrt(len2) || 1;
        nx = -ey / len;
        ny = ex / len;
        if ((prev.x - cx) * nx + (prev.y - cy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      p.x = cx + nx * R;
      p.y = cy + ny * R;
      moved = true;
    }
    if (!moved) break;
  }
}

/** Segments that apply where the walker is now. */
function activeSegs(world: WalkWorld, st: WalkState): Seg[] {
  if (st.flight < 0) return world.floors.get(st.floorId)?.segs ?? [];
  const f = world.flights[st.flight];
  // Near the foot you are still among the lower floor's walls; higher up only the rails matter.
  return flightS(f, st.x, st.y) < f.railStart + WALKER_RADIUS ? world.foot[st.flight] : world.rails[st.flight];
}

/** Step on or off flights after a move. */
function transition(world: WalkWorld, st: WalkState) {
  if (st.flight >= 0) {
    const f = world.flights[st.flight];
    const s = flightS(f, st.x, st.y);
    const l = flightL(f, st.x, st.y);
    if (s > f.run) {
      st.flight = -1;
      st.floorId = f.upperId;
    } else if (s < 0 || Math.abs(l) > f.width / 2) {
      st.flight = -1;
      st.floorId = s > f.run / 2 ? f.upperId : f.lowerId;
    }
    return;
  }
  for (let i = 0; i < world.flights.length; i++) {
    const f = world.flights[i];
    const s = flightS(f, st.x, st.y);
    const l = flightL(f, st.x, st.y);
    if (Math.abs(l) > f.width / 2 || s > f.run) continue;
    if ((f.lowerId === st.floorId && s >= 0) || (f.upperId === st.floorId && s >= f.wellStart)) {
      st.flight = i;
      return;
    }
  }
}

const prev = { x: 0, y: 0 };

/**
 * Move the walker by (dx, dy), sliding along whatever it hits and stepping
 * on and off stairs. Long moves are split so it can't tunnel through a wall.
 * Mutates and returns `st`.
 */
export function moveWalker(world: WalkWorld, st: WalkState, dx: number, dy: number, r = WALKER_RADIUS): WalkState {
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(len / 0.08));
  for (let i = 0; i < n; i++) {
    prev.x = st.x;
    prev.y = st.y;
    st.x += dx / n;
    st.y += dy / n;
    resolve(st, prev, activeSegs(world, st), r);
    transition(world, st);
  }
  return st;
}

/** Nudge a freshly placed walker out of any wall it overlaps. */
export function settleWalker(world: WalkWorld, st: WalkState, r = WALKER_RADIUS): WalkState {
  transition(world, st);
  prev.x = st.x;
  prev.y = st.y;
  resolve(st, prev, activeSegs(world, st), r);
  return st;
}

/**
 * Where to stand when walking starts on a floor: the middle of its largest
 * room, looking at the nearest door of that room (or the plan's centre).
 */
export function spawnPoint(floor: Floor, fallback: V2): { at: V2; look: V2 } {
  let at = fallback;
  let poly: V2[] | null = null;
  let best = 0;
  for (const room of floor.rooms) {
    const p = roomWorldPolygon(floor, room);
    const a = Math.abs(polygonArea(p));
    if (a > best) {
      best = a;
      at = polygonCentroid(p);
      poly = p;
    }
  }
  let look = fallback;
  let bestD = Infinity;
  for (const op of floor.openings) {
    // Face into the house rather than out of it.
    if (op.kind !== "door" && op.kind !== "gap") continue;
    const p = toWorld(floor, { x: op.x, y: op.y });
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    // Doors on the room's boundary sit within a few metres of its centre.
    if (poly && (pointInPolygon(p, poly) || d < 6) && d < bestD) {
      bestD = d;
      look = p;
    }
  }
  if (Math.hypot(look.x - at.x, look.y - at.y) < 0.1) look = { x: at.x + 1, y: at.y };
  return { at, look };
}
