import type { Floor, HouseModel, StairsDir } from "../types";
import { pointInPolygon, roomWorldPolygon, toWorld, type V2, type WallPiece } from "./geometry";

/**
 * The treads of a flight: a straight run, optionally with kite winders at the
 * foot so the bottom steps are entered from the side (a quarter turn), and at
 * the head so the top steps turn a quarter onto the landing.
 * Plain plan geometry shared by the 3D stairs, the stairwell and the plan drawings.
 */

/**
 * A flight on the plan, world metres. `turn` is the side the foot's winders are
 * entered from: +1 right, -1 left (facing up the flight), 0 straight.
 * `topTurn` is the side the head's winders turn towards, onto the landing.
 */
export interface FlightShape {
  centre: V2;
  /** Unit plan direction the flight rises in. */
  dir: V2;
  run: number;
  width: number;
  rise: number;
  turn: -1 | 0 | 1;
  /** Winders at the head turning towards this side (+1 right, -1 left, facing up the flight); 0 or absent: straight. */
  topTurn?: -1 | 0 | 1;
  /** Winders in a turned head, 2 or 3. Default 2. */
  topWinders?: number;
}

export interface Tread {
  /** Outline on the plan, world metres. */
  pts: V2[];
  /** Height of the tread's top above the foot of the flight, metres. */
  top: number;
}

/** Going of the straight treads, metres. Straight flights keep their older, coarser steps. */
const GOING = 0.22;
/** Kite winders in a quarter turn at the foot. */
export const WINDERS = 3;
/** Winders in a quarter turn at the head, unless the floor says otherwise. */
export const TOP_WINDERS = 2;
/** Depth of the flight's structure under a tread where it is not boxed in down to the floor, metres. */
export const SOFFIT = 0.25;

type Shape = Pick<FlightShape, "run" | "width" | "turn" | "topTurn" | "topWinders">;

/** Number of winders in a flight's head (0 when it arrives straight). */
export function topWinderCount(f: Pick<FlightShape, "topTurn" | "topWinders">): number {
  if (!f.topTurn) return 0;
  const n = Math.round(f.topWinders ?? TOP_WINDERS);
  return Math.max(2, Math.min(3, Number.isFinite(n) ? n : TOP_WINDERS));
}

/** How a flight's run is shared out: foot winders, straight treads from s0 to s1, head winders, and the risers in all. */
function layout(f: Shape) {
  const bottom = f.turn ? WINDERS : 0;
  const top = topWinderCount(f);
  const s0 = f.turn ? f.width : 0;
  const s1 = top ? Math.max(s0, f.run - f.width) : f.run;
  const straight = !bottom && !top ? Math.max(6, Math.round(f.run / 0.25)) : Math.max(top ? 2 : 3, Math.round((s1 - s0) / GOING));
  // A flight arriving straight ends on its last tread, which is the floor above; a turned
  // head ends on its last winder, with one more riser up onto the landing beside it.
  return { bottom, top, s0, s1, straight, risers: bottom + straight + top + (top ? 1 : 0) };
}

/**
 * Number of risers in the flight. Arriving straight, the last tread is the
 * floor above, so this is also the number of treads; a turned head has one
 * tread fewer (its last riser steps off the side onto the landing).
 */
export function treadCount(f: Shape): number {
  return layout(f).risers;
}

/** Plan point at s up the run from the foot and l across it (+l is to the right going up). */
export function flightAt(f: Pick<FlightShape, "centre" | "dir" | "run">, s: number, l: number): V2 {
  const u = s - f.run / 2;
  return { x: f.centre.x + f.dir.x * u - f.dir.y * l, y: f.centre.y + f.dir.y * u + f.dir.x * l };
}

/** Kite winder outlines in (s, l) at the foot, entered across the l = turn·w/2 side and fanning round the corner where that side meets the straight run. */
function footWinders(w: number, turn: 1 | -1): [number, number][][] {
  const t = Math.tan(Math.PI / 6); // 30 degrees
  const P: [number, number] = [w, (turn * w) / 2];
  const a: [number, number] = [0, (turn * w) / 2];
  const b: [number, number] = [0, turn * (w / 2 - w * t)];
  const c: [number, number] = [0, (-turn * w) / 2];
  const d: [number, number] = [w - w * t, (-turn * w) / 2];
  const e: [number, number] = [w, (-turn * w) / 2];
  return [
    [P, a, b],
    [P, b, c, d],
    [P, d, e],
  ];
}

/**
 * Winder outlines in (s, l) at the head: k treads filling the last w × w of
 * the run, fanning from the newel where the straight run meets the side the
 * flight turns to (l = turn·w/2), from the last straight nosing round to that
 * side, which is the last riser, stepped over onto the landing.
 */
function headWinders(run: number, w: number, turn: 1 | -1, k: number): [number, number][][] {
  const base = run - w;
  const P: [number, number] = [base, (turn * w) / 2];
  const corner: [number, number] = [run, (-turn * w) / 2];
  const q = Math.PI / 4;
  // Where a ray from the newel meets the far sides: angle 0 runs across the flight, 90° up it.
  const ray = (th: number): [number, number] =>
    th <= q + 1e-9 ? [base + w * Math.tan(th), (-turn * w) / 2] : [run, (turn * w) / 2 - (turn * w) / Math.tan(th)];
  const out: [number, number][][] = [];
  for (let j = 0; j < k; j++) {
    const a = (j * Math.PI) / 2 / k;
    const b = ((j + 1) * Math.PI) / 2 / k;
    const poly: [number, number][] = [P, ray(a)];
    if (a < q - 1e-9 && b > q + 1e-9) poly.push(corner);
    poly.push(ray(b));
    out.push(poly);
  }
  return out;
}

export function stairTreads(f: FlightShape): Tread[] {
  const L = layout(f);
  const riser = f.rise / L.risers;
  const out: Tread[] = [];
  const push = (poly: [number, number][]) => out.push({ pts: poly.map(([s, l]) => flightAt(f, s, l)), top: (out.length + 1) * riser });
  if (f.turn) footWinders(f.width, f.turn).forEach(push);
  const going = (L.s1 - L.s0) / L.straight;
  const hw = f.width / 2;
  for (let j = 0; j < L.straight; j++) {
    const s0 = L.s0 + j * going;
    const s1 = s0 + going;
    push([
      [s0, -hw],
      [s1, -hw],
      [s1, hw],
      [s0, hw],
    ]);
  }
  if (L.top) headWinders(f.run, f.width, f.topTurn as 1 | -1, L.top).forEach(push);
  return out;
}

/** Outlines of a flight's winders, foot then head, for plan drawings. Independent of the flight's units (metres or image px). */
export function flightWinders(f: Pick<FlightShape, "centre" | "dir" | "run" | "width" | "turn" | "topTurn" | "topWinders">): V2[][] {
  const polys: [number, number][][] = [];
  if (f.turn) polys.push(...footWinders(f.width, f.turn));
  const k = topWinderCount(f);
  if (k) polys.push(...headWinders(f.run, f.width, f.topTurn as 1 | -1, k));
  return polys.map((poly) => poly.map(([s, l]) => flightAt(f, s, l)));
}

/**
 * Height of the stairs' pitch line under a point s up the run and l across
 * it: a smooth ramp through the treads, turning with the winders at a turned
 * foot or head.
 */
export function stairHeight(f: Shape & Pick<FlightShape, "rise">, s: number, l: number): number {
  const sc = Math.max(0, Math.min(f.run, s));
  const L = layout(f);
  if (!f.turn && !L.top) return (sc / f.run) * f.rise;
  const riser = f.rise / L.risers;
  const w = f.width;
  const low = L.bottom * riser;
  const high = L.top ? (L.bottom + L.straight) * riser : f.rise;
  if (f.turn && sc < w) {
    // Round the corner: 0 along the side you step on from, the winders' full height where the straight run starts.
    const phi = Math.atan2(-(l * f.turn - w / 2), w - sc);
    return (Math.max(0, Math.min(Math.PI / 2, phi)) / (Math.PI / 2)) * low;
  }
  if (L.top && sc > L.s1) {
    // Round the head: from the last straight nosing to the floor above, along the side you step off.
    const phi = Math.atan2(sc - L.s1, Math.max(0, w / 2 - l * (f.topTurn as number)));
    return high + (Math.min(Math.PI / 2, phi) / (Math.PI / 2)) * (f.rise - high);
  }
  return low + ((sc - L.s0) / Math.max(1e-6, L.s1 - L.s0)) * (high - low);
}

/** Plan direction each StairsDir rises in (+y is world +z, the bottom of the plan). */
export const STAIRS_VECTOR: Record<StairsDir, V2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const sideOf = (t: "left" | "right" | undefined): -1 | 0 | 1 => (t === "left" ? -1 : t === "right" ? 1 : 0);

/** The flight of a floor that has stairs, in world metres (rise from the model's storey height). */
export function floorFlight(model: HouseModel, floor: Floor): FlightShape | null {
  if (!floor.stairs) return null;
  return {
    centre: toWorld(floor, floor.stairs),
    dir: STAIRS_VECTOR[floor.stairsDir ?? "up"],
    run: floor.stairsLen ?? 2.6,
    width: floor.stairsWidth ?? 0.9,
    rise: model.ceilingHeight + model.slabThickness,
    turn: sideOf(floor.stairsTurn),
    topTurn: sideOf(floor.stairsTopTurn),
    topWinders: floor.stairsTopWinders,
  };
}

/** A flight between two floors. */
export interface Flight extends FlightShape {
  lowerId: string;
  upperId: string;
  /** Distance up the run where the treads come within `headroom` of the ceiling: the stairwell starts here. */
  wellStart: number;
}

/** Every flight in the model: a floor with stairs and a floor one level above it. */
export function stairFlights(model: HouseModel, headroom: number): Flight[] {
  const out: Flight[] = [];
  for (const f of model.floors) {
    const upper = model.floors.find((u) => u.level === f.level + 1);
    const shape = upper && floorFlight(model, f);
    if (!upper || !shape) continue;
    // First point up the centre line where the treads are too close to the ceiling.
    let s = 0;
    while (s < shape.run * 0.9 && stairHeight(shape, s, 0) < model.ceilingHeight - headroom) s += 0.01;
    out.push({ ...shape, lowerId: f.id, upperId: upper.id, wellStart: s });
  }
  return out;
}

/** Metres up a flight's run from its foot. */
export function flightS(f: Pick<FlightShape, "centre" | "dir" | "run">, x: number, y: number): number {
  return (x - f.centre.x) * f.dir.x + (y - f.centre.y) * f.dir.y + f.run / 2;
}

/** Metres across a flight from its centre line (+ to the right going up). */
export function flightL(f: Pick<FlightShape, "centre" | "dir">, x: number, y: number): number {
  return (y - f.centre.y) * f.dir.x - (x - f.centre.x) * f.dir.y;
}

/**
 * Whether the flight is boxed in down to the floor under a plan point: true
 * over the room its foot stands in (the stairs hall, with its understairs
 * cupboard), false where it has passed over a wall into another room, which
 * sees only a soffit under the treads (a bulkhead). Everywhere counts as
 * boxed in when the foot is in no room.
 */
export function boxedIn(floor: Floor, f: FlightShape): (p: V2) => boolean {
  const room = footRoom(floor, f);
  return room ? (p) => pointInPolygon(p, room) : () => true;
}

function footRoom(floor: Floor, f: FlightShape): V2[] | undefined {
  const foot = flightAt(f, Math.min(0.3, f.run / 4), 0);
  return floor.rooms.map((r) => roomWorldPolygon(floor, r)).find((poly) => pointInPolygon(foot, poly));
}

/**
 * The part of a tread's outline that is boxed in down to the floor (see
 * boxedIn): the whole tread over the stairs hall, none over another room,
 * and the hall's side of the wall line for a tread that straddles it.
 */
export function boxedPart(floor: Floor, f: FlightShape): (pts: V2[]) => V2[] | null {
  const room = footRoom(floor, f);
  if (!room) return (pts) => pts;
  const sgn = Math.sign(room.reduce((s, p, i) => s + p.x * room[(i + 1) % room.length].y - room[(i + 1) % room.length].x * p.y, 0)) || 1;
  return (pts) => {
    const inside = pts.map((p) => pointInPolygon(p, room));
    if (inside.every(Boolean)) return pts;
    let poly = pts;
    for (let i = 0; i < room.length && poly.length >= 3; i++) {
      const a = room[i];
      const b = room[(i + 1) % room.length];
      // Room edges whose segment crosses the tread: keep the room's side of each.
      const side = (p: V2) => sgn * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
      const sides = poly.map(side);
      if (sides.every((s) => s >= -1e-9) || sides.every((s) => s <= 1e-9)) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const along = poly.map((p) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len);
      if (Math.max(...along) <= 1e-9 || Math.min(...along) >= len - 1e-9) continue;
      const out: V2[] = [];
      for (let j = 0; j < poly.length; j++) {
        const p = poly[j];
        const q = poly[(j + 1) % poly.length];
        const sp = sides[j];
        const sq = sides[(j + 1) % poly.length];
        if (sp >= 0) out.push(p);
        if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
          const t = sp / (sp - sq);
          out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
        }
      }
      poly = out;
    }
    if (poly.length < 3) return null;
    const area = Math.abs(poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0)) / 2;
    if (area < 1e-4) return null;
    // A tread wholly over another room has nothing left only if no room edge crossed it.
    return poly === pts && !pointInPolygon(polygonCentroidOf(pts), room) ? null : poly;
  };
}

function polygonCentroidOf(pts: V2[]): V2 {
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

/**
 * Walls of the floor a flight starts from stop under its treads where the
 * flight passes over them (a head that runs on over a wall into the next
 * room). Each piece is split where its centre line crosses the flight, and
 * the part under the flight topped off at the underside of the treads over
 * it. `thickness` is the wall's, so both faces stay under the treads.
 */
export function clipUnderFlight(pieces: WallPiece[], f: FlightShape, thickness: number): WallPiece[] {
  const treads = stairTreads(f);
  const riser = f.rise / treadCount(f);
  const hw = f.width / 2;
  // A wall the foot or a side merely stands against is left alone.
  const m = 0.02;
  const inFlight = (p: V2) => {
    const s = flightS(f, p.x, p.y);
    const l = flightL(f, p.x, p.y);
    return s > 0 && s < f.run && Math.abs(l) < hw;
  };
  return pieces.flatMap((pc) => {
    const dx = pc.b.x - pc.a.x;
    const dy = pc.b.y - pc.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [pc];
    // The stretch of the centre line inside the flight, clipped against its four sides.
    const sa = flightS(f, pc.a.x, pc.a.y);
    const la = flightL(f, pc.a.x, pc.a.y);
    const ds = (flightS(f, pc.b.x, pc.b.y) - sa) / len;
    const dl = (flightL(f, pc.b.x, pc.b.y) - la) / len;
    let t0 = 0;
    let t1 = len;
    const bounds: [number, number, number, number][] = [
      [sa, ds, m, f.run - m],
      [la, dl, -hw + m, hw - m],
    ];
    for (const [v0, dv, lo, hi] of bounds) {
      if (Math.abs(dv) < 1e-9) {
        if (v0 <= lo || v0 >= hi) return [pc];
        continue;
      }
      const ta = (lo - v0) / dv;
      const tb = (hi - v0) / dv;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (t1 - t0 < 1e-3) return [pc];
    const at = (t: number): V2 => ({ x: pc.a.x + (dx * t) / len, y: pc.a.y + (dy * t) / len });
    const n = { x: -dy / len, y: dx / len };
    let cap = Infinity;
    const steps = Math.max(2, Math.ceil((t1 - t0) / 0.02));
    for (let i = 0; i <= steps; i++) {
      const c = at(t0 + ((t1 - t0) * i) / steps);
      for (const k of [-1, 0, 1]) {
        const p = { x: c.x + (n.x * k * thickness) / 2, y: c.y + (n.y * k * thickness) / 2 };
        if (!inFlight(p)) continue;
        const t = treads.find((tr) => pointInPolygon(p, tr.pts));
        if (t) cap = Math.min(cap, t.top - riser);
      }
    }
    if (!(cap < pc.y1)) return [pc];
    const out: WallPiece[] = [];
    if (t0 > 1e-3) out.push({ ...pc, b: at(t0) });
    if (cap > pc.y0 + 0.01) out.push({ ...pc, a: at(t0), b: at(t1), y1: cap });
    if (t1 < len - 1e-3) out.push({ ...pc, a: at(t1) });
    return out;
  });
}
