import type { Floor, HouseModel } from "../types";
import { areaOf, buildWalls, cutWall, pointInPolygon, roomWorldPolygon, type V2 } from "./geometry";
import { boxedIn, flightAt as flightPoint, flightL, flightS, stairFlights, stairHeight, type Flight } from "./stairs";

/**
 * Stairwells: the opening in the floor above each flight, and where its
 * balustrades go. Pure, so the 3D view and walk mode agree on one shape.
 */

/** Clear headroom over the treads, metres (Building Regulations ask for 2.0 m). */
export const HEADROOM = 2.0;
/** Handrail height above the pitch line of the flight and above the landing floor, metres. */
export const RAIL_H = 0.9;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Stairwell {
  lowerId: string;
  upperId: string;
  flight: Flight;
  /** The openings in the upper floor, world metres on the plan (usually one). */
  rects: Rect[];
}

const CIRCULATION = /stair|landing|hall/i;

/**
 * One stairwell per flight: across the flight, from where headroom runs out
 * to the top of the flight. Where the floor above has a stairs, landing or
 * hall room over the flight, the opening is kept within those rooms: a
 * bedroom or bathroom that the tracing puts over the flight keeps its floor
 * (in a real house that is the boxed-in bulkhead over the lower steps).
 */
export function stairwells(model: HouseModel): Stairwell[] {
  return stairFlights(model, HEADROOM).map((flight) => {
    const a = flightPoint(flight, flight.wellStart, -flight.width / 2);
    const b = flightPoint(flight, flight.run, flight.width / 2);
    const full: Rect = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
    const upper = model.floors.find((f) => f.id === flight.upperId)!;
    const within = upper.rooms
      .filter((r) => CIRCULATION.test(r.name))
      .map((r) => intersect(full, boundsOf(roomWorldPolygon(upper, r))))
      .filter((r): r is Rect => !!r);
    return { lowerId: flight.lowerId, upperId: flight.upperId, flight, rects: within.length ? within : [full] };
  });
}

function boundsOf(poly: V2[]): Rect {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The overlap of two rectangles, if more than a sliver. */
function intersect(a: Rect, b: Rect): Rect | null {
  const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  return r.x1 - r.x0 > 0.05 && r.y1 - r.y0 > 0.05 ? r : null;
}

/** Clip a polygon to the half-plane where n·p <= c (Sutherland–Hodgman, one edge). */
function clipHalf(poly: V2[], nx: number, ny: number, c: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = nx * p.x + ny * p.y - c;
    const dq = nx * q.x + ny * q.y - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/**
 * A polygon with a rectangle taken out, as up to four pieces (left of it,
 * right of it, and the strips in front and behind). Returns the polygon
 * unchanged when the rectangle misses it.
 */
export function subtractRect(poly: V2[], r: Rect): V2[][] {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  if (Math.min(...xs) >= r.x1 || Math.max(...xs) <= r.x0 || Math.min(...ys) >= r.y1 || Math.max(...ys) <= r.y0) return [poly];
  const across = clipHalf(clipHalf(poly, -1, 0, -r.x0), 1, 0, r.x1);
  const pieces = [clipHalf(poly, 1, 0, r.x0), clipHalf(poly, -1, 0, -r.x1), clipHalf(across, 0, 1, r.y0), clipHalf(across, 0, -1, -r.y1)];
  return pieces.filter((p) => p.length >= 3 && areaOf(p) > 1e-4);
}

/** A room polygon with every stairwell opening taken out. */
export function cutWells(poly: V2[], rects: Rect[]): V2[][] {
  return rects.reduce((polys, r) => polys.flatMap((p) => subtractRect(p, r)), [poly]);
}

function distToSeg(p: V2, a: V2, b: V2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * Whether the side of an opening along a–b needs guarding: true when the
 * floor carries on beyond it (a room, no wall), false along a wall or an
 * outside edge. `out` is the unit direction away from the opening.
 */
function openSide(floor: Floor, a: V2, b: V2, out: V2, ceiling: number): boolean {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const m = { x: mid.x + out.x * 0.15, y: mid.y + out.y * 0.15 };
  if (!floor.rooms.some((r) => pointInPolygon(m, roomWorldPolygon(floor, r)))) return false;
  // A solid wall piece (not a doorway or gap) running along this side.
  for (const w of buildWalls(floor)) {
    for (const pc of cutWall(w, ceiling).pieces) {
      if (pc.y0 > 0.05) continue;
      // Within 0.3 m: tracings put walls at their centre lines, and old walls can be thicker than drawn.
      if (distToSeg(mid, pc.a, pc.b) < 0.3 && distToSeg(m, pc.a, pc.b) < 0.45) return false;
    }
  }
  return true;
}

/** A guard rail on a floor: a plan line from a to b, over floor or treads at heights ya and yb (metres above this floor). */
export interface RailRun {
  a: V2;
  b: V2;
  ya: number;
  yb: number;
  /** Where the newel posts at a and b start, metres above this floor (default 0, standing on it): a newel over a room the flight only passes over hangs from its soffit. */
  fa?: number;
  fb?: number;
}

/** How far a newel hanging from the flight drops below the pitch line, metres. */
const NEWEL_DROP = 0.35;

/**
 * Balustrades for a stairwell: along the open sides of the flight on the
 * floor below, and round the open edges of the opening on the floor above,
 * leaving the top of the flight open to step off: its end when it arrives
 * straight, the side it turns to when its head winds onto the landing.
 */
export function balustrades(model: HouseModel, well: Stairwell): { lower: RailRun[]; upper: RailRun[] } {
  const lower = model.floors.find((f) => f.id === well.lowerId);
  const upper = model.floors.find((f) => f.id === well.upperId);
  const f = well.flight;
  const out = { lower: [] as RailRun[], upper: [] as RailRun[] };
  if (!lower || !upper) return out;
  // Plan direction of +l across the flight (see flightPoint).
  const across = { x: -f.dir.y, y: f.dir.x };
  const side = (sign: number): V2 => ({ x: across.x * sign, y: across.y * sign });
  const boxed = boxedIn(lower, f);
  /** The end of a turned head, where the side it turns to begins. */
  const headStart = f.topTurn ? f.run - f.width : f.run;

  for (const l of [-f.width / 2, f.width / 2]) {
    const sign = Math.sign(l);
    // On the side the foot's winders are entered from, the rail starts at the newel where they turn;
    // on the side a turned head steps off, it ends at the newel where the head turns.
    const s0 = f.turn && sign === f.turn ? f.width : 0;
    const s1 = f.topTurn && sign === f.topTurn ? headStart : f.run;
    const a = flightPoint(f, s0, l);
    const b = flightPoint(f, s1, l);
    if (s1 - s0 < 0.05 || !openSide(lower, a, b, side(sign), model.ceilingHeight)) continue;
    const ya = stairHeight(f, s0, l * 0.999);
    const yb = stairHeight(f, s1, l * 0.999);
    out.lower.push({ a, b, ya, yb, fa: boxed(a) ? 0 : Math.max(0, ya - NEWEL_DROP), fb: boxed(b) ? 0 : Math.max(0, yb - NEWEL_DROP) });
  }
  for (const r of well.rects) {
    const corners = [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y1 },
    ];
    const ss = corners.map((c) => flightS(f, c.x, c.y));
    const ls = corners.map((c) => flightL(f, c.x, c.y));
    const [s0, s1] = [Math.min(...ss), Math.max(...ss)];
    const [l0, l1] = [Math.min(...ls), Math.max(...ls)];
    const edges: [V2, V2, V2][] = [];
    for (const [l, sign] of [
      [l0, -1],
      [l1, 1],
    ]) {
      // The side a turned head steps off onto the landing stays open.
      const e = f.topTurn && sign === f.topTurn ? Math.min(s1, headStart) : s1;
      if (e - s0 > 0.05) edges.push([flightPoint(f, s0, l), flightPoint(f, e, l), side(sign)]);
    }
    edges.push([flightPoint(f, s0, l0), flightPoint(f, s0, l1), { x: -f.dir.x, y: -f.dir.y }]);
    // A turned head's far end is guarded too (usually it is against a wall).
    if (f.topTurn) edges.push([flightPoint(f, s1, l0), flightPoint(f, s1, l1), f.dir]);
    for (const [a, b, dir] of edges) {
      // An edge shared with another part of the same opening (it spans two rooms) is not an edge.
      const m = { x: (a.x + b.x) / 2 + dir.x * 0.15, y: (a.y + b.y) / 2 + dir.y * 0.15 };
      if (well.rects.some((o) => o !== r && m.x > o.x0 && m.x < o.x1 && m.y > o.y0 && m.y < o.y1)) continue;
      if (openSide(upper, a, b, dir, model.ceilingHeight)) out.upper.push({ a, b, ya: 0, yb: 0 });
    }
  }
  return out;
}
