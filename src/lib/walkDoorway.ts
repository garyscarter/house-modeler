import { pointInPolygon, polygonCentroid, type V2 } from "./geometry";
import { ALL_OPEN, internalOf, levelIndex, inGarden, standable } from "./walkNav";
import { wrapAngle } from "./walkMotion";
import { yawOf, type NavWorld, type WalkPoint, type WalkPose, type WalkRoute } from "./walkTypes";

/**
 * Doorway stops: a tour stop or a mini-map room tap ends just inside the doorway, so one look round shows the
 * whole room (the owner's ask). Pure: works on a route that already exists.
 */

/** A target region: a room, or the garden (roomId null: outside every room on the lowest level, inside the plot). */
export interface DoorwayRegion {
  level: number;
  roomId: string | null;
}
export interface DoorwayStop {
  /** The route trimmed to end just inside the region. */
  route: WalkRoute;
  /** The way to face on arrival (also route.yaw). */
  yaw: number;
  /** How far to sweep each side of `yaw`, radians (left first, then right). */
  sweep: { left: number; right: number };
  /** Where the route first entered the region, and whether the walker was already in it or no entry was found. */
  entry: V2 | null;
  fallback: boolean;
}

export const DOORWAY_INSETS = [0.6, 0.45, 0.3] as const;
const DEG = Math.PI / 180;
const VIEW_LIMIT = 110 * DEG;
const SWEEP_MARGIN = 12 * DEG;
const SWEEP_MIN = 20 * DEG;
const SWEEP_MAX = 75 * DEG;
const INSIDE_SWEEP = 60 * DEG;

const clampSweep = (half: number): number => Math.max(SWEEP_MIN, Math.min(SWEEP_MAX, half));

/** The facing and sweep from a stand point S, given the way you were travelling and the region's outline. */
function faceFrom(S: V2, travel: number, outline: V2[]): { yaw: number; sweep: { left: number; right: number } } {
  const rel = outline.map((v) => wrapAngle(yawOf({ x: v.x - S.x, y: v.y - S.y }) - travel)).filter((a) => Math.abs(a) <= VIEW_LIMIT);
  if (!rel.length) return { yaw: travel, sweep: { left: SWEEP_MIN, right: SWEEP_MIN } };
  const lo = Math.min(...rel);
  const hi = Math.max(...rel);
  const half = clampSweep((hi - lo) / 2 - SWEEP_MARGIN);
  return { yaw: wrapAngle(travel + (lo + hi) / 2), sweep: { left: half, right: half } };
}

export function doorwayStop(nav: NavWorld, route: WalkRoute, from: WalkPose, region: DoorwayRegion, inset: number = DOORWAY_INSETS[0]): DoorwayStop | null {
  const I = internalOf(nav);
  if (!I || !I.levels.length) return null;
  const garden = region.roomId === null;
  const li = garden ? I.gardenLi : levelIndex(I, region.level);
  const level = I.levels[li].level;
  const room = garden ? null : nav.levels[li].rooms.find((r) => r.id === region.roomId) ?? null;
  if (!garden && !room) return null;
  const outline: V2[] = garden ? nav.plot ?? [] : room!.poly;
  if (!outline.length) return null;
  const inside = (p: V2): boolean => (garden ? inGarden(I, li, p) : pointInPolygon(p, room!.poly));
  const here = (p: { x: number; y: number; level: number; stair: number | null }): boolean => p.stair === null && p.level === level && inside(p);
  const free = (p: V2): boolean => inside(p) && standable(I, li, p, ALL_OPEN);

  const poly: WalkPoint[] = [{ x: from.x, y: from.y, level: from.level, stair: from.stair }, ...route.points];
  const centre = garden ? polygonCentroid(outline) : polygonCentroid(room!.poly);
  const lastPt = poly[poly.length - 1];
  const keepAsIs = (): DoorwayStop => ({
    route,
    yaw: route.yaw ?? yawOf({ x: lastPt.x - poly[Math.max(0, poly.length - 2)].x, y: lastPt.y - poly[Math.max(0, poly.length - 2)].y }),
    sweep: { left: 35 * DEG, right: 35 * DEG },
    entry: null,
    fallback: true,
  });

  // Already in the region: stay put and face its middle.
  if (here(poly[0])) {
    const yaw = Math.hypot(centre.x - from.x, centre.y - from.y) > 0.3 ? yawOf({ x: centre.x - from.x, y: centre.y - from.y }) : from.yaw;
    return { route: { points: [], doors: [], yaw }, yaw, sweep: { left: INSIDE_SWEEP, right: INSIDE_SWEEP }, entry: null, fallback: true };
  }

  // The first crossing into the region.
  let j = -1;
  for (let k = 1; k < poly.length; k++) {
    if (!here(poly[k - 1]) && here(poly[k])) {
      j = k - 1;
      break;
    }
  }
  if (j < 0) return keepAsIs();
  const a = poly[j];
  const b = poly[j + 1];
  let lo = 0; // outside
  let hi = 1; // inside
  for (let n = 0; n < 24; n++) {
    const m = (lo + hi) / 2;
    if (inside({ x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m })) hi = m;
    else lo = m;
  }
  const E: WalkPoint = { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi, level: b.level, stair: b.stair };
  const travel = yawOf({ x: b.x - a.x, y: b.y - a.y });

  // Walk on along the route from E by `inset`.
  const tail: WalkPoint[] = [E, ...poly.slice(j + 1)];
  const along = (d: number): { S: WalkPoint; kept: number } => {
    let left = d;
    for (let k = 1; k < tail.length; k++) {
      const len = Math.hypot(tail[k].x - tail[k - 1].x, tail[k].y - tail[k - 1].y);
      if (left <= len || k === tail.length - 1) {
        const u = len > 0 ? Math.min(1, left / len) : 0;
        return { S: { x: tail[k - 1].x + (tail[k].x - tail[k - 1].x) * u, y: tail[k - 1].y + (tail[k].y - tail[k - 1].y) * u, level: tail[k].level, stair: tail[k].stair }, kept: k - 1 };
      }
      left -= len;
    }
    return { S: E, kept: 0 };
  };
  const insets = [inset, ...DOORWAY_INSETS.filter((v) => v < inset)];
  for (const d of insets) {
    const { S, kept } = along(d);
    if (!free(S)) continue;
    // tail[1..kept] are original points j+1.. (in poly terms) that lie before S.
    // A waypoint a hair before S would add a pointless kink at the end: let S replace it.
    const between = tail.slice(1, kept + 1).filter((q) => Math.hypot(q.x - S.x, q.y - S.y) > 0.12);
    const points = [...route.points.slice(0, j), E, ...between, S];
    const lastOld = j + kept - 1; // highest original route.points index kept
    const doors = route.doors.filter((x) => x.index <= lastOld || x.index <= j).map((x) => (x.index <= j ? x : { ...x, index: x.index + 1 }));
    const face = faceFrom(S, travel, outline);
    return { route: { points, doors, yaw: face.yaw }, yaw: face.yaw, sweep: face.sweep, entry: { x: E.x, y: E.y }, fallback: false };
  }
  return keepAsIs();
}
