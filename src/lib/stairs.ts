import type { Floor, HouseModel, StairsDir } from "../types";
import { pointInPolygon, roomWorldPolygon, toWorld, type V2, type WallPiece } from "./geometry";
import { BULKHEAD_REACH, growConvex, splitConvex, type Bulkhead } from "./bulkhead";

/**
 * The treads of a flight: a straight run, optionally with kite winders at the
 * foot so the bottom steps are entered from the side (a quarter turn), and at
 * the head so the top steps turn a quarter onto the landing, or a flat square
 * at the head with steps up from its side onto the landing.
 * Plain plan geometry shared by the 3D stairs, the stairwell and the plan drawings.
 */

/**
 * A flight on the plan, world metres. `turn` is the side the foot's winders are
 * entered from: +1 right, -1 left (facing up the flight), 0 straight.
 * `topTurn` is the side the head turns towards, onto the landing: by winders,
 * or (`topSteps`) from a flat square up steps beyond that side.
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
  /**
   * A turned head as a flat square (the w × w the winders would fill) with this many risers up from it to the
   * floor above (1-3), the steps between going out beyond the square's side; absent or 0: winders.
   */
  topSteps?: number;
  /** Where a flat head's steps go up from the square (see headStepSpans); absent: the turn side's whole length. */
  stepSpans?: StepSpan[];
}

/** A stretch of a flat head's side (s from s0 to s1 up the run; side +1 right going up, -1 left) with steps up from it. */
export interface StepSpan {
  side: -1 | 1;
  s0: number;
  s1: number;
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
/** A wall under a flight stops this far under the tread surface over it, so the two never share a face. */
export const WALL_UNDER_TREAD = 0.003;
/** Painted lining on the underside of a tread boxed into a bulkhead whose block would hang below it, metres. */
export const LINING = 0.004;

type Shape = Pick<FlightShape, "run" | "width" | "turn" | "topTurn" | "topWinders" | "topSteps" | "stepSpans">;

/** Number of risers from a flat head's square up to the floor above (0 when the head winds or arrives straight). */
export function topStepCount(f: Pick<FlightShape, "topTurn" | "topSteps">): number {
  if (!f.topTurn || !f.topSteps) return 0;
  const n = Math.round(f.topSteps);
  return Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 0;
}

/** How far a flat head's steps go out beyond the square's side: a going for each step between it and the floor. */
export function stepDepth(f: Pick<FlightShape, "topTurn" | "topSteps">, metre = 1): number {
  return Math.max(0, topStepCount(f) - 1) * GOING * metre;
}

/** Where a flat head's steps go up from its square (none for winders or a straight head). */
export function headSpans(f: Pick<FlightShape, "run" | "width" | "topTurn" | "topSteps" | "stepSpans">): StepSpan[] {
  if (!topStepCount(f)) return [];
  return f.stepSpans ?? [{ side: f.topTurn as -1 | 1, s0: f.run - f.width, s1: f.run }];
}

/** Number of winders in a flight's head (0 when it arrives straight or on a flat square). */
export function topWinderCount(f: Pick<FlightShape, "topTurn" | "topWinders" | "topSteps">): number {
  if (!f.topTurn || topStepCount(f)) return 0;
  const n = Math.round(f.topWinders ?? TOP_WINDERS);
  return Math.max(2, Math.min(3, Number.isFinite(n) ? n : TOP_WINDERS));
}

/** How a flight's run is shared out: foot winders, straight treads from s0 to s1, head winders or square and steps, and the risers in all. */
function layout(f: Shape) {
  const bottom = f.turn ? WINDERS : 0;
  const top = topWinderCount(f);
  const steps = topStepCount(f);
  const head = top > 0 || steps > 0;
  const s0 = f.turn ? f.width : 0;
  const s1 = head ? Math.max(s0, f.run - f.width) : f.run;
  const straight = !bottom && !head ? Math.max(6, Math.round(f.run / 0.25)) : Math.max(head ? 2 : 3, Math.round((s1 - s0) / GOING));
  // A flight arriving straight ends on its last tread, which is the floor above; a turned
  // head ends on its last winder, with one more riser up onto the landing beside it; a flat
  // head is one riser up onto its square, then `steps` risers up onto the landing.
  return { bottom, top, steps, head, s0, s1, straight, risers: bottom + straight + (top ? top + 1 : 0) + (steps ? steps + 1 : 0) };
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
  const push = (poly: [number, number][], k = out.length + 1) => out.push({ pts: poly.map(([s, l]) => flightAt(f, s, l)), top: k * riser });
  if (f.turn) footWinders(f.width, f.turn).forEach((poly) => push(poly));
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
  if (L.top) headWinders(f.run, f.width, f.topTurn as 1 | -1, L.top).forEach((poly) => push(poly));
  if (L.steps) headSquare(f).forEach((poly, j) => push(poly, L.bottom + L.straight + 1 + headStepRiser(f, j)));
  return out;
}

/**
 * A flat head's square and the steps up from its sides, as (s, l) outlines: the square first, then for each
 * step out from the square (nearest first), one outline per span. Lengths in the flight's own units, with
 * `metre` of them to a metre.
 */
function headSquare(f: Shape, metre = 1): [number, number][][] {
  const hw = f.width / 2;
  const base = f.run - f.width;
  const out: [number, number][][] = [
    [
      [base, -hw],
      [f.run, -hw],
      [f.run, hw],
      [base, hw],
    ],
  ];
  const spans = headSpans(f).map((sp) => ({ ...sp, s0: sp.s0 * metre, s1: sp.s1 * metre }));
  for (let j = 1; j < topStepCount(f); j++) {
    for (const sp of spans) {
      const a = sp.side * (hw + (j - 1) * GOING * metre);
      const b = sp.side * (hw + j * GOING * metre);
      const [l0, l1] = [Math.min(a, b), Math.max(a, b)];
      out.push([
        [sp.s0, l0],
        [sp.s1, l0],
        [sp.s1, l1],
        [sp.s0, l1],
      ]);
    }
  }
  return out;
}

/** The riser (counted from the square's, 0) of outline j of headSquare. */
function headStepRiser(f: Shape, j: number): number {
  return j === 0 ? 0 : Math.ceil(j / Math.max(1, headSpans(f).length));
}

/**
 * Outlines of a flight's winders, foot then head (or a flat head's square and its steps), for plan drawings.
 * In the flight's own units (metres or image px), with `metre` of them to a metre (for the steps' going and
 * `stepSpans`, which are in metres).
 */
export function flightWinders(
  f: Pick<FlightShape, "centre" | "dir" | "run" | "width" | "turn" | "topTurn" | "topWinders" | "topSteps" | "stepSpans">,
  metre = 1,
): V2[][] {
  const polys: [number, number][][] = [];
  if (f.turn) polys.push(...footWinders(f.width, f.turn));
  const k = topWinderCount(f);
  if (k) polys.push(...headWinders(f.run, f.width, f.topTurn as 1 | -1, k));
  if (topStepCount(f)) {
    // Without spans the turn side's whole length, in the flight's own units.
    const spans = f.stepSpans ?? [{ side: f.topTurn as -1 | 1, s0: (f.run - f.width) / metre, s1: f.run / metre }];
    polys.push(...headSquare({ ...f, stepSpans: spans }, metre));
  }
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
  if (!f.turn && !L.head) return (sc / f.run) * f.rise;
  const riser = f.rise / L.risers;
  const w = f.width;
  const low = L.bottom * riser;
  const high = L.head ? (L.bottom + L.straight) * riser : f.rise;
  if (L.steps) {
    const square = high + riser;
    // Out on a flat head's steps: from the square up to the floor above across them.
    const out = Math.abs(l) - w / 2;
    if (out > 0 && headSpans(f).some((sp) => sp.side === Math.sign(l) && s >= sp.s0 - 1e-6 && s <= sp.s1 + 1e-6)) {
      const d = stepDepth(f);
      return d > 1e-6 ? square + Math.min(1, out / d) * (f.rise - square) : f.rise;
    }
    // Up onto the square over its first going, then flat.
    if (sc > L.s1) return Math.min(square, high + ((sc - L.s1) / GOING) * riser);
  }
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
  const shape: FlightShape = {
    centre: toWorld(floor, floor.stairs),
    dir: STAIRS_VECTOR[floor.stairsDir ?? "up"],
    run: floor.stairsLen ?? 2.6,
    width: floor.stairsWidth ?? 0.9,
    rise: model.ceilingHeight + model.slabThickness,
    turn: sideOf(floor.stairsTurn),
    topTurn: sideOf(floor.stairsTopTurn),
    topWinders: floor.stairsTopWinders,
  };
  if (floor.stairsTopTurn && floor.stairsTopSteps) {
    shape.topSteps = floor.stairsTopSteps;
    shape.stepSpans = headStepSpans(shape, model.floors.find((u) => u.level === floor.level + 1));
  }
  return shape;
}

/** Least stretch of a flat head's far side with landing beyond it for steps to go up there, metres. */
const MIN_SPAN = 0.4;

/**
 * Where a flat head's steps go up onto the floor above: along the side the head turns to, and along its far
 * side too where the same room carries on past it (a landing continued past the head), each over the longest
 * stretch with that room both over the square and beyond the steps. The turn side keeps its whole length when
 * it has no such stretch.
 */
export function headStepSpans(f: FlightShape, upper: Floor | undefined): StepSpan[] {
  if (!topStepCount(f)) return [];
  const rooms = upper ? upper.rooms.map((r) => roomWorldPolygon(upper, r)) : [];
  const hw = f.width / 2;
  const reach = hw + stepDepth(f) + 0.1;
  const base = f.run - f.width;
  const stretch = (side: number): [number, number] | null => {
    const n = Math.max(1, Math.round(f.width / 0.01));
    const ok = (s: number) => {
      const a = flightAt(f, s, side * (hw - 0.05));
      const b = flightAt(f, s, side * reach);
      return rooms.some((poly) => pointInPolygon(a, poly) && pointInPolygon(b, poly));
    };
    let best: [number, number] | null = null;
    let from = -1;
    // Samples at the middle of each centimetre; a stretch runs to the edges of its first and last.
    for (let k = 0; k <= n; k++) {
      const good = k < n && ok(base + ((k + 0.5) * f.width) / n);
      if (good && from < 0) from = k;
      if (!good && from >= 0) {
        const span: [number, number] = [base + (from * f.width) / n, base + (k * f.width) / n];
        if (!best || span[1] - span[0] > best[1] - best[0]) best = span;
        from = -1;
      }
    }
    return best;
  };
  const t = f.topTurn as -1 | 1;
  const near = stretch(t);
  const out: StepSpan[] = [near && near[1] - near[0] >= MIN_SPAN ? { side: t, s0: near[0], s1: near[1] } : { side: t, s0: base, s1: f.run }];
  const far = stretch(-t);
  if (far && far[1] - far[0] >= MIN_SPAN) out.push({ side: -t as -1 | 1, s0: far[0], s1: far[1] });
  return out;
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
 * the part under the flight topped off just under the surface of the lowest
 * tread over it (WALL_UNDER_TREAD): inside the treads' blocks, so it shows
 * nowhere on the stairs, while on the far side it reaches up to the tread
 * that crosses it, where a bulkhead there meets it. `thickness` is the
 * wall's, so both faces stay under the treads.
 */
export function clipUnderFlight(pieces: WallPiece[], f: FlightShape, thickness: number): WallPiece[] {
  const treads = stairTreads(f);
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
        if (t) cap = Math.min(cap, t.top - WALL_UNDER_TREAD);
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

/** A flight's footprint on the plan: the run × width rectangle, world metres. */
export function flightFootprint(f: Pick<FlightShape, "centre" | "dir" | "run" | "width">): V2[] {
  const hw = f.width / 2;
  return [flightAt(f, 0, -hw), flightAt(f, f.run, -hw), flightAt(f, f.run, hw), flightAt(f, 0, hw)];
}

/** A prism of the flight's structure: a plan outline (world metres) from y0 up to y1 above the floor. */
export interface FlightBlock {
  pts: V2[];
  y0: number;
  y1: number;
}

const onSegment = (p: V2, a: V2, b: V2) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) < 1e-6;
};

/** The edge of `t` it shares with `prev` (its riser, where it rises from prev), as [a, b], or null. */
function riserEdge(t: V2[], prev: V2[]): [V2, V2] | null {
  for (let i = 0; i < t.length; i++) {
    const a = t[i];
    const b = t[(i + 1) % t.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
    const on = (p: V2) => prev.some((q, j) => onSegment(p, q, prev[(j + 1) % prev.length]));
    if (on(a) && on(b)) return [a, b];
  }
  return null;
}

/**
 * The solid parts of a flight, as plan prisms: `body` in the painted understairs finish, `carpet` the treads.
 * Each tread is a carpeted block one riser deep. Under it:
 * - over the room the foot stands in, the flight is boxed in down to the floor (the understairs cupboard);
 * - where it has passed over a wall into another room, a soffit SOFFIT deep hangs under it,
 * - except where a bulkhead covers it (its footprint grown by BULKHEAD_REACH, so one built against the wall also
 *   covers the wall's thickness): the bulkhead is the boxing, so the flight is boxed down to the bulkhead's
 *   underside instead, and nothing of it hangs below. A tread whose block would reach below the underside is cut
 *   off there, under a thin painted lining; its riser, where it rises from a tread outside the bulkhead, is lined
 *   below the underside (carpet on the stairs' side, paint on the room's), closing the bulkhead down to the tread
 *   below. A tread whose surface is itself below the underside cannot be boxed in: it is drawn as it is, showing.
 */
export function flightBlocks(floor: Floor, f: FlightShape, bulkheads: Bulkhead[] = []): { body: FlightBlock[]; carpet: FlightBlock[] } {
  const treads = stairTreads(f);
  const riser = f.rise / treadCount(f);
  const boxed = boxedPart(floor, f);
  const covers = bulkheads.map((b) => ({ pts: growConvex(b.pts, BULKHEAD_REACH), bottom: b.bottom }));
  const body: FlightBlock[] = [];
  const carpet: FlightBlock[] = [];
  const inCover = (pts: V2[], cover: V2[]) => splitConvex(pts, cover).inside;
  treads.forEach((t, k) => {
    const under = t.top - riser;
    const box = boxed(t.pts);
    if (box && under > 0.001) body.push({ pts: box, y0: 0, y1: under });
    // Wholly over the foot's room: boxed to the floor, and no bulkhead comes into it.
    if (box === t.pts || under <= 0.001) {
      carpet.push({ pts: t.pts, y0: Math.max(0, under), y1: t.top });
      return;
    }
    // Split off the parts under each bulkhead; what is left keeps its soffit.
    let rest: V2[][] = [t.pts];
    const covered: { pts: V2[]; bottom: number; cover: V2[] }[] = [];
    for (const c of covers) {
      rest = rest.flatMap((p) => {
        const s = splitConvex(p, c.pts);
        if (s.inside) covered.push({ pts: s.inside, bottom: c.bottom, cover: c.pts });
        return s.outside;
      });
    }
    for (const p of rest) {
      body.push({ pts: p, y0: Math.max(0, under - SOFFIT), y1: under });
      carpet.push({ pts: p, y0: under, y1: t.top });
    }
    for (const c of covered) {
      const B = c.bottom;
      if (t.top <= B + LINING) {
        carpet.push({ pts: c.pts, y0: under, y1: t.top });
        continue;
      }
      if (under >= B) {
        if (under > B + 1e-4) body.push({ pts: c.pts, y0: B, y1: under });
        carpet.push({ pts: c.pts, y0: under, y1: t.top });
        continue;
      }
      body.push({ pts: c.pts, y0: B, y1: B + LINING });
      carpet.push({ pts: c.pts, y0: B + LINING, y1: t.top });
      // The tread it rises from (a flat head's steps on two sides each rise from the square, not the one before).
      const edge =
        treads
          .filter((u, j) => j < k && Math.abs(u.top - (t.top - riser)) < 1e-6)
          .map((u) => riserEdge(t.pts, u.pts))
          .find((e) => e) ?? null;
      if (!edge) continue;
      const [a, b] = edge;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = t.pts.reduce((s, p) => ({ x: s.x + p.x / t.pts.length, y: s.y + p.y / t.pts.length }), { x: 0, y: 0 });
      let n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      if ((mid.x - a.x) * n.x + (mid.y - a.y) * n.y < 0) n = { x: -n.x, y: -n.y };
      const strip = (d0: number, d1: number) => [
        { x: a.x + n.x * d0, y: a.y + n.y * d0 },
        { x: b.x + n.x * d0, y: b.y + n.y * d0 },
        { x: b.x + n.x * d1, y: b.y + n.y * d1 },
        { x: a.x + n.x * d1, y: a.y + n.y * d1 },
      ];
      // Carpet on the riser's face, standing on the tread below; the bulkhead's lining just behind it.
      const face = inCover(strip(-0.0025, 0), c.cover);
      const lining = inCover(strip(0, 0.005), c.cover);
      if (face) carpet.push({ pts: face, y0: under, y1: B + LINING });
      if (lining) body.push({ pts: lining, y0: under - 0.005, y1: B });
    }
  });
  return { body, carpet };
}
