import type { BoundaryEdge, SiteSurface, WallFollow } from "../types";
import { pointInPolygon, polygonArea, type V2 } from "./geometry";
import { surfaceHeightAt } from "./surfaceSlope";

/**
 * Garden walls (and fences) on sloping ground.
 *
 * A boundary wall stands on the ground beside it. Where that ground slopes,
 * like the drive climbing from the pavement to the garage, the wall can keep
 * a level top (and so get lower above the ground as it climbs), step its top
 * up in whole brick courses, or rake its top parallel to the ground. Its base
 * always reaches down to the lowest ground on either side, so it never floats.
 */

/** One brick course: a 65 mm brick and a 10 mm joint. */
export const COURSE = 0.075;
/** Steps are never closer together than this, metres. */
export const MIN_STEP_RUN = 0.9;
/** A step is not made so near the end of a wall that a stub shorter than this is left. */
export const MIN_END_RUN = 0.3;
/** How far inside the plot (or outside it) the ground beside a wall is read, metres. */
export const SIDE_PROBE = 0.15;
/** Ground that varies less than this along a wall counts as flat, metres. */
export const FLAT_TOLERANCE = 0.01;
/** Spacing of the ground samples along a wall, metres. */
const SAMPLE = 0.05;

/** The ground beside a wall at a distance `d` along it. */
export interface GroundSample {
  d: number;
  /** Height of the ground the wall stands on: the plot side. */
  plot: number;
  /** Lowest ground on either side or under the line: where the wall's base must reach. */
  low: number;
}

/**
 * A run of wall from `start` to `end` (metres along the edge). Its base and top
 * go from `base`/`top` at the start to `baseEnd`/`topEnd` at the end: equal for a
 * level or stepped run, different along a rake. Heights are above the site's
 * ground level (0), not above the local ground.
 */
export interface WallSegment {
  start: number;
  end: number;
  base: number;
  top: number;
  baseEnd: number;
  topEnd: number;
}

/**
 * Height of the ground at a plan point: the highest garden surface there, 0
 * where there is none. Planting beds are left out: a raised bed is a planter
 * built against a wall, not the ground the wall stands on.
 */
export function groundAt(surfaces: Pick<SiteSurface, "kind" | "polygon" | "slope">[], p: V2): number {
  let h = 0;
  let found = false;
  for (const s of surfaces) {
    if (s.kind === "bed" || s.polygon.length < 3 || !pointInPolygon(p, s.polygon)) continue;
    const z = surfaceHeightAt(s, p);
    if (!found || z > h) h = z;
    found = true;
  }
  return found ? h : 0;
}

/** Unit normal of edge a→b pointing into a polygon wound the way `area` says. */
function inwardNormal(a: V2, b: V2, area: number): V2 {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const left = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  return area >= 0 ? left : { x: -left.x, y: -left.y };
}

/**
 * Samples of the ground along the wall from `a` to `b` (a boundary edge of a
 * plot wound with signed area `area`): the plot side's ground, and the lowest
 * ground on either side, every 5 cm and at both ends.
 */
export function groundAlong(a: V2, b: V2, surfaces: Pick<SiteSurface, "kind" | "polygon" | "slope">[], area: number): GroundSample[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return [];
  const nIn = inwardNormal(a, b, area);
  const n = Math.max(1, Math.ceil(len / SAMPLE));
  const out: GroundSample[] = [];
  for (let k = 0; k <= n; k++) {
    // Probe just inside the ends, so a corner isn't read off the next surface along.
    const d = Math.min(len - 0.01, Math.max(0.01, (k * len) / n));
    const p = { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len };
    const inside = groundAt(surfaces, { x: p.x + nIn.x * SIDE_PROBE, y: p.y + nIn.y * SIDE_PROBE });
    const outside = groundAt(surfaces, { x: p.x - nIn.x * SIDE_PROBE, y: p.y - nIn.y * SIDE_PROBE });
    const line = groundAt(surfaces, p);
    out.push({ d: (k * len) / n, plot: inside, low: Math.min(inside, outside, line) });
  }
  return out;
}

/** The way a wall meets its ground when its edge says nothing: walls step beside sloping ground, everything else stays level. */
export function resolveFollow(edge: Pick<BoundaryEdge, "kind" | "follow">, ground: GroundSample[]): WallFollow {
  if (edge.follow) return edge.follow;
  if (edge.kind !== "wall" || !ground.length) return "level";
  const hs = ground.map((g) => g.plot);
  return Math.max(...hs) - Math.min(...hs) >= FLAT_TOLERANCE ? "step" : "level";
}

/** Linear interpolation of a sampled value at distance d. */
function valueAt(ground: GroundSample[], d: number, key: "plot" | "low"): number {
  if (!ground.length) return 0;
  if (d <= ground[0].d) return ground[0][key];
  for (let k = 1; k < ground.length; k++) {
    const g0 = ground[k - 1];
    const g1 = ground[k];
    if (d <= g1.d) {
      const t = g1.d - g0.d > 1e-12 ? (d - g0.d) / (g1.d - g0.d) : 0;
      return g0[key] + (g1[key] - g0[key]) * t;
    }
  }
  return ground[ground.length - 1][key];
}

/** Lowest sampled value over [d0, d1], ends included. */
function minOver(ground: GroundSample[], d0: number, d1: number, key: "plot" | "low"): number {
  let m = Math.min(valueAt(ground, d0, key), valueAt(ground, d1, key));
  for (const g of ground) if (g.d > d0 && g.d < d1) m = Math.min(m, g[key]);
  return m;
}

export interface StepOptions {
  /** Height of one step, metres. Default one brick course. */
  course?: number;
  /** Least distance between steps, metres. */
  minRun?: number;
  /** Least length left after the last step, metres. */
  minEnd?: number;
  /**
   * Length of each level run, measured from the lower end of the wall. Absent:
   * step wherever the ground has climbed another whole course (no closer than `minRun`).
   */
  stepEvery?: number;
}

/**
 * Where a stepped wall of length `len` steps. Automatically, where the plot's
 * ground crosses each whole course above its lowest point; with `stepEvery`, at
 * that spacing from the lower end. Steps are kept `minRun` apart and `minEnd`
 * from the far end.
 */
function stepPositions(len: number, ground: GroundSample[], gref: number, o: Required<Omit<StepOptions, "stepEvery">> & { stepEvery?: number }): number[] {
  const candidates: number[] = [];
  if (o.stepEvery && o.stepEvery > 0) {
    const run = Math.max(o.minRun, o.stepEvery);
    const fromEnd = valueAt(ground, len, "plot") < valueAt(ground, 0, "plot");
    for (let d = run; d < len - 1e-9; d += run) candidates.push(fromEnd ? len - d : d);
    candidates.sort((x, y) => x - y);
  } else {
    const level = (g: number) => Math.floor((g - gref) / o.course + 1e-6);
    for (let k = 1; k < ground.length; k++) {
      const g0 = ground[k - 1];
      const g1 = ground[k];
      const l0 = level(g0.plot);
      const l1 = level(g1.plot);
      if (l0 === l1) continue;
      // Where the ground crosses the course line between these two levels.
      const line = gref + Math.max(l0, l1) * o.course;
      const t = Math.abs(g1.plot - g0.plot) > 1e-12 ? (line - g0.plot) / (g1.plot - g0.plot) : 0.5;
      candidates.push(g0.d + (g1.d - g0.d) * Math.min(1, Math.max(0, t)));
    }
  }
  // Steps within minEnd of the start are pointless too; the run rule takes care of that.
  const steps: number[] = [];
  let last = 0;
  for (const c of candidates) {
    if (c - last >= o.minRun - 1e-9 && len - c >= o.minEnd - 1e-9) {
      steps.push(c);
      last = c;
    }
  }
  return steps;
}

/**
 * The runs of a wall `height` high and `len` long over this ground.
 *
 * - "level": today's wall, from ground level (0) to `height`, one run.
 * - "step": level runs whose tops differ by whole courses. Each run's top is
 *   `height` above the lowest plot-side ground under it, rounded down to a
 *   whole course above the lowest ground along the wall, so on the higher side
 *   of each step the wall is back to (within a course of) its full height.
 * - "rake": the top runs parallel to the plot-side ground, `height` above it.
 *
 * The base of every run is the lowest ground under it on either side, so the
 * wall never floats; ground laid against it (the drive) hides the rest.
 */
export function wallSegments(len: number, height: number, follow: WallFollow, ground: GroundSample[], opts: StepOptions = {}): WallSegment[] {
  if (len <= 1e-9) return [];
  if (follow === "level" || !ground.length) return [{ start: 0, end: len, base: 0, top: height, baseEnd: 0, topEnd: height }];
  if (follow === "rake") {
    // One run between each pair of slope changes in the plot's ground.
    const knots = [0];
    const slope = (i: number) => (ground[i + 1].plot - ground[i].plot) / Math.max(1e-9, ground[i + 1].d - ground[i].d);
    for (let k = 1; k < ground.length - 1; k++) if (Math.abs(slope(k) - slope(k - 1)) > 1e-4) knots.push(ground[k].d);
    knots.push(len);
    const segs: WallSegment[] = [];
    for (let k = 1; k < knots.length; k++) {
      const s = knots[k - 1];
      const e = knots[k];
      if (e - s < 1e-6) continue;
      const base = minOver(ground, s, e, "low");
      segs.push({ start: s, end: e, base, top: valueAt(ground, s, "plot") + height, baseEnd: base, topEnd: valueAt(ground, e, "plot") + height });
    }
    return segs;
  }
  const o = { course: opts.course ?? COURSE, minRun: opts.minRun ?? MIN_STEP_RUN, minEnd: opts.minEnd ?? MIN_END_RUN, stepEvery: opts.stepEvery };
  const gref = Math.min(...ground.map((g) => g.plot));
  const steps = stepPositions(len, ground, gref, o);
  const bounds = [0, ...steps, len];
  const segs: WallSegment[] = [];
  for (let k = 1; k < bounds.length; k++) {
    const s = bounds[k - 1];
    const e = bounds[k];
    const courses = Math.floor((minOver(ground, s, e, "plot") - gref) / o.course + 1e-6);
    const top = height + gref + courses * o.course;
    const base = minOver(ground, s, e, "low");
    const prev = segs[segs.length - 1];
    // Neighbouring runs that come out at the same height are one run.
    if (prev && Math.abs(prev.top - top) < 1e-9) {
      prev.end = e;
      prev.base = prev.baseEnd = Math.min(prev.base, base);
    } else segs.push({ start: s, end: e, base, top, baseEnd: base, topEnd: top });
  }
  return segs;
}

/** Base and top of the wall at distance d: on a step, the higher top and the lower base. */
export function wallAt(segs: WallSegment[], d: number): { base: number; top: number } | null {
  let out: { base: number; top: number } | null = null;
  for (const s of segs) {
    if (d < s.start - 1e-6 || d > s.end + 1e-6) continue;
    const t = s.end - s.start > 1e-9 ? Math.min(1, Math.max(0, (d - s.start) / (s.end - s.start))) : 0;
    const base = s.base + (s.baseEnd - s.base) * t;
    const top = s.top + (s.topEnd - s.top) * t;
    out = out ? { base: Math.min(out.base, base), top: Math.max(out.top, top) } : { base, top };
  }
  return out;
}

/**
 * The runs of boundary edge `i` of a plot (from boundary[i] to the next corner),
 * following the plot's garden surfaces as the edge's `follow` (or its default) says.
 */
export function boundaryWallSegments(
  boundary: V2[],
  edge: Pick<BoundaryEdge, "kind" | "height" | "follow" | "stepEvery">,
  i: number,
  surfaces: Pick<SiteSurface, "kind" | "polygon" | "slope">[],
): WallSegment[] {
  const a = boundary[i];
  const b = boundary[(i + 1) % boundary.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ground = groundAlong(a, b, surfaces, polygonArea(boundary));
  const follow = resolveFollow(edge, ground);
  return wallSegments(len, edge.height, follow, ground, { stepEvery: edge.stepEvery });
}
