import type { Floor, HouseModel } from "../types";
import { areaOf, buildWalls, cutWall, pointInPolygon, roomWorldPolygon, type V2 } from "./geometry";
import { boxedIn, flightAt as flightPoint, flightL, flightS, headSpans, stairFlights, stairHeight, stairTreads, stepDepth, topStepCount, type Flight } from "./stairs";
import { BULKHEAD_REACH, floorBulkheads, growConvex } from "./bulkhead";

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
 * A flat head's steps up onto the landing are opened too, one more rectangle
 * beside the square for each side they go up from.
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
    const d = stepDepth(flight);
    const steps = d > 0 ? headSpans(flight).map((sp) => rectOf([flightPoint(flight, sp.s0, sp.side * (flight.width / 2)), flightPoint(flight, sp.s1, sp.side * (flight.width / 2 + d))])) : [];
    return { lowerId: flight.lowerId, upperId: flight.upperId, flight, rects: [...(within.length ? within : [full]), ...steps] };
  });
}

const rectOf = ([a, b]: V2[]): Rect => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });

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
      if (pc.y0 > 0.05 || !alongside(a, b, pc.a, pc.b)) continue;
      // Within 0.3 m: tracings put walls at their centre lines, and old walls can be thicker than drawn.
      if (distToSeg(mid, pc.a, pc.b) < 0.3 && distToSeg(m, pc.a, pc.b) < 0.45) return false;
    }
  }
  return true;
}

/** Does wall line p–q run beside side a–b: near parallel, and over at least half of it (a wall ending at its corner doesn't)? */
function alongside(a: V2, b: V2, p: V2, q: V2): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const wl = Math.hypot(q.x - p.x, q.y - p.y);
  if (len < 1e-6 || wl < 1e-6) return false;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  if (Math.abs(u.x * (q.y - p.y) - u.y * (q.x - p.x)) / wl > 0.2) return false;
  const t0 = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
  const t1 = (q.x - a.x) * u.x + (q.y - a.y) * u.y;
  return Math.min(len, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)) >= len / 2;
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

/** Openings a person walks through; a balustrade never runs across one. */
const WALK_THROUGH = new Set(["door", "front", "french", "bifold", "patio", "gap", "archway"]);
/** Room left clear each side of an opening for its lining or frame, metres. */
const FRAME = 0.05;
/**
 * How far an opening's line may sit from a run and still count as on it, metres: closer than this there is no
 * room to step out of the doorway past a rail, so a rail there would only block it.
 */
const ON_LINE = 0.5;
/** Rail pieces shorter than this are dropped, metres. */
const MIN_PIECE = 0.1;

interface Gap {
  centre: V2;
  dir: V2;
  half: number;
}

/** The walk-through openings on a floor, as lines on the plan (world metres). */
function openingGaps(floor: Floor, ceiling: number): Gap[] {
  const gaps: Gap[] = [];
  for (const w of buildWalls(floor))
    for (const p of cutWall(w, ceiling).placements)
      if (WALK_THROUGH.has(p.opening.kind)) gaps.push({ centre: p.centre, dir: p.dir, half: p.width / 2 + FRAME });
  return gaps;
}

/**
 * Cut a run where an opening on its line crosses it, so the rail stops short
 * of the doorway. Pieces end in newels like any run's ends; `foot` gives the
 * newel start for a new end on a flight.
 */
function cutAtOpenings(run: RailRun, gaps: Gap[], foot?: (p: V2, y: number) => number): RailRun[] {
  const dx = run.b.x - run.a.x;
  const dy = run.b.y - run.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [run];
  const u = { x: dx / len, y: dy / len };
  const cuts: [number, number][] = [];
  for (const g of gaps) {
    // Only openings along the run, not walls that meet it side-on.
    if (Math.abs(g.dir.x * u.y - g.dir.y * u.x) > 0.2) continue;
    const rx = g.centre.x - run.a.x;
    const ry = g.centre.y - run.a.y;
    if (Math.abs(rx * u.y - ry * u.x) > ON_LINE) continue;
    const c = rx * u.x + ry * u.y;
    const t0 = Math.max(0, c - g.half);
    const t1 = Math.min(len, c + g.half);
    if (t1 > t0) cuts.push([t0, t1]);
  }
  if (!cuts.length) return [run];
  cuts.sort((p, q) => p[0] - q[0]);
  const keep: [number, number][] = [];
  let cursor = 0;
  for (const [t0, t1] of cuts) {
    if (t0 > cursor) keep.push([cursor, t0]);
    cursor = Math.max(cursor, t1);
  }
  if (cursor < len) keep.push([cursor, len]);
  const out: RailRun[] = [];
  for (const [t0, t1] of keep) {
    if (t1 - t0 < MIN_PIECE) continue;
    const at = (t: number) => {
      const k = t / len;
      const p = { x: run.a.x + dx * k, y: run.a.y + dy * k };
      const y = run.ya + (run.yb - run.ya) * k;
      if (t === 0) return { p: run.a, y: run.ya, f: run.fa };
      if (t === len) return { p: run.b, y: run.yb, f: run.fb };
      return { p, y, f: foot ? foot(p, y) : undefined };
    };
    const pa = at(t0);
    const pb = at(t1);
    const piece: RailRun = { a: pa.p, b: pb.p, ya: pa.y, yb: pb.y };
    if (pa.f !== undefined) piece.fa = pa.f;
    if (pb.f !== undefined) piece.fb = pb.f;
    out.push(piece);
  }
  return out;
}

/**
 * The most a winder beside the far side of a turned head may sit below the floor above for that side to be a
 * step up onto more landing rather than a drop to guard, metres: two risers. (Part K asks for guarding only
 * where the drop is over 600 mm.)
 */
export const STEP_UP = 0.45;

/** A stretch of a flight's side (s from s0 to s1 up the run, side +1 right going up, -1 left) left open to step off. */
export interface SideStep {
  side: -1 | 1;
  s0: number;
  s1: number;
}

/**
 * Where a turned head's far side opens onto more of the landing it arrives on: the stretches along the side
 * away from the turn where the winders beside it are within STEP_UP of the floor above and the same room
 * carries on beyond, with no wall between. They are steps, not drops, so no rail runs there and the walk
 * steps off them. A landing carried past the head to a room beyond it is reached this way.
 */
export function headSideSteps(model: HouseModel, well: Stairwell): SideStep[] {
  const f = well.flight;
  const upper = model.floors.find((u) => u.id === well.upperId);
  // A flat head has steps up on that side instead (headStepSpans).
  if (!f.topTurn || topStepCount(f) || !upper) return [];
  const side = -f.topTurn as -1 | 1;
  const hw = f.width / 2;
  const treads = stairTreads(f);
  const rooms = upper.rooms.map((r) => roomWorldPolygon(upper, r));
  const inWell = (p: V2) => well.rects.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1);
  const ok = (s: number) => {
    const inside = flightPoint(f, s, side * (hw - 0.05));
    const beyond = flightPoint(f, s, side * (hw + 0.3));
    const tread = treads.find((t) => pointInPolygon(inside, t.pts));
    if (!tread || f.rise - tread.top > STEP_UP + 1e-6 || !inWell(inside)) return false;
    return rooms.some((poly) => pointInPolygon(beyond, poly) && pointInPolygon(inside, poly));
  };
  const out: SideStep[] = [];
  const s0 = f.run - f.width;
  const n = Math.max(1, Math.ceil(f.width / 0.02));
  let from = -1;
  for (let k = 0; k <= n + 1; k++) {
    const s = s0 + (f.width * Math.min(k, n)) / n;
    const good = k <= n && ok(s);
    if (good && from < 0) from = s;
    if (!good && from >= 0) {
      const to = s0 + (f.width * (k - 1)) / n;
      const a = flightPoint(f, from, side * hw);
      const b = flightPoint(f, to, side * hw);
      if (to - from >= 0.2 && openSide(upper, a, b, { x: -f.dir.y * side, y: f.dir.x * side }, model.ceilingHeight)) out.push({ side, s0: from, s1: to });
      from = -1;
    }
  }
  return out;
}

/** What is left of [a, b] once the stretches in `cut` are taken out. */
function subtractSpans(a: number, b: number, cut: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[a, b]];
  for (const [c0, c1] of cut)
    parts = parts.flatMap(([p0, p1]): [number, number][] => (c1 <= p0 || c0 >= p1 ? [[p0, p1]] : ([[p0, c0], [c1, p1]] as [number, number][]).filter(([q0, q1]) => q1 - q0 > 1e-3)));
  return parts;
}

/**
 * Balustrades for a stairwell: along the open sides of the flight on the
 * floor below, and round the open edges of the opening on the floor above,
 * leaving the top of the flight open to step off: its end when it arrives
 * straight, the side it turns to when its head winds onto the landing.
 * Runs are cut short of any doorway on their line, and leave a turned head's
 * far side open where it is a step up onto more landing (headSideSteps). A flat
 * head is open along each side it has steps up from, and its steps' far edges.
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
  // A newel over a room the flight passes over hangs from its soffit, or stops at the underside of a bulkhead boxing
  // the flight in there, like the flight itself.
  const covers = floorBulkheads(lower, model.ceilingHeight).map((b) => ({ pts: growConvex(b.pts, BULKHEAD_REACH), bottom: b.bottom }));
  const newelFoot = (p: V2, y: number) => {
    if (boxed(p)) return 0;
    const hung = Math.max(0, y - NEWEL_DROP);
    return covers.reduce((h, c) => (pointInPolygon(p, c.pts) ? Math.max(h, c.bottom) : h), hung);
  };
  const lowerGaps = openingGaps(lower, model.ceilingHeight);
  const upperGaps = openingGaps(upper, model.ceilingHeight);
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
    const run: RailRun = { a, b, ya, yb, fa: newelFoot(a, ya), fb: newelFoot(b, yb) };
    out.lower.push(...cutAtOpenings(run, lowerGaps, newelFoot));
  }
  const steps = headSideSteps(model, well);
  const spans = headSpans(f);
  const hw = f.width / 2;
  const reach = hw + stepDepth(f);
  /** Stretches (s) of the side at l (on the `sign` side) that are a way up onto the landing, not a drop. */
  const openAlong = (l: number, sign: number): [number, number][] => {
    const cut: [number, number][] = [];
    // The side a turned head winds onto the landing.
    if (f.topTurn && sign === f.topTurn && !spans.length) cut.push([headStart, f.run]);
    for (const st of steps) if (st.side === sign && Math.abs(l - sign * hw) < 0.03) cut.push([st.s0, st.s1]);
    // A flat head's square along its steps, and the steps' far edge.
    for (const sp of spans) if (sp.side === sign && (Math.abs(l - sign * hw) < 0.03 || Math.abs(l - sign * reach) < 0.03)) cut.push([sp.s0, sp.s1]);
    return cut;
  };
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
      // Where the head steps off onto the landing stays open.
      for (const [p0, p1] of subtractSpans(s0, s1, openAlong(l, sign))) if (p1 - p0 > 0.05) edges.push([flightPoint(f, p0, l), flightPoint(f, p1, l), side(sign)]);
    }
    edges.push([flightPoint(f, s0, l0), flightPoint(f, s0, l1), { x: -f.dir.x, y: -f.dir.y }]);
    // A turned head's far end is guarded too (usually it is against a wall).
    if (f.topTurn) edges.push([flightPoint(f, s1, l0), flightPoint(f, s1, l1), f.dir]);
    for (const [a, b, dir] of edges) {
      // An edge shared with another part of the same opening (it spans two rooms) is not an edge.
      const m = { x: (a.x + b.x) / 2 + dir.x * 0.15, y: (a.y + b.y) / 2 + dir.y * 0.15 };
      if (well.rects.some((o) => o !== r && m.x > o.x0 && m.x < o.x1 && m.y > o.y0 && m.y < o.y1)) continue;
      if (openSide(upper, a, b, dir, model.ceilingHeight)) out.upper.push(...cutAtOpenings({ a, b, ya: 0, yb: 0 }, upperGaps));
    }
  }
  return out;
}
