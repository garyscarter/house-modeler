import type { Chimney, Exterior, Floor, HouseModel, Pt, Room } from "../types";
import { DEFAULT_EXTERIOR } from "../types";
import { EXT_WALL_T, bbox, modelBounds, pointInPolygon, roomWorldPolygon, toWorld, type V2 } from "./geometry";

/** How a roof ends along its ridge: hipped, a gable wall with a verge overhang, or flush against a party wall. */
export type RoofEnd = "hip" | "gable" | "flush";

/** A pitched roof over a rectangle of walls. */
export interface RoofBlock {
  /** Wall centre lines, world metres (z = plan y). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height of the wall tops the roof sits on. */
  y: number;
  /** Ridge direction. */
  axis: "x" | "z";
  pitchDeg: number;
  overhang: number;
  /** End treatment at the low and high ends of the ridge axis. */
  start: RoofEnd;
  end: RoofEnd;
  /** Wall thickness; the roof surface passes through the outer top edge of the walls. Default EXT_WALL_T. */
  wallT?: number;
  /** Lift the roof surface this far clear of the walls' outer top edge, so the two never coincide. Default 0. */
  clearance?: number;
  /**
   * Seat the roof as rafters on a wall plate are: its eaves (the tile line at
   * the fascias) level with the wall tops, plus `clearance`, so the soffit
   * sits a fascia's depth under the wall tops, just above the top-floor
   * window heads, whatever the pitch and overhang. Otherwise the roof surface
   * passes through the walls' outer top edge and its eaves drop below it by
   * the overhang's fall.
   */
  eavesOnWalls?: boolean;
  /**
   * How far the slopes run on past a flush start and end, under the roof
   * they meet (an extension's roof tucked in under the main roof's hip or
   * behind its gable). The walls, fascias and gutters still stop at the end.
   */
  tuck?: [number, number];
}

export type P3 = [number, number, number];

export interface RoofMesh {
  /** Roof slope triangles as flat xyz triplets, wound to face upwards. */
  slopes: number[];
  /** Texture coordinates for `slopes` in metres: along the eaves, and up the slope from the eaves. */
  slopeUVs: number[];
  /** Vertical gable-end triangles (drawn in the wall colour), wound to face outwards. */
  gables: number[];
  ridgeY: number;
  eavesY: number;
  /** Ridge end points [x, y, z]; equal when the roof is a pyramid. */
  ridge: [P3, P3];
  /** Hip lines, from the eaves corner up to the ridge end. */
  hips: [P3, P3][];
  /** Eaves outline in world x/z, for fascias and gutters. */
  eaves: [number, number][];
}

/** Local measurements of a block: u runs along the ridge, v across it, h is height. */
interface Frame {
  /** Height of the roof surface over the outer face of the walls. */
  y: number;
  t: number;
  cos: number;
  /** Outer wall faces (U is the wall line itself at a flush end). */
  U0: number;
  U1: number;
  V0: number;
  V1: number;
  /** Eaves outline. */
  EU0: number;
  EU1: number;
  EV0: number;
  EV1: number;
  /** Ridge ends. */
  RU0: number;
  RU1: number;
  vm: number;
  ridgeY: number;
  eavesY: number;
  /** Local (u, h, v) to world (x, y, z). Also maps directions. */
  W: (u: number, h: number, v: number) => P3;
  /** Local (u, v) of a world point. */
  L: (x: number, z: number) => [number, number];
}

/** Height of the roof surface over the walls' outer faces (the eaves are the overhang's fall below it). */
export function roofSeatY(b: RoofBlock): number {
  const lift = b.eavesOnWalls ? b.overhang * Math.tan((b.pitchDeg * Math.PI) / 180) : 0;
  return b.y + (b.clearance ?? 0) + lift;
}

function frame(b: RoofBlock): Frame {
  const half = (b.wallT ?? EXT_WALL_T) / 2;
  const t = Math.tan((b.pitchDeg * Math.PI) / 180);
  const o = b.overhang;
  const [u0, u1, v0, v1] = b.axis === "x" ? [b.x0, b.x1, b.z0, b.z1] : [b.z0, b.z1, b.x0, b.x1];
  const U0 = b.start === "flush" ? u0 : u0 - half;
  const U1 = b.end === "flush" ? u1 : u1 + half;
  const V0 = v0 - half;
  const V1 = v1 + half;
  const hs = (V1 - V0) / 2;
  const EU0 = b.start === "flush" ? U0 - (b.tuck?.[0] ?? 0) : U0 - o;
  const EU1 = b.end === "flush" ? U1 + (b.tuck?.[1] ?? 0) : U1 + o;
  let RU0 = b.start === "hip" ? U0 + hs : EU0;
  let RU1 = b.end === "hip" ? U1 - hs : EU1;
  if (RU0 > RU1) RU0 = RU1 = (RU0 + RU1) / 2;
  const y = roofSeatY(b);
  return {
    y,
    t,
    cos: Math.cos((b.pitchDeg * Math.PI) / 180),
    U0,
    U1,
    V0,
    V1,
    EU0,
    EU1,
    EV0: V0 - o,
    EV1: V1 + o,
    RU0,
    RU1,
    vm: (V0 + V1) / 2,
    ridgeY: y + hs * t,
    eavesY: y - o * t,
    W: (u, h, v) => (b.axis === "x" ? [u, h, v] : [v, h, u]),
    L: (x, z) => (b.axis === "x" ? [x, z] : [z, x]),
  };
}

/** Push a triangle wound so its normal points along `outward`; uv (if given) follows the same order. */
function pushTri(out: number[], a: P3, b: P3, c: P3, outward: P3, uvOut?: number[], uv?: [number, number][]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-9) return; // degenerate (pyramid ridge)
  const flip = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0;
  out.push(...a, ...(flip ? c : b), ...(flip ? b : c));
  if (uvOut && uv) uvOut.push(...uv[0], ...(flip ? uv[2] : uv[1]), ...(flip ? uv[1] : uv[2]));
}

/** Push a convex planar polygon (fan) facing `outward`. */
export function pushPoly(out: number[], pts: P3[], outward: P3, uvOut?: number[], uv?: [number, number][]) {
  for (let i = 1; i + 1 < pts.length; i++) {
    pushTri(out, pts[0], pts[i], pts[i + 1], outward, uvOut, uv && [uv[0], uv[i], uv[i + 1]]);
  }
}

/**
 * Triangles for a hipped or gabled roof. Built in a local frame (u along the
 * ridge, v across) and mapped to world space. The slopes pass through the
 * outer top edge of the walls, so no wall pokes through, and overhang the
 * walls by `overhang` (none at a flush end).
 */
export function roofGeometry(b: RoofBlock): RoofMesh {
  const f = frame(b);
  const { W, cos, U0, U1, V0, V1, EU0, EU1, EV0, EV1, RU0, RU1, vm, ridgeY, eavesY } = f;
  const up: P3 = [0, 1, 0];
  const slopes: number[] = [];
  const slopeUVs: number[] = [];
  const gables: number[] = [];
  type L3 = [number, number, number];
  // A slope face from local points, with UVs in metres so tile courses run parallel to its eaves.
  const face = (pts: L3[], uv: (u: number, v: number) => [number, number]) =>
    pushPoly(
      slopes,
      pts.map((p) => W(...p)),
      up,
      slopeUVs,
      pts.map((p) => uv(p[0], p[2])),
    );
  const r0: L3 = [RU0, ridgeY, vm];
  const r1: L3 = [RU1, ridgeY, vm];
  // Long slopes.
  face([[EU0, eavesY, EV0], [EU1, eavesY, EV0], r1, r0], (u, v) => [u, (v - EV0) / cos]);
  face([[EU1, eavesY, EV1], [EU0, eavesY, EV1], r0, r1], (u, v) => [-u, (EV1 - v) / cos]);
  // Ends.
  const hips: [P3, P3][] = [];
  const endFace = (kind: RoofEnd, U: number, EU: number, R: L3, sign: number) => {
    if (kind === "hip") {
      face([[EU, eavesY, EV0], [EU, eavesY, EV1], R], (u, v) => [sign * v, (sign * (EU - u)) / cos]);
      hips.push([W(EU, eavesY, EV0), W(...R)], [W(EU, eavesY, EV1), W(...R)]);
    } else {
      // With no clearance the pentagon collapses to the gable triangle (degenerate pieces are dropped).
      pushPoly(gables, [W(U, b.y, V0), W(U, b.y, V1), W(U, f.y, V1), W(U, ridgeY, vm), W(U, f.y, V0)], W(sign, 0, 0));
    }
  };
  // A tucked flush end closes where its slopes stop, inside the roof it runs under.
  endFace(b.start, b.start === "flush" ? EU0 : U0, EU0, r0, -1);
  endFace(b.end, b.end === "flush" ? EU1 : U1, EU1, r1, 1);

  const eaves: [number, number][] = [
    [EU0, EV0],
    [EU1, EV0],
    [EU1, EV1],
    [EU0, EV1],
  ].map(([u, v]) => {
    const p = W(u, 0, v);
    return [p[0], p[2]];
  });
  return { slopes, slopeUVs, gables, ridgeY, eavesY, ridge: [W(...r0), W(...r1)], hips, eaves };
}

/**
 * Height of the roof surface above a world point, or null when the point is
 * outside the eaves. With `pastFlush`, the slopes carry on past a flush end,
 * as the attached neighbour's roof does.
 */
export function roofHeightAt(b: RoofBlock, x: number, z: number, pastFlush = false): number | null {
  const f = frame(b);
  const [u, v] = f.L(x, z);
  const lo = pastFlush && b.start === "flush" ? -Infinity : f.EU0 - 1e-6;
  const hi = pastFlush && b.end === "flush" ? Infinity : f.EU1 + 1e-6;
  if (u < lo || u > hi || v < f.EV0 - 1e-6 || v > f.EV1 + 1e-6) return null;
  let d = Math.min(v - f.V0, f.V1 - v);
  if (b.start === "hip") d = Math.min(d, u - f.U0);
  if (b.end === "hip") d = Math.min(d, f.U1 - u);
  return f.y + d * f.t;
}

/** Depth of fascias and bargeboards below the tile line, metres. */
export const FASCIA_DEPTH = 0.22;
/** Half-round gutter radius (112 mm gutter). */
export const GUTTER_R = 0.056;
export const PIPE_R = 0.034;
/** Tiles overhang the fascia and bargeboards by this much. */
const INSET = 0.03;
/** Fascia and bargeboard thickness. */
const BOARD = 0.025;

/** A downpipe: the swan neck from the gutter outlet to the wall, then straight down from its last point. */
export interface Downpipe {
  path: P3[];
}

/**
 * A downpipe from a gutter whose centre line is `gutterOut` out from the wall
 * line, at rim height `yg`: the outlet, then a swan neck under the soffit at
 * `ys` back to the wall. `at(d, h)` places a point d out from the wall line at
 * height h.
 */
function swanNeck(at: (d: number, h: number) => P3, gutterOut: number, yg: number, ys: number): Downpipe {
  const dp = PIPE_R + 0.02;
  const outlet = at(gutterOut, yg - GUTTER_R);
  if (Math.abs(gutterOut - dp) < 0.05) return { path: [outlet] };
  return { path: [outlet, at(gutterOut, ys - 0.06), at(dp, ys - 0.06 - 0.8 * Math.abs(gutterOut - dp))] };
}

/** A downpipe placed at a point further than this from every guttered wall is dropped. */
export const DOWNPIPE_REACH = 1;

/**
 * Where a downpipe at world (x, z) goes on a pitched roof block: the guttered
 * wall it is nearest whose run covers it, a long side ("lo" / "hi": the low
 * or high v side) or a hip end ("start" / "end"), with the distance along that
 * wall in the block's local frame (u along the ridge, v across) and the
 * distance from the wall line. Null when no such wall is within
 * DOWNPIPE_REACH (gable and party-wall ends have no gutter).
 */
export function downpipeSpot(b: RoofBlock, x: number, z: number): { side: "lo" | "hi" | "start" | "end"; along: number; dist: number } | null {
  const f = frame(b);
  const [u, v] = f.L(x, z);
  const tol = 0.05;
  const found: { side: "lo" | "hi" | "start" | "end"; along: number; dist: number }[] = [];
  if (u > f.U0 - tol && u < f.U1 + tol) found.push({ side: "lo", along: u, dist: Math.abs(v - f.V0) }, { side: "hi", along: u, dist: Math.abs(v - f.V1) });
  if (v > f.V0 - tol && v < f.V1 + tol) {
    if (b.start === "hip") found.push({ side: "start", along: v, dist: Math.abs(u - f.U0) });
    if (b.end === "hip") found.push({ side: "end", along: v, dist: Math.abs(u - f.U1) });
  }
  const best = found.sort((p, q) => p.dist - q.dist)[0];
  return best && best.dist <= DOWNPIPE_REACH ? best : null;
}

/** Eaves and verge detailing for a pitched roof block. */
export interface RoofTrim {
  /** Fascias, soffits, bargeboards and box ends, drawn in the fascia colour. */
  trim: number[];
  /** Gutter centre lines at rim height. */
  gutters: [P3, P3][];
  downpipes: Downpipe[];
  /** Ridge and hip lines for the capping tiles. */
  caps: [P3, P3][];
}

/**
 * Fascia boards, soffits and gutters along the eaves; bargeboards and the
 * verge soffit on gable ends; box ends where the eaves box stops; ridge and
 * hip lines. A flush (party wall) end gets none of these, only a closure so
 * the eaves box is not open to view. Downpipes go at a wall corner of each
 * long side, or, given `spots` (world x, z), at those points instead, each on
 * the guttered wall it is nearest (see downpipeSpot).
 */
export function roofTrim(b: RoofBlock, spots?: [number, number][]): RoofTrim {
  const f = frame(b);
  const { W, t, U0, U1, V0, V1, EU0, EU1, EV0, EV1, vm, ridgeY, eavesY, RU0, RU1 } = f;
  const trim: number[] = [];
  const gutters: [P3, P3][] = [];
  const downpipes: Downpipe[] = [];
  type L3 = [number, number, number];
  const poly = (pts: L3[], outward: L3) => pushPoly(trim, pts.map((p) => W(...p)), W(...outward));
  const ys = eavesY - FASCIA_DEPTH;
  const flushS = b.start === "flush";
  const flushE = b.end === "flush";

  // Fascia faces sit just inside the tile edge, but never against the wall face (no overhang).
  const sides = [
    { V: V0, EV: EV0, s: -1 },
    { V: V1, EV: EV1, s: 1 },
  ].map(({ V, EV, s }) => {
    let vfo = EV - s * INSET;
    if (s * (vfo - V) < BOARD + 0.002) vfo = V + s * (BOARD + 0.002);
    return { V, EV, s, vfo, vfi: vfo - s * BOARD };
  });
  // Height of the tiles at local v on a long slope.
  const top = (v: number) => f.y + Math.min(v - V0, V1 - v) * t;

  for (const { V, EV, s, vfo, vfi } of sides) {
    const ua = flushS ? U0 : EU0 + INSET;
    const ub = flushE ? U1 : EU1 - INSET;
    poly([[ua, eavesY, vfo], [ub, eavesY, vfo], [ub, ys, vfo], [ua, ys, vfo]], [0, 0, s]);
    poly([[ua, ys, vfo], [ub, ys, vfo], [ub, ys, vfi], [ua, ys, vfi]], [0, -1, 0]);
    // Soffit back to the wall, mitred at hips; at a gable it stops at the gable wall.
    if (s * (vfi - V) > 0.01) {
      const sa = b.start === "hip" ? EU0 + INSET + BOARD : U0;
      const sb = b.end === "hip" ? EU1 - INSET - BOARD : U1;
      poly([[sa, ys, vfi], [sb, ys, vfi], [U1, ys, V], [U0, ys, V]], [0, -1, 0]);
      // Box ends: close the eaves box under the verge soffit.
      if (b.start === "gable") poly([[U0, ys, vfi], [U0, ys, V], [U0, top(V) - FASCIA_DEPTH, V], [U0, top(vfi) - FASCIA_DEPTH, vfi]], [-1, 0, 0]);
      if (b.end === "gable") poly([[U1, ys, vfi], [U1, ys, V], [U1, top(V) - FASCIA_DEPTH, V], [U1, top(vfi) - FASCIA_DEPTH, vfi]], [1, 0, 0]);
    }
    // Flush ends: close the eaves box section in case no neighbour is drawn.
    if (flushS) poly([[U0, eavesY, EV], [U0, ys, vfo], [U0, ys, V], [U0, f.y, V]], [-1, 0, 0]);
    if (flushE) poly([[U1, eavesY, EV], [U1, ys, vfo], [U1, ys, V], [U1, f.y, V]], [1, 0, 0]);

    // Gutter just outside the fascia, its rim tucked under the tile edge.
    const vg = vfo + s * GUTTER_R;
    const yg = eavesY - 0.03;
    const ga = b.start === "hip" ? EU0 + INSET - GUTTER_R : flushS ? U0 : EU0;
    const gb = b.end === "hip" ? EU1 - INSET + GUTTER_R : flushE ? U1 : EU1;
    gutters.push([W(ga, yg, vg), W(gb, yg, vg)]);

    // Downpipes at a wall corner, preferring an end away from the party wall; long runs get one at each end.
    if (spots) continue;
    const ends: ("start" | "end")[] = U1 - U0 > 9 ? ["start", "end"] : [flushS && !flushE ? "end" : "start"];
    for (const e of ends) {
      const up = e === "start" ? U0 + 0.15 : U1 - 0.15;
      downpipes.push(swanNeck((d, h) => W(up, h, V + s * d), s * (vg - V), yg, ys));
    }
  }

  // Downpipes at the given spots, on the long side or hip end each is nearest.
  for (const [x, z] of spots ?? []) {
    const at = downpipeSpot(b, x, z);
    if (!at) continue;
    const along = (lo: number, hi: number) => Math.min(Math.max(at.along, lo + 0.12), hi - 0.12);
    const yg = eavesY - 0.03;
    if (at.side === "lo" || at.side === "hi") {
      const { V, s, vfo } = sides[at.side === "lo" ? 0 : 1];
      const up = along(U0, U1);
      downpipes.push(swanNeck((d, h) => W(up, h, V + s * d), s * (vfo - V) + GUTTER_R, yg, ys));
    } else {
      const sign = at.side === "start" ? -1 : 1;
      const [U, EU] = at.side === "start" ? [U0, EU0] : [U1, EU1];
      const vp = along(V0, V1);
      downpipes.push(swanNeck((d, h) => W(U + sign * d, h, vp), sign * (EU - sign * INSET - U) + GUTTER_R, yg, ys));
    }
  }

  // Hip ends: fascia, soffit and gutter across the end.
  for (const [kind, EU, U, sign] of [
    [b.start, EU0, U0, -1],
    [b.end, EU1, U1, 1],
  ] as const) {
    if (kind !== "hip") continue;
    const ufo = EU - sign * INSET;
    const ufi = ufo - sign * BOARD;
    const [a, c] = sides;
    poly([[ufo, eavesY, a.vfo], [ufo, eavesY, c.vfo], [ufo, ys, c.vfo], [ufo, ys, a.vfo]], [sign, 0, 0]);
    poly([[ufo, ys, a.vfo], [ufo, ys, c.vfo], [ufi, ys, c.vfo], [ufi, ys, a.vfo]], [0, -1, 0]);
    if (sign * (ufi - U) > 0.01) poly([[ufi, ys, a.vfi], [ufi, ys, c.vfi], [U, ys, V1], [U, ys, V0]], [0, -1, 0]);
    const ug = ufo + sign * GUTTER_R;
    gutters.push([W(ug, eavesY - 0.03, a.vfo - GUTTER_R), W(ug, eavesY - 0.03, c.vfo + GUTTER_R)]);
  }

  // Gable ends: bargeboards up both verges, with the verge soffit back to the gable wall.
  for (const [kind, EU, U, sign] of [
    [b.start, EU0, U0, -1],
    [b.end, EU1, U1, 1],
  ] as const) {
    if (kind !== "gable") continue;
    const ubo = EU - sign * INSET;
    const ubi = ubo - sign * BOARD;
    for (const { vfo, vfi, s } of sides) {
      const tb = (v: number) => top(v) - 0.015;
      const lo = (v: number) => top(v) - FASCIA_DEPTH;
      poly([[ubo, tb(vfo), vfo], [ubo, tb(vm), vm], [ubo, lo(vm), vm], [ubo, lo(vfo), vfo]], [sign, 0, 0]);
      poly([[ubo, lo(vfo), vfo], [ubo, lo(vm), vm], [ubi, lo(vm), vm], [ubi, lo(vfo), vfo]], [0, -1, 0]);
      poly([[ubo, tb(vfo), vfo], [ubi, tb(vfo), vfo], [ubi, lo(vfo), vfo], [ubo, lo(vfo), vfo]], [0, 0, s]);
      if (sign * (U - ubi) < -0.01) poly([[ubi, lo(vfi), vfi], [U, lo(vfi), vfi], [U, lo(vm), vm], [ubi, lo(vm), vm]], [0, -1, 0]);
    }
  }

  const caps: [P3, P3][] = [];
  if (RU1 - RU0 > 0.01) caps.push([W(RU0, ridgeY, vm), W(RU1, ridgeY, vm)]);
  caps.push(...roofGeometry(b).hips);
  return { trim, gutters, downpipes, caps };
}

// ---------------------------------------------------------------------------
// Where pitched roofs meet

/** A half-space: the points p with n . p + d < 0. */
export interface Half {
  n: P3;
  d: number;
}

const dot3 = (n: P3, p: P3) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2];
const lerp3 = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Twice the area of a planar polygon. */
function polyArea(pts: P3[]): number {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const [a, b, c] = [pts[0], pts[i], pts[i + 1]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    x += u[1] * v[2] - u[2] * v[1];
    y += u[2] * v[0] - u[0] * v[2];
    z += u[0] * v[1] - u[1] * v[0];
  }
  return Math.hypot(x, y, z);
}

interface Piece {
  pts: P3[];
  uv?: [number, number][];
}

/** The part of a convex polygon inside (n . p + d <= 0) or outside a half-space, its uvs carried along; vertex order is kept. */
function clipPiece(p: Piece, h: Half, inside: boolean): Piece {
  const side = (q: P3) => (dot3(h.n, q) + h.d) * (inside ? 1 : -1);
  const pts: P3[] = [];
  const uv: [number, number][] = [];
  const n = p.pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [a, b] = [p.pts[i], p.pts[j]];
    const [sa, sb] = [side(a), side(b)];
    if (sa <= 0) {
      pts.push(a);
      if (p.uv) uv.push(p.uv[i]);
    }
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      pts.push(lerp3(a, b, t));
      if (p.uv) uv.push([p.uv[i][0] + (p.uv[j][0] - p.uv[i][0]) * t, p.uv[i][1] + (p.uv[j][1] - p.uv[i][1]) * t]);
    }
  }
  return { pts, uv: p.uv ? uv : undefined };
}

/** Convex pieces of a convex polygon outside a convex region (where every half-space holds); none overlap. */
export function subtractRegion(p: Piece, region: Half[]): Piece[] {
  const out: Piece[] = [];
  let rest = p;
  for (const h of region) {
    const outside = clipPiece(rest, h, false);
    if (outside.pts.length >= 3 && polyArea(outside.pts) > 1e-8) out.push(outside);
    rest = clipPiece(rest, h, true);
    if (rest.pts.length < 3 || polyArea(rest.pts) <= 1e-8) return out;
  }
  return out;
}

/** The parts of segment a-b outside a convex region, dropping slivers shorter than 5 mm. */
export function subtractSegment(a: P3, b: P3, region: Half[]): [P3, P3][] {
  let t0 = 0;
  let t1 = 1;
  for (const h of region) {
    const sa = dot3(h.n, a) + h.d;
    const sb = dot3(h.n, b) + h.d;
    if (Math.abs(sb - sa) < 1e-12) {
      if (sa >= 0) return [[a, b]];
      continue;
    }
    const t = sa / (sa - sb);
    if (sb > sa) t1 = Math.min(t1, t);
    else t0 = Math.max(t0, t);
  }
  if (t1 <= t0) return [[a, b]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const out: [P3, P3][] = [];
  if (t0 * len > 5e-3) out.push([a, lerp3(a, b, t0)]);
  if ((1 - t1) * len > 5e-3) out.push([lerp3(a, b, t1), b]);
  return out;
}

/** Cut a triangle soup (with optional uv pairs) by a convex region, keeping what lies outside it. */
function subtractSoup(pos: number[], uv: number[] | undefined, region: Half[]): { pos: number[]; uv: number[] } {
  const out = { pos: [] as number[], uv: [] as number[] };
  for (let i = 0, k = 0; i + 8 < pos.length; i += 9, k += 6) {
    const pts: P3[] = [
      [pos[i], pos[i + 1], pos[i + 2]],
      [pos[i + 3], pos[i + 4], pos[i + 5]],
      [pos[i + 6], pos[i + 7], pos[i + 8]],
    ];
    const tri: Piece = {
      pts,
      uv: uv && [
        [uv[k], uv[k + 1]],
        [uv[k + 2], uv[k + 3]],
        [uv[k + 4], uv[k + 5]],
      ],
    };
    for (const piece of subtractRegion(tri, region)) {
      for (let j = 1; j + 1 < piece.pts.length; j++) {
        out.pos.push(...piece.pts[0], ...piece.pts[j], ...piece.pts[j + 1]);
        if (piece.uv) out.uv.push(...piece.uv[0], ...piece.uv[j], ...piece.uv[j + 1]);
      }
    }
  }
  return out;
}

/** Which outline of a block a region follows: its tiles, its walls' outer faces, its fascias, or its gutters. */
type Outline = "tiles" | "walls" | "fascias" | "gutters";

/**
 * The space a pitched roof block takes up, for cutting away what another roof
 * has inside it: within an outline in plan, and (unless `plan` only) under its
 * tiles. `grow` widens the outline and lifts the tiles a little, so that whatever
 * lies exactly on them counts as inside (negative: only what is clearly inside).
 * Under a gable's verge is not inside: the verge overhangs open air.
 */
export function blockRegion(b: RoofBlock, outline: Outline, grow: number, plan = false): Half[] {
  const f = frame(b);
  const { t, U0, U1, V0, V1, EU0, EU1, EV0, EV1 } = f;
  const hip0 = b.start === "hip";
  const hip1 = b.end === "hip";
  let [u0, u1, v0, v1] = [U0, U1, V0, V1];
  if (outline === "tiles") [u0, u1, v0, v1] = [b.start === "gable" ? U0 : EU0, b.end === "gable" ? U1 : EU1, EV0, EV1];
  else if (outline !== "walls") {
    const r = outline === "gutters" ? GUTTER_R : 0;
    u0 = hip0 ? EU0 + INSET - r : b.start === "flush" ? EU0 : U0;
    u1 = hip1 ? EU1 - INSET + r : b.end === "flush" ? EU1 : U1;
    v0 = EV0 + INSET - r;
    v1 = EV1 - INSET + r;
  }
  // Local (u, y, v) normal to world.
  const N = (nu: number, ny: number, nv: number): P3 => (b.axis === "x" ? [nu, ny, nv] : [nv, ny, nu]);
  const out: Half[] = [
    { n: N(-1, 0, 0), d: u0 - grow },
    { n: N(1, 0, 0), d: -u1 - grow },
    { n: N(0, 0, -1), d: v0 - grow },
    { n: N(0, 0, 1), d: -v1 - grow },
  ];
  if (plan) return out;
  // Under each slope plane, y < c + a u + e v (the roof surface is the lowest of them).
  const under = (a: number, e: number, c: number): Half => ({ n: N(-a, 1, -e), d: -c - grow });
  out.push(under(0, t, f.y - V0 * t), under(0, -t, f.y + V1 * t));
  if (hip0) out.push(under(t, 0, f.y - U0 * t));
  if (hip1) out.push(under(-t, 0, f.y + U1 * t));
  return out;
}

/** Depth of the slab under a verge's tiles that tiles of another roof coinciding with them fall in. */
const VERGE_SLAB = 0.01;

/**
 * Thin slabs just under a block's verge tiles, one per half of each gable
 * end: another roof's tiles lying in one (an extension's slope carrying on
 * the same plane under the verge) duplicate the verge's and are cut away,
 * while lower ones, which the verge overhangs, stay.
 */
function vergeSlabs(b: RoofBlock, grow: number): Half[][] {
  const f = frame(b);
  const { t, U0, U1, V0, V1, EU0, EU1, EV0, EV1, vm } = f;
  const N = (nu: number, ny: number, nv: number): P3 => (b.axis === "x" ? [nu, ny, nv] : [nv, ny, nu]);
  const out: Half[][] = [];
  for (const [kind, ua, ub] of [
    [b.start, EU0, U0],
    [b.end, U1, EU1],
  ] as const) {
    if (kind !== "gable") continue;
    for (const [va, vb, e, c] of [
      [EV0, vm, t, f.y - V0 * t],
      [vm, EV1, -t, f.y + V1 * t],
    ]) {
      out.push([
        { n: N(-1, 0, 0), d: ua - grow },
        { n: N(1, 0, 0), d: -ub - grow },
        { n: N(0, 0, -1), d: va - grow },
        { n: N(0, 0, 1), d: -vb - grow },
        // Under the slope plane y = c + e v (lifted by grow), and above it less the slab depth.
        { n: N(0, 1, -e), d: -c - grow },
        { n: N(0, -1, e), d: c - VERGE_SLAB },
      ]);
    }
  }
  return out;
}

/**
 * Half-spaces splitting a block at the wall lines of its tucked ends: `within`
 * keeps between them, and each of `beyond` is the part past one tucked end.
 */
function tuckHalves(b: RoofBlock): { within: Half[]; beyond: Half[] } {
  const f = frame(b);
  const N = (nu: number): P3 => (b.axis === "x" ? [nu, 0, 0] : [0, 0, nu]);
  const within: Half[] = [];
  const beyond: Half[] = [];
  if (b.start === "flush" && (b.tuck?.[0] ?? 0) > 0) {
    within.push({ n: N(-1), d: f.U0 });
    beyond.push({ n: N(1), d: -f.U0 });
  }
  if (b.end === "flush" && (b.tuck?.[1] ?? 0) > 0) {
    within.push({ n: N(1), d: -f.U1 });
    beyond.push({ n: N(-1), d: f.U1 });
  }
  return { within, beyond };
}

/**
 * The regions of block `o`'s tiles that cut block `b`'s slopes: its own tiles
 * and verge slabs. Where `o` is tucked in under `b`, the part past its end
 * wall counts only inside `b`'s walls: out under `b`'s eaves, `b` is the roof.
 */
function tileRegions(o: RoofBlock, b: RoofBlock, oUnderB: boolean, grow: number): Half[][] {
  const tiles = blockRegion(o, "tiles", grow);
  const { within, beyond } = tuckHalves(o);
  if (!beyond.length) return [tiles, ...vergeSlabs(o, grow)];
  const walls = oUnderB ? blockRegion(b, "walls", 0, true) : null;
  return [[...tiles, ...within], ...(walls ? beyond.map((h) => [...tiles, h, ...walls]) : []), ...vergeSlabs(o, grow)];
}

/** Whether two blocks' eaves overlap in plan. */
function eavesOverlap(a: RoofBlock, b: RoofBlock): boolean {
  const box = (k: RoofBlock) => {
    const f = frame(k);
    const p = f.W(f.EU0, 0, f.EV0);
    const q = f.W(f.EU1, 0, f.EV1);
    return [Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[2], q[2]), Math.max(p[2], q[2])];
  };
  const [ax0, ax1, az0, az1] = box(a);
  const [bx0, bx1, bz0, bz1] = box(b);
  return Math.min(ax1, bx1) > Math.max(ax0, bx0) && Math.min(az1, bz1) > Math.max(az0, bz0);
}

/** One pitched roof block's drawing, cut where other roofs cover it. */
export interface JoinedRoof {
  slopes: number[];
  slopeUVs: number[];
  gables: number[];
  trim: number[];
  gutters: [P3, P3][];
  downpipes: Downpipe[];
  caps: [P3, P3][];
}

const JOIN_EPS = 0.002;
/** An earlier roof's ridge or hip line this close under a later roof's slope lies in it. */
const CAP_SLAB = 0.005;

/**
 * Block `i`'s slopes and detailing with whatever lies inside the other
 * blocks taken away, so roofs that meet (an extension's roof run in under
 * the main roof's hip) show one surface with valleys where they cross,
 * and nothing hangs inside the rooms under the other roof. Earlier blocks
 * take precedence: where two slopes coincide (an extension's rear slope
 * carrying on the main rear slope), the earlier one is kept. An earlier
 * block keeps its fascias and soffits up to a later one's walls, and a
 * later one's stop at the earlier one's fascias, so the eaves boxes meet
 * at the inside corner; gutters meet where their centre lines cross. Ridge
 * and hip lines lying on another roof's slope are dropped, and so are
 * downpipes whose outlet is in a gutter that was cut away.
 */
export function joinRoofs(blocks: RoofBlock[], i: number, spots?: [number, number][]): JoinedRoof {
  const b = blocks[i];
  const m = roofGeometry(b);
  const tr = roofTrim(b, spots);
  const out: JoinedRoof = { slopes: m.slopes, slopeUVs: m.slopeUVs, gables: m.gables, trim: tr.trim, gutters: tr.gutters, downpipes: tr.downpipes, caps: tr.caps };
  // A tucked end (planRoofs runs extensions in under the first, main, block) stays inside the main block's walls.
  const { beyond } = tuckHalves(b);
  if (i > 0 && beyond.length && eavesOverlap(b, blocks[0])) {
    const outside = blockRegion(blocks[0], "walls", 0, true).map((h): Half => ({ n: [-h.n[0], -h.n[1], -h.n[2]], d: -h.d }));
    for (const h of beyond)
      for (const side of outside) {
        const slopes = subtractSoup(out.slopes, out.slopeUVs, [h, side]);
        out.slopes = slopes.pos;
        out.slopeUVs = slopes.uv;
      }
  }
  blocks.forEach((o, j) => {
    if (j === i || !eavesOverlap(b, o)) return;
    // A later block gives way to an earlier one where they coincide.
    const g = j < i ? JOIN_EPS : -JOIN_EPS;
    for (const region of tileRegions(o, b, j > 0 && i === 0, g)) {
      const slopes = subtractSoup(out.slopes, out.slopeUVs, region);
      out.slopes = slopes.pos;
      out.slopeUVs = slopes.uv;
    }
    out.trim = subtractSoup(out.trim, undefined, blockRegion(o, j < i ? "fascias" : "walls", g)).pos;
    const gutterRegion = blockRegion(o, "gutters", g, true);
    out.gutters = out.gutters.flatMap(([p, q]) => subtractSegment(p, q, gutterRegion));
    const inside = (p: P3) => gutterRegion.every((h) => dot3(h.n, [p[0], 0, p[2]]) + h.d < 0);
    out.downpipes = out.downpipes.filter((d) => !inside(d.path[0]));
    // Ridge and hip lines go where they run under a later roof's tiles; an earlier roof's only where they lie in
    // its slope (an extension's slope carrying on the same plane), so a hip just under a shallower slope keeps its tiles.
    for (const region of tileRegions(o, b, j > 0 && i === 0, Math.abs(g) * 5)) {
      const cuts = j < i ? [region] : region.filter((h) => h.n[1] === 1).map((h) => [...region, { n: [-h.n[0], -1, -h.n[2]] as P3, d: -h.d - CAP_SLAB }]);
      for (const cut of cuts) out.caps = out.caps.flatMap(([p, q]) => subtractSegment(p, q, cut));
    }
  });
  return out;
}

export interface FlatSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
}
export interface Pillar {
  x: number;
  z: number;
  y0: number;
  y1: number;
}

/** A straight edge of a flat roof along a wall line: eaves get a fascia and trim, abutments a flashing up the taller wall. */
export interface FlatEdge {
  kind: "eaves" | "abutment";
  /** "x": the edge runs along x at z = `at`; "z": along z at x = `at`. */
  axis: "x" | "z";
  at: number;
  /** Extent along the edge (wall line coordinates). */
  a: number;
  b: number;
  /** Side the roof is not on: +1 or -1 along the other axis. */
  out: 1 | -1;
  /** How far to extend (+) or trim (-) each end of the fascia so corners meet; the membrane strip and soffit get their own. */
  fascia: [number, number];
  strip: [number, number];
  soffit: [number, number];
}

/** A flat roof over one floor's single-storey parts and canopies. */
export interface FlatRoof {
  /** Wall-top (ceiling) height it sits on. */
  y: number;
  /** Height of the membrane. */
  top: number;
  /** Rectangles of roof between wall centre lines. */
  rects: FlatSpec[];
  /** Parts of `rects` that are open canopies (they get a ceiling underneath). */
  open: FlatSpec[];
  edges: FlatEdge[];
}

/** Flat roof overhang past the outer face of the walls. */
export const FLAT_OVERHANG = 0.1;

/** A tiled lean-to over a porch canopy, falling away from the wall it is built against. */
export interface LeanTo {
  /** Direction of the wall line. */
  axis: "x" | "z";
  /** Extent along the wall line. */
  u0: number;
  u1: number;
  /** Wall line position on the other axis, and the direction away from the wall (+1 or -1). */
  wall: number;
  dir: 1 | -1;
  /** Distance from the wall line to the open edge. */
  depth: number;
  /** Floor level and the top of the posts. */
  floorY: number;
  postTop: number;
  pitchDeg: number;
  overhang: number;
  /** Ends that butt against a wall instead of overhanging. */
  startFlush: boolean;
  endFlush: boolean;
  /** The wall behind rises above the roof (a storey above), so it only needs a flashing. */
  tallWall: boolean;
  /** Flush ends against a lower wall, which is built up to meet the roof. */
  startCheek: boolean;
  endCheek: boolean;
}

/** Lean-to porch roofs are thinner than the main roof, and rest on a beam over the posts. */
export const LEAN_DEPTH = 0.15;
export const LEAN_BEAM = 0.15;

/** Height of a lean-to's tiles at distance `d` out from its wall line. */
export function leanToSurface(l: LeanTo, d: number): number {
  return l.postTop + LEAN_BEAM + LEAN_DEPTH + (l.depth - d) * Math.tan((l.pitchDeg * Math.PI) / 180);
}

/** Height of a lean-to's tiles above a world point, or null when the point is not under it. */
export function leanToHeightAt(l: LeanTo, x: number, z: number): number | null {
  const [u, w] = l.axis === "x" ? [x, z] : [z, x];
  const d = (w - l.wall) * l.dir;
  const u0 = l.startFlush ? l.u0 : l.u0 - l.overhang;
  const u1 = l.endFlush ? l.u1 : l.u1 + l.overhang;
  if (u < u0 || u > u1 || d < 0 || d > l.depth + l.overhang) return null;
  return leanToSurface(l, d);
}

/** A chimney placed on the roof: footprint, height range and pots. */
export interface ChimneyStack {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  y1: number;
  pots: number;
}

export interface RoofPlan {
  blocks: RoofBlock[];
  /** Flat roof rectangles between wall centre lines (all floors). */
  flats: FlatSpec[];
  flatRoofs: FlatRoof[];
  leanTos: LeanTo[];
  pillars: Pillar[];
  chimneys: ChimneyStack[];
  /** Ground level, for downpipes. */
  groundY: number;
  /** How each extension (rooms with a roofGroup on the top floor) is roofed. */
  extensions?: ExtensionRoof[];
}

export function floorBase(model: HouseModel, floor: Floor) {
  return floor.level * (model.ceilingHeight + model.slabThickness);
}

/** Exterior settings with every optional field filled from the defaults. */
export type ResolvedExterior = Exterior & Required<Pick<Exterior, "tileStyle" | "fascia" | "gutters" | "extensionDrop" | "canopyRoof" | "chimneys">>;

export function exteriorOf(model: HouseModel): ResolvedExterior {
  // Skip explicit undefineds so they don't knock out a default.
  const given = Object.fromEntries(Object.entries(model.exterior ?? {}).filter(([, v]) => v !== undefined)) as Partial<Exterior>;
  return { ...DEFAULT_EXTERIOR, ...given } as ResolvedExterior;
}

/** Height of the membrane of a flat roof sitting on walls at `y`: deep enough to clear the floor slab bands. */
export function flatRoofTop(model: HouseModel, y: number) {
  return y + Math.max(0.28, model.slabThickness + 0.04);
}

const TOL = 0.3;
/** Roofs sit this far clear of the wall tops so the walls never show through the tiles. */
const ROOF_CLEARANCE = 0.02;
/** Pitch of a lean-to porch roof: shallower than the main roof, as built. */
const LEAN_TO_MAX_PITCH = 30;

/**
 * An extension whose walls stop more than this short of the main roof's
 * front or rear wall line (or its side wall lines, for one at the front or
 * back) is set back from it, so it gets its own roof.
 */
export const SET_BACK_TOL = 0.05;

/** How an extension's roof was planned: what it is set back by, and how far its ridge sits below the main ridge. */
export interface ExtensionRoof {
  key: string;
  /** Largest set-back of its walls from the main roof's wall lines, metres (0 when flush). */
  setBack: number;
  /** Whether it has its own roof (rather than the main roof carrying on over it). */
  own: boolean;
  /** Its ridge below the main ridge, metres (0 when the main roof carries on over it). */
  drop: number;
  pitchDeg: number;
}

/** Overlap (m²) between a house's and an extension's rectangles below which they are just touching. */
const INTERLOCK_MIN = 0.05;

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Clip a polygon (any shape) to one side of an axis line: `axis` x or y, keeping coordinates below (`below`) or above `at`. */
function clipAxis(poly: V2[], axis: "x" | "y", at: number, below: boolean): V2[] {
  const inside = (p: V2) => (below ? p[axis] <= at : p[axis] >= at);
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (at - a[axis]) / (b[axis] - a[axis]);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function shoelace(poly: V2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Area of a polygon inside a box. */
export function polyAreaIn(poly: V2[], b: Box): number {
  let p = clipAxis(poly, "x", b.x0, false);
  p = clipAxis(p, "x", b.x1, true);
  p = clipAxis(p, "y", b.y0, false);
  p = clipAxis(p, "y", b.y1, true);
  return p.length >= 3 ? shoelace(p) : 0;
}

/** The parts of a polygon outside a box (slivers dropped), as up to four pieces. */
export function polyOutside(poly: V2[], b: Box): V2[][] {
  const mid = clipAxis(clipAxis(poly, "x", b.x0, false), "x", b.x1, true);
  return [clipAxis(poly, "x", b.x0, true), clipAxis(poly, "x", b.x1, false), clipAxis(mid, "y", b.y0, true), clipAxis(mid, "y", b.y1, false)].filter(
    (p) => p.length >= 3 && shoelace(p) > 1e-4,
  );
}

function rectOverlapArea(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
}

/**
 * Work out the roofs from the floors alone: the top floor gets a pitched
 * roof; any lower-floor area with nothing above it, plus canopies, gets a
 * flat roof, or a lean-to over canopies if chosen.
 *
 * Rooms with a roofGroup are extensions. With the extension roof
 * "separate", each gets its own roof set down below the main ridge. With
 * "continue", the main roof carries on over an extension that lines up with
 * it; one set back from its walls (or narrower) cannot be covered that way,
 * so it gets its own subservient roof at the same pitch, its ridge as far
 * below the main ridge as the set-back makes it. Either way the main roof
 * keeps its own hipped or gabled end, and the extension's roof runs in under
 * it (see RoofBlock.tuck), meeting it in valleys; roofParts trims each roof
 * where the other covers it (see joinRoofs).
 */
export function planRoofs(model: HouseModel): RoofPlan {
  const ext = exteriorOf(model);
  const blocks: RoofBlock[] = [];
  const extensions: ExtensionRoof[] = [];
  const all = modelBounds(model.floors);
  const style: RoofEnd = ext.roofStyle === "hip" ? "hip" : "gable";
  const partyLeft = ext.partyWall === "left" || ext.partyWall === "both";
  const partyRight = ext.partyWall === "right" || ext.partyWall === "both";
  const flats: FlatSpec[] = [];
  const flatRoofs: FlatRoof[] = [];
  const leanTos: LeanTo[] = [];
  const pillars: Pillar[] = [];
  const floors = [...model.floors].sort((a, b) => a.level - b.level);
  const topLevel = floors.length ? floors[floors.length - 1].level : 0;
  const groundY = (floors.length ? floorBase(model, floors[0]) : 0) - model.slabThickness - 0.01;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > TOL;
  type Rect = ReturnType<typeof bbox> & { key: string; polys: V2[][] };

  const top = floors.filter((f) => f.level === topLevel && f.rooms.length);
  for (const floor of top) {
    const yTop = floorBase(model, floor) + model.ceilingHeight;
    const groups = new Map<string, Room[]>();
    for (const r of floor.rooms) {
      const g = r.roofGroup ?? "main";
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    const rectOf = (key: string, polys: V2[][]): Rect => ({ key, polys, ...bbox(polys.flat()) });
    let rects = [...groups.entries()].map(([key, rooms]) => rectOf(key, rooms.map((r) => roomWorldPolygon(floor, r))));
    let main = rects.find((r) => r.key === "main") ?? [...rects].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    // Rooms that interlock across the line between the house and an extension (a landing run on into the
    // extension, a cupboard poking back into the house) belong to the other one's roof: whichever side has
    // less of its rooms inside the other's rectangle gives those parts up, so both keep their own outline.
    for (const e of rects.filter((r) => r !== main)) {
      if (rectOverlapArea(main, e) < INTERLOCK_MIN) continue;
      const mainIn = main.polys.reduce((a, poly) => a + polyAreaIn(poly, e), 0);
      const extIn = e.polys.reduce((a, poly) => a + polyAreaIn(poly, main), 0);
      if (mainIn < INTERLOCK_MIN && extIn < INTERLOCK_MIN) continue;
      const [give, keep] = mainIn <= extIn ? [main, e] : [e, main];
      const trimmed = rectOf(give.key, give.polys.flatMap((poly) => polyOutside(poly, keep)));
      if (!trimmed.polys.length) continue;
      rects = rects.map((r) => (r === give ? trimmed : r));
      if (give === main) main = trimmed;
    }
    // Which side of the main block an extension stands on, if it stands beside it.
    const besideX = (b: Rect) => (Math.abs(b.x1 - main.x0) < TOL || Math.abs(b.x0 - main.x1) < TOL) && overlap(b.y0, b.y1, main.y0, main.y1);
    const besideZ = (b: Rect) => (Math.abs(b.y1 - main.y0) < TOL || Math.abs(b.y0 - main.y1) < TOL) && overlap(b.x0, b.x1, main.x0, main.x1);
    const setBack = (b: Rect) =>
      besideX(b)
        ? Math.max(Math.abs(b.y0 - main.y0), Math.abs(b.y1 - main.y1))
        : besideZ(b)
          ? Math.max(Math.abs(b.x0 - main.x0), Math.abs(b.x1 - main.x1))
          : 0;
    if (ext.extensionRoof !== "separate") {
      // The main roof carries on over every extension that lines up with it.
      const carried = rects.filter((r) => r !== main && setBack(r) <= SET_BACK_TOL);
      for (const r of carried) extensions.push({ key: r.key, setBack: setBack(r), own: false, drop: 0, pitchDeg: ext.pitchDeg });
      if (carried.length) {
        const merged = rectOf(main.key, [main, ...carried].flatMap((r) => r.polys));
        rects = [merged, ...rects.filter((r) => r !== main && !carried.includes(r))];
        main = merged;
      }
    }
    // The main block first: it takes precedence where roofs meet.
    rects = [main, ...rects.filter((r) => r !== main)];

    const planned = rects.map((b) => {
      // An extension's ridge runs away from the main roof, into the main roof's end or side.
      let axis: "x" | "z" = ext.ridgeAxis === "auto" ? (b.w >= b.h ? "x" : "z") : ext.ridgeAxis;
      if (b !== main) {
        if (besideX(b)) axis = "x";
        else if (besideZ(b)) axis = "z";
      }
      // An extension's end at the main block runs in under the main roof.
      const atMain = (v: number, side: "lo" | "hi") =>
        b !== main &&
        (axis === "x"
          ? Math.abs((side === "lo" ? main.x1 : main.x0) - v) < TOL && overlap(main.y0, main.y1, b.y0, b.y1)
          : Math.abs((side === "lo" ? main.y1 : main.y0) - v) < TOL && overlap(main.x0, main.x1, b.x0, b.x1));
      // An extension's end that meets another extension across its end line, or the party wall, stops flush.
      const touches = (v: number, side: "lo" | "hi") =>
        b !== main &&
        rects.some((o) =>
          o === b || o === main
            ? false
            : axis === "x"
              ? Math.abs((side === "lo" ? o.x1 : o.x0) - v) < TOL && overlap(o.y0, o.y1, b.y0, b.y1)
              : Math.abs((side === "lo" ? o.y1 : o.y0) - v) < TOL && overlap(o.x0, o.x1, b.x0, b.x1),
        );
      const party = (v: number, side: "lo" | "hi") =>
        axis === "x" && (side === "lo" ? partyLeft && Math.abs(v - all.x0) < TOL : partyRight && Math.abs(v - all.x1) < TOL);
      const [lo, hi] = axis === "x" ? [b.x0, b.x1] : [b.y0, b.y1];
      const under = [atMain(lo, "lo"), atMain(hi, "hi")] as const;
      const block: RoofBlock = {
        x0: b.x0,
        z0: b.y0,
        x1: b.x1,
        z1: b.y1,
        y: yTop,
        axis,
        pitchDeg: ext.pitchDeg,
        overhang: ext.overhang,
        clearance: ROOF_CLEARANCE,
        eavesOnWalls: true,
        start: party(lo, "lo") || touches(lo, "lo") || under[0] ? "flush" : style,
        end: party(hi, "hi") || touches(hi, "hi") || under[1] ? "flush" : style,
      };
      return { rect: b, block, under };
    });
    const mainBlock = planned[0].block;
    blocks.push(mainBlock);
    const mainRidge = roofGeometry(mainBlock).ridgeY;
    for (const p of planned.slice(1)) {
      // Separate: the ridge set down by the chosen drop. Set back: the same pitch, never above the main ridge.
      const b = setDown(p.block, mainBlock, ext.extensionRoof === "separate" ? ext.extensionDrop : 0);
      const tuck = tuckUnder(b, mainBlock, p.under);
      blocks.push(tuck ? { ...b, tuck } : b);
      extensions.push({ key: p.rect.key, setBack: setBack(p.rect), own: true, drop: mainRidge - roofGeometry(b).ridgeY, pitchDeg: b.pitchDeg });
    }
  }

  const blockRects = blocks.map((b): V2[] => [
    { x: b.x0, y: b.z0 },
    { x: b.x1, y: b.z0 },
    { x: b.x1, y: b.z1 },
    { x: b.x0, y: b.z1 },
  ]);

  for (const floor of floors) {
    const base = floorBase(model, floor);
    const yTop = base + model.ceilingHeight;
    const roomPolys = floor.rooms.map((r) => roomWorldPolygon(floor, r));
    const canopyPolys = (floor.canopies ?? []).map((poly) => poly.map((p: Pt) => toWorld(floor, p)));
    const abovePolys = floors.filter((f) => f.level === floor.level + 1).flatMap((f) => f.rooms.map((r) => roomWorldPolygon(f, r)));
    const flatCanopies: V2[][] = [];
    for (const poly of canopyPolys) {
      const tall = floor.level === topLevel ? blockRects : abovePolys;
      const lt = ext.canopyRoof === "lean-to" ? planLeanTo(poly, roomPolys, tall, base, yTop, ext.pitchDeg) : null;
      if (lt) leanTos.push(lt);
      else flatCanopies.push(poly);
    }
    const isTop = floor.level === topLevel && floor.rooms.length > 0;
    // Anything under a pitched roof is roofed already; flat roofs stop against a lean-to as against a wall.
    const leanPolys = canopyPolys.filter((p) => !flatCanopies.includes(p));
    const fr = planFlat(isTop ? [] : roomPolys, flatCanopies, [...abovePolys, ...blockRects, ...leanPolys], yTop, flatRoofTop(model, yTop));
    if (fr) {
      flatRoofs.push(fr);
      flats.push(...fr.rects);
    }

    // Pillars at canopy corners that are not on a wall.
    for (const poly of canopyPolys) {
      for (const v of poly) {
        const nearWall = roomPolys.some((rp) => distToPolygonEdge(v, rp) < 0.4);
        if (!nearWall) pillars.push({ x: v.x, z: v.y, y0: base, y1: yTop });
      }
    }
  }

  const chimneys = ext.chimneys.map((c) => placeChimney(c, blocks, flatRoofs, groundY));
  return { blocks, flats, flatRoofs, leanTos, pillars, chimneys, groundY, extensions };
}

/**
 * Lower an extension roof's ridge to `drop` below the main ridge by easing
 * its pitch, keeping the eaves where they are (the walls are the same height).
 */
export function setDown(b: RoofBlock, main: RoofBlock, drop: number): RoofBlock {
  const mainRidge = roofGeometry(main).ridgeY;
  const half = (b.wallT ?? EXT_WALL_T) / 2;
  const hs = ((b.axis === "x" ? b.z1 - b.z0 : b.x1 - b.x0) + 2 * half) / 2;
  const y = b.y + (b.clearance ?? 0);
  // The ridge rises from the eaves line when the eaves sit on the walls, from the wall face otherwise.
  const run = hs + (b.eavesOnWalls ? b.overhang : 0);
  const target = mainRidge - Math.max(0, drop);
  const natural = y + run * Math.tan((b.pitchDeg * Math.PI) / 180);
  if (natural <= target) return b;
  const pitch = (Math.atan(Math.max(0, target - y) / run) * 180) / Math.PI;
  return { ...b, pitchDeg: Math.max(10, pitch) };
}

/**
 * How far an extension's ends at the main block (`under`: start, end) must
 * run on so its roof is wholly under the main roof there: past the main
 * block's outer wall face until the main roof, rising from that face, is
 * above the extension's ridge. Null when neither end meets the main block.
 */
export function tuckUnder(b: RoofBlock, main: RoofBlock, under: readonly [boolean, boolean]): [number, number] | null {
  if (!under[0] && !under[1]) return null;
  const half = (b.wallT ?? EXT_WALL_T) / 2;
  const hs = ((b.axis === "x" ? b.z1 - b.z0 : b.x1 - b.x0) + 2 * half) / 2;
  const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);
  // Where the main roof, rising from its seat over its wall face, clears the extension's ridge.
  const reach = (roofSeatY(b) + hs * tan(b.pitchDeg) - roofSeatY(main)) / tan(main.pitchDeg) + 0.05;
  const [m0, m1] = b.axis === "x" ? [main.x0, main.x1] : [main.z0, main.z1];
  const mh = (main.wallT ?? EXT_WALL_T) / 2;
  const [u0, u1] = b.axis === "x" ? [b.x0, b.x1] : [b.z0, b.z1];
  // The start meets the main block's high side, the end its low side; never run out past its far side.
  const t0 = under[0] ? Math.min(u0 - (m1 + mh - reach), u0 - m0) : 0;
  const t1 = under[1] ? Math.min(m0 - mh + reach - u1, m1 - u1) : 0;
  return [Math.max(0, t0), Math.max(0, t1)];
}

function distToPolygonEdge(p: V2, poly: V2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

/**
 * Cluster near-equal coordinates so tracing noise does not leave slivers.
 * Lists earlier in `lists` win a cluster, so the walls of taller parts set
 * the lines a flat roof meets.
 */
function snapper(lists: number[][], tol: number): (v: number) => number {
  const items = lists.flatMap((l, pri) => l.map((v) => ({ v, pri }))).sort((a, b) => a.v - b.v);
  const map = new Map<number, number>();
  let cluster: typeof items = [];
  const flush = () => {
    if (!cluster.length) return;
    const best = Math.min(...cluster.map((c) => c.pri));
    const chosen = cluster.filter((c) => c.pri === best);
    const rep = chosen.reduce((s, c) => s + c.v, 0) / chosen.length;
    for (const c of cluster) map.set(c.v, rep);
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.v - cluster[cluster.length - 1].v > tol) flush();
    cluster.push(it);
  }
  flush();
  return (v) => map.get(v) ?? v;
}

/**
 * Plan a flat roof over `cover` minus `above` (taller parts), on a grid whose
 * lines are the walls themselves, so the roof meets every wall exactly with
 * no notches or slivers. Returns the rectangles and the classified outline.
 */
export function planFlat(rooms: V2[][], open: V2[][], above: V2[][], y: number, top: number, wallT = EXT_WALL_T): FlatRoof | null {
  const cover = [...rooms, ...open];
  if (!cover.length) return null;
  const SNAP = 0.15;
  const xsOf = (polys: V2[][]) => polys.flat().map((p) => p.x);
  const zsOf = (polys: V2[][]) => polys.flat().map((p) => p.y);
  const sx = snapper([xsOf(above), xsOf(cover)], SNAP);
  const sz = snapper([zsOf(above), zsOf(cover)], SNAP);
  const snap = (polys: V2[][]) => polys.map((poly) => poly.map((p) => ({ x: sx(p.x), y: sz(p.y) })));
  const R = snap(rooms);
  const O = snap(open);
  const C = [...R, ...O];
  const A = snap(above);
  const uniq = (vals: number[]) => [...new Set(vals)].sort((a, b) => a - b);
  const xs = uniq([...xsOf(C), ...xsOf(A)]);
  const zs = uniq([...zsOf(C), ...zsOf(A)]);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  if (nx < 1 || nz < 1) return null;
  const centre = (i: number, j: number) => ({ x: (xs[i] + xs[i + 1]) / 2, y: (zs[j] + zs[j + 1]) / 2 });
  const inAny = (p: V2, polys: V2[][]) => polys.some((poly) => pointInPolygon(p, poly));
  const filled: boolean[][] = [];
  const aboveCell: boolean[][] = [];
  const openCell: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    filled.push([]);
    aboveCell.push([]);
    openCell.push([]);
    for (let j = 0; j < nz; j++) {
      const c = centre(i, j);
      const ab = inAny(c, A);
      aboveCell[i].push(ab);
      const f = !ab && xs[i + 1] - xs[i] > 0.01 && zs[j + 1] - zs[j] > 0.01 && inAny(c, C);
      filled[i].push(f);
      openCell[i].push(f && !inAny(c, R));
    }
  }
  const F = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && filled[i][j];
  const Ab = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && aboveCell[i][j];

  const merge = (grid: boolean[][]): FlatSpec[] => {
    const g = grid.map((col) => [...col]);
    const out: FlatSpec[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (!g[i][j]) continue;
        let w = 1;
        while (i + w < nx && g[i + w][j]) w++;
        let h = 1;
        outer: while (j + h < nz) {
          for (let k = 0; k < w; k++) if (!g[i + k][j + h]) break outer;
          h++;
        }
        for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) g[i + k][j + jj] = false;
        out.push({ x0: xs[i], z0: zs[j], x1: xs[i + w], z1: zs[j + h], y });
      }
    }
    return out;
  };
  const rects = merge(filled);
  if (!rects.length) return null;
  const opens = merge(openCell);

  // Outline edges along grid lines, merged into runs of the same kind.
  const half = wallT / 2;
  const W = half + FLAT_OVERHANG;
  const edges: FlatEdge[] = [];
  for (const axis of ["x", "z"] as const) {
    // Along x: lines are z = zs[j], cells indexed (i, row). Along z: lines x = xs[i], cells (col, j).
    const lines = axis === "x" ? zs : xs;
    const steps = axis === "x" ? xs : zs;
    const cell = (k: number, row: number) => (axis === "x" ? F(k, row) : F(row, k));
    const ab = (k: number, row: number) => (axis === "x" ? Ab(k, row) : Ab(row, k));
    for (let line = 0; line < lines.length; line++) {
      for (const out of [1, -1] as const) {
        const rowIn = out > 0 ? line - 1 : line;
        const rowOut = out > 0 ? line : line - 1;
        let k = 0;
        while (k < steps.length - 1) {
          if (!cell(k, rowIn) || cell(k, rowOut)) {
            k++;
            continue;
          }
          const kind = ab(k, rowOut) ? "abutment" : "eaves";
          const k0 = k;
          while (k < steps.length - 1 && cell(k, rowIn) && !cell(k, rowOut) && (ab(k, rowOut) ? "abutment" : "eaves") === kind) k++;
          const k1 = k - 1;
          if (kind === "eaves") {
            // What lies beyond each end decides how far the trims run: out to a corner, back from an inside
            // corner, into a taller wall that crosses the end, or up to the face of one that runs beside it.
            const endType = (kk: number) =>
              cell(kk, rowOut) ? "concave" : !cell(kk, rowIn) ? (ab(kk, rowIn) ? (ab(kk, rowOut) ? "across" : "beside") : "convex") : "across";
            const types = [endType(k0 - 1), endType(k1 + 1)];
            const adj = (map: Record<string, number>): [number, number] => [map[types[0]], map[types[1]]];
            edges.push({
              kind,
              axis,
              at: lines[line],
              a: steps[k0],
              b: steps[k1 + 1],
              out,
              fascia: adj({ convex: W, concave: -W, beside: -half, across: 0 }),
              strip: adj({ convex: W, concave: 0, beside: -half, across: 0 }),
              soffit: adj({ convex: W - BOARD, concave: -half, beside: -half, across: 0 }),
            });
          } else {
            // Flashings wrap round the corner of the taller wall, or run out over the eaves strip where the roof ends against it.
            const flash = (kk: number): number => (cell(kk, rowIn) ? half + 0.01 : ab(kk, rowOut) ? W : half + 0.01);
            const ends: [number, number] = [flash(k0 - 1), flash(k1 + 1)];
            edges.push({ kind, axis, at: lines[line], a: steps[k0], b: steps[k1 + 1], out, fascia: ends, strip: ends, soffit: ends });
          }
        }
      }
    }
  }
  return { y, top, rects, open: opens, edges };
}

/**
 * A lean-to over a canopy: the side with the most wall behind it is the high
 * side. Returns null when the canopy does not stand against a wall.
 */
function planLeanTo(poly: V2[], rooms: V2[][], above: V2[][], floorY: number, postTop: number, mainPitch: number): LeanTo | null {
  const b = bbox(poly);
  const probe = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, polys: V2[][]) => {
    let hits = 0;
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const p = { x: x0 + (x1 - x0) * t + nx * 0.2, y: z0 + (z1 - z0) * t + nz * 0.2 };
      if (polys.some((r) => pointInPolygon(p, r))) hits++;
    }
    return hits / 9;
  };
  const sides = [
    { axis: "x" as const, wall: b.y0, dir: 1 as const, score: probe(b.x0, b.y0, b.x1, b.y0, 0, -1, rooms), depth: b.h, u0: b.x0, u1: b.x1, nx: 0, nz: -1 },
    { axis: "x" as const, wall: b.y1, dir: -1 as const, score: probe(b.x0, b.y1, b.x1, b.y1, 0, 1, rooms), depth: b.h, u0: b.x0, u1: b.x1, nx: 0, nz: 1 },
    { axis: "z" as const, wall: b.x0, dir: 1 as const, score: probe(b.x0, b.y0, b.x0, b.y1, -1, 0, rooms), depth: b.w, u0: b.y0, u1: b.y1, nx: -1, nz: 0 },
    { axis: "z" as const, wall: b.x1, dir: -1 as const, score: probe(b.x1, b.y0, b.x1, b.y1, 1, 0, rooms), depth: b.w, u0: b.y0, u1: b.y1, nx: 1, nz: 0 },
  ];
  const best = [...sides].sort((p, q) => q.score - p.score || q.u1 - q.u0 - (p.u1 - p.u0))[0];
  if (best.score < 0.5) return null;
  const endScore = (u: number, sign: number) =>
    best.axis === "x" ? probe(u, b.y0, u, b.y1, sign, 0, rooms) : probe(b.x0, u, b.x1, u, 0, sign, rooms);
  const tall =
    best.axis === "x"
      ? probe(best.u0, best.wall, best.u1, best.wall, best.nx, best.nz, above)
      : probe(best.wall, best.u0, best.wall, best.u1, best.nx, best.nz, above);
  const endTall = (u: number, sign: number) =>
    (best.axis === "x" ? probe(u, b.y0, u, b.y1, sign, 0, above) : probe(b.x0, u, b.x1, u, 0, sign, above)) >= 0.5;
  const startFlush = endScore(best.u0, -1) >= 0.5;
  const endFlush = endScore(best.u1, 1) >= 0.5;
  return {
    axis: best.axis,
    u0: best.u0,
    u1: best.u1,
    wall: best.wall,
    dir: best.dir,
    depth: best.depth,
    floorY,
    postTop,
    pitchDeg: Math.min(mainPitch, LEAN_TO_MAX_PITCH),
    overhang: 0.2,
    startFlush,
    endFlush,
    tallWall: tall >= 0.5,
    startCheek: startFlush && !endTall(best.u0, -1),
    endCheek: endFlush && !endTall(best.u1, 1),
  };
}

/** Place a chimney: it rises through the roof it stands on to `height` above that roof's ridge. */
function placeChimney(c: Chimney, blocks: RoofBlock[], flatRoofs: FlatRoof[], groundY: number): ChimneyStack {
  const corners = [
    [c.x - c.w / 2, c.y - c.d / 2],
    [c.x + c.w / 2, c.y - c.d / 2],
    [c.x + c.w / 2, c.y + c.d / 2],
    [c.x - c.w / 2, c.y + c.d / 2],
  ];
  const ridges = blocks.map((b) => roofGeometry(b).ridgeY);
  // The roof under the stack's centre, or else one the stack overlaps (a shared stack centred over the neighbour's side of the party wall).
  let onBlock = blocks.findIndex((b) => roofHeightAt(b, c.x, c.y) !== null);
  if (onBlock < 0) onBlock = blocks.findIndex((b) => corners.some(([x, z]) => roofHeightAt(b, x, z) !== null));
  const highest = ridges.length ? Math.max(...ridges) : groundY + 3;
  const y1 = (onBlock >= 0 ? ridges[onBlock] : highest) + c.height;
  let y0: number;
  if (onBlock >= 0) {
    const b = blocks[onBlock];
    // A stack straddling the party wall sits on the neighbour's matching slope.
    y0 = Math.min(...corners.map(([x, z]) => roofHeightAt(b, x, z, true) ?? b.y)) - 0.15;
  } else {
    const flat = flatRoofs.find((f) => f.rects.some((r) => c.x >= r.x0 && c.x <= r.x1 && c.y >= r.z0 && c.y <= r.z1));
    y0 = flat ? flat.top - 0.05 : groundY;
  }
  return { x: c.x, z: c.y, w: c.w, d: c.d, y0, y1: Math.max(y1, y0 + 0.5), pots: Math.max(0, Math.round(c.pots)) };
}

/** Pitched roofs of a model without its chimneys (which don't affect them), highest ridge first. */
function pitchedBlocks(model: HouseModel): RoofBlock[] {
  const { blocks } = planRoofs({ ...model, exterior: { ...exteriorOf(model), chimneys: [] } });
  return blocks.sort((p, q) => roofGeometry(q).ridgeY - roofGeometry(p).ridgeY);
}

/** A sensible new chimney: on the main ridge, straddling the party wall if there is one, otherwise mid-ridge. */
export function defaultChimney(model: HouseModel, id: string): Chimney {
  const ext = exteriorOf(model);
  const b = pitchedBlocks(model)[0];
  if (!b) {
    const bb = modelBounds(model.floors);
    return { id, x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2, w: 0.75, d: 0.5, height: 0.9, pots: 2 };
  }
  const [r0, r1] = roofGeometry(b).ridge;
  const left = ext.partyWall === "left" || ext.partyWall === "both";
  const right = ext.partyWall === "right" || ext.partyWall === "both";
  const at = b.axis === "x" && right && b.end === "flush" ? r1 : b.axis === "x" && left && b.start === "flush" ? r0 : [(r0[0] + r1[0]) / 2, 0, (r0[2] + r1[2]) / 2];
  const size = b.axis === "x" ? { w: 0.9, d: 0.55 } : { w: 0.55, d: 0.9 };
  return { id, x: at[0], y: at[2], ...size, height: 0.9, pots: 2 };
}

/** Move a chimney onto the ridge of the roof it stands on (or the main roof), keeping it as close as it can. */
export function chimneyOnRidge(model: HouseModel, c: Chimney): Chimney {
  const blocks = pitchedBlocks(model);
  const b = blocks.find((k) => roofHeightAt(k, c.x, c.y, true) !== null) ?? blocks[0];
  if (!b) return c;
  const [r0, r1] = roofGeometry(b).ridge;
  const clamp = (v: number, a: number, z: number) => Math.min(Math.max(v, Math.min(a, z)), Math.max(a, z));
  return b.axis === "x" ? { ...c, x: clamp(c.x, r0[0], r1[0]), y: r0[2] } : { ...c, x: r0[0], y: clamp(c.y, r0[2], r1[2]) };
}
