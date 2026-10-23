import type { CatalogueItem } from "./catalogue";
import type { Floor, Fixture, JoineryFit, Pt } from "../types";
import { EXT_WALL_T } from "./geometry";
import { tidyJoinery } from "./joinery";
import { convexOverlap, defaultSill, fixtureBox, normDeg, rectCorners } from "./planMath";
import { planWallLines, planWalls } from "./planWalls";

/**
 * Fitting fixtures (built-in units, window seats) to the real wall faces: the back goes on the face nearest a click and the
 * width runs between the faces that stand out of that wall on either side (an alcove beside a chimney breast), or to the
 * default width when there is only one side or none. Image px unless a name says metres.
 */

/** One flat wall face: a to b, with the unit normal pointing out of the wall into the space in front. */
export interface Face {
  a: Pt;
  b: Pt;
  n: Pt;
}

/** Every edge of every wall polygon on a floor (each polygon is convex), as faces. */
export function floorFaces(floor: Floor): Face[] {
  const out: Face[] = [];
  for (const { poly } of planWalls(floor)) {
    const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) return;
      let n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
      if ((c.x - a.x) * n.x + (c.y - a.y) * n.y > 0) n = { x: -n.x, y: -n.y };
      out.push({ a, b, n });
    });
  }
  return out;
}

export interface FitOpts {
  /** How far in front of a wall face a click can be, metres. */
  reach: number;
  /** Widest recess to fill, metres. */
  maxWidth: number;
  /** Deepest a unit is made to fit a recess, metres. */
  maxDepth: number;
  /** A recess deeper than this is treated as a room, not an alcove, metres. */
  deep: number;
  defaultW: number;
  defaultD: number;
}

export interface Fit {
  x: number;
  y: number;
  rot: number;
  /** Metres. */
  w: number;
  d: number;
  /** How many standing-out faces bound the width. */
  sides: 0 | 1 | 2;
  /** Depth of the recess itself, metres, when it has two sides. */
  depth?: number;
}

const DEFAULTS: FitOpts = { reach: 1.2, maxWidth: 3, maxDepth: 0.6, deep: 1, defaultW: 0.6, defaultD: 0.4 };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });

interface Side {
  /** Position along u from O, px. */
  s: number;
  /** How far the face stands out from the back, px. */
  reach: number;
}

/** The nearest standing-out faces to the left (negative s) and right of O along u, with the back at q = 0 along n. */
function sidesFrom(faces: Face[], O: Pt, u: Pt, n: Pt, ppm: number, maxWidthM: number): { left?: Side; right?: Side } {
  let left: Side | undefined;
  let right: Side | undefined;
  const maxPx = maxWidthM * ppm;
  for (const g of faces) {
    if (Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) < 0.02 * ppm) continue;
    const gu = dot(g.n, u);
    if (Math.abs(gu) < 0.98) continue;
    const sa = dot(sub(g.a, O), u);
    const sb = dot(sub(g.b, O), u);
    const qa = dot(sub(g.a, O), n);
    const qb = dot(sub(g.b, O), n);
    const qmin = Math.min(qa, qb);
    const qmax = Math.max(qa, qb);
    if (!(qmin <= 0.05 * ppm && qmax >= 0.05 * ppm)) continue;
    const s = (sa + sb) / 2;
    if (gu > 0 && s < 0 && -s <= maxPx) {
      if (!left || s > left.s) left = { s, reach: qmax };
    } else if (gu < 0 && s > 0 && s <= maxPx) {
      if (!right || s < right.s) right = { s, reach: qmax };
    }
  }
  return { left, right };
}

const rotOf = (n: Pt) => round6(normDeg((Math.atan2(-n.x, n.y) * 180) / Math.PI));

/** Fit a unit to the recess (or wall) nearest the point p; null when no wall face is within reach. */
export function fitRecess(floor: Floor, p: Pt, opts: Partial<FitOpts> = {}, faces: Face[] = floorFaces(floor)): Fit | null {
  const o = { ...DEFAULTS, ...opts };
  const ppm = floor.pxPerM;
  let best: { score: number; O: Pt; u: Pt; n: Pt; left?: Side; right?: Side } | null = null;
  for (const f of faces) {
    const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
    if (len < 0.05 * ppm) continue;
    const u = { x: (f.b.x - f.a.x) / len, y: (f.b.y - f.a.y) / len };
    const t = dot(sub(p, f.a), u);
    const q = dot(sub(p, f.a), f.n);
    if (t < -ppm || t > len + ppm || q <= 0 || q > o.reach * ppm) continue;
    const O = { x: f.a.x + u.x * t, y: f.a.y + u.y * t };
    let { left, right } = sidesFrom(faces, O, u, f.n, ppm, o.maxWidth);
    if (left && right && right.s - left.s > o.maxWidth * ppm) {
      if (-left.s <= right.s) right = undefined;
      else left = undefined;
    }
    const score = q + (left && right ? 0 : 0.3 * ppm);
    if (!best || score < best.score) best = { score, O, u, n: f.n, left, right };
  }
  if (!best) return null;
  const { O, u, n, left, right } = best;
  let sc = 0;
  let wM = o.defaultW;
  let dM = o.defaultD;
  let sides: 0 | 1 | 2 = 0;
  let depth: number | undefined;
  if (left && right) {
    sides = 2;
    wM = (right.s - left.s) / ppm;
    sc = (right.s + left.s) / 2;
    depth = Math.min(left.reach, right.reach) / ppm;
    dM = depth > o.deep ? o.defaultD : clamp(depth, 0.15, o.maxDepth);
  } else if (left) {
    sides = 1;
    sc = left.s + (wM * ppm) / 2;
  } else if (right) {
    sides = 1;
    sc = right.s - (wM * ppm) / 2;
  }
  return {
    x: O.x + u.x * sc + n.x * ((dM * ppm) / 2),
    y: O.y + u.y * sc + n.y * ((dM * ppm) / 2),
    rot: rotOf(n),
    w: r3(wM),
    d: r3(dM),
    sides,
    ...(depth !== undefined ? { depth: r3(depth) } : {}),
  };
}

/** Fit a seat to the window (or bay mouth) whose inside is nearest p. */
export function fitWindow(
  floor: Floor,
  p: Pt,
  opts: Partial<FitOpts> & { h?: number } = {},
  faces: Face[] = floorFaces(floor),
): (Fit & { opening: string; h?: number }) | null {
  const o = { ...DEFAULTS, ...opts };
  const ppm = floor.pxPerM;
  let best: { score: number; op: Floor["openings"][number]; c: Pt; u: Pt; n: Pt } | null = null;
  for (const op of floor.openings) {
    if (op.kind !== "window" && op.kind !== "bay") continue;
    const c = { x: op.x, y: op.y };
    const u = op.orientation === "h" ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const axis = { x: -u.y, y: u.x };
    const side = Math.sign(dot(sub(p, c), axis));
    if (side === 0) continue;
    const n = { x: axis.x * side, y: axis.y * side };
    const q = dot(sub(p, c), n);
    if (q <= 0 || q > o.reach * ppm || Math.abs(dot(sub(p, c), u)) > (op.widthM / 2 + 0.3) * ppm) continue;
    if (!best || q < best.score) best = { score: q, op, c, u, n };
  }
  if (!best) return null;
  const { op, c, u, n } = best;
  const widthM = op.widthM;
  const line = planWallLines(floor).find((l) => {
    const len = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
    if (len < 1e-6) return false;
    const lu = { x: (l.b.x - l.a.x) / len, y: (l.b.y - l.a.y) / len };
    return Math.abs(dot(lu, u)) > 0.99 && Math.abs(dot(sub(c, l.a), { x: -lu.y, y: lu.x })) <= 2;
  });
  const halfT = line ? line.halfT : (EXT_WALL_T / 2) * ppm;
  const O = { x: c.x + n.x * halfT, y: c.y + n.y * halfT };
  const { left, right } = sidesFrom(faces, O, u, n, ppm, widthM + 1.2);
  let wM = widthM;
  let sc = 0;
  let sides: 0 | 1 | 2 = 0;
  if (left && right && right.s - left.s <= (widthM + 0.8) * ppm) {
    sides = 2;
    wM = (right.s - left.s) / ppm;
    sc = (right.s + left.s) / 2;
  }
  const dM = o.defaultD;
  const out: Fit & { opening: string; h?: number } = {
    x: O.x + u.x * sc + n.x * ((dM * ppm) / 2),
    y: O.y + u.y * sc + n.y * ((dM * ppm) / 2),
    rot: rotOf(n),
    w: r3(wM),
    d: r3(dM),
    sides,
    opening: op.id,
  };
  if (opts.h !== undefined) {
    const sill = op.sill ?? defaultSill(op.kind) ?? 0.9;
    if (opts.h > sill - 0.03) out.h = r3(Math.max(0.3, sill - 0.03));
  }
  return out;
}

export const defaultFit = (item: Pick<CatalogueItem, "symbol">): JoineryFit | undefined =>
  item.symbol === "built-in" ? "recess" : item.symbol === "window-seat" ? "window" : undefined;

/** The fit a fixture would get now, from a point 5 cm in front of the middle of its back. */
function fitNow(floor: Floor, fx: Fixture, item: CatalogueItem, faces: Face[]) {
  const ppm = floor.pxPerM;
  const box = fixtureBox(fx, item);
  const r = (fx.rot * Math.PI) / 180;
  const front = { x: -Math.sin(r), y: Math.cos(r) };
  const k = (-box.d / 2 + 0.05) * ppm;
  const probe = { x: fx.x + front.x * k, y: fx.y + front.y * k };
  const kind: JoineryFit | undefined = fx.joinery?.fit ?? defaultFit(item);
  let fit: (Fit & { h?: number }) | null = null;
  if (kind === "window") fit = fitWindow(floor, probe, { defaultD: box.d, h: box.h }, faces);
  fit ??= fitRecess(floor, probe, { defaultW: box.w, defaultD: box.d }, faces);
  return { fit, kind, box };
}

/** Patch that puts a fixture back in its recess (or at its window); null when there is nothing to fit to. */
export function refitFixture(floor: Floor, fx: Fixture, item: CatalogueItem, faces: Face[] = floorFaces(floor)): Partial<Fixture> | null {
  const { fit, kind } = fitNow(floor, fx, item, faces);
  if (!fit || !kind) return null;
  return {
    x: fit.x,
    y: fit.y,
    rot: fit.rot,
    w: fit.w,
    d: fit.d,
    ...(fit.h !== undefined ? { h: fit.h } : {}),
    joinery: tidyJoinery({ ...fx.joinery, fit: kind }),
  };
}

/** Why a fitted unit no longer fits, or null when it does (or was never fitted). */
export function fitProblem(floor: Floor, fx: Fixture, item: CatalogueItem, faces: Face[] = floorFaces(floor)): string | null {
  const kind = fx.joinery?.fit;
  if (!kind) return null;
  const ppm = floor.pxPerM;
  const box = fixtureBox(fx, item);
  const corners = rectCorners(fx, box.w * ppm, box.d * ppm, fx.rot);
  if (planWalls(floor).some((pw) => convexOverlap(corners, pw.poly, 0.005 * ppm))) return "Cuts into a wall: refit it.";
  const { fit } = fitNow(floor, fx, item, faces);
  const lost = kind === "window" ? "No longer matches its window: refit it." : "No longer lines up with its recess: refit it.";
  if (!fit) return lost;
  const r = (fx.rot * Math.PI) / 180;
  const off = Math.abs((fit.x - fx.x) * Math.cos(r) + (fit.y - fx.y) * Math.sin(r)) / ppm;
  if (kind === "window") return Math.abs(fit.w - box.w) > 0.02 || off > 0.02 ? lost : null;
  if (fit.sides === 2 && box.w < fit.w - 0.02) return `Leaves a ${Math.round((fit.w - box.w) * 100)} cm gap in its recess: refit it.`;
  return off > 0.02 ? lost : null;
}
