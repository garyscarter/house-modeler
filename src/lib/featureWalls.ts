import type { Floor, Pt, Room, WallOverride } from "../types";
import { polygonArea, roomWorldPolygon, type V2 } from "./geometry";
import { worldToBearing } from "./sun";
import type { Span } from "./walls";

/**
 * Feature walls: a room's walls can each carry their own covering
 * (Room.wallFinishes, keyed by polygon edge). The 3D walls are merged from
 * every room's edges, so a built wall piece has to be matched back to the
 * edge it runs along; one edge can be split over several wall pieces (by
 * openings or a change of neighbour) and one piece can cover parts of
 * several edges.
 */

/** Lines this far apart (metres) are the same wall: buildWalls merges parallel edges up to 0.22 m apart. */
const LINE_TOL = 0.25;
/** cos of about 6 degrees, as in buildWalls. */
const PARALLEL = 0.995;
/** Shorter overlaps than this (metres) are slivers at corners, not a wall. */
const MIN_RUN = 1e-3;

export interface EdgeSpan {
  edge: number;
  /** Metres from the segment's `a` end. */
  t0: number;
  t1: number;
}

/**
 * Which of a polygon's edges a wall segment runs along, as intervals of the
 * segment. An edge counts when it is parallel to the segment, within
 * LINE_TOL of its line, and overlaps it; where two edges claim the same
 * stretch the nearer wins. Sorted along the segment.
 */
export function edgeSpans(seg: { a: V2; b: V2 }, poly: V2[], tol = LINE_TOL): EdgeSpan[] {
  const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
  if (len < 1e-9) return [];
  const dir = { x: (seg.b.x - seg.a.x) / len, y: (seg.b.y - seg.a.y) / len };
  const along = (p: V2) => (p.x - seg.a.x) * dir.x + (p.y - seg.a.y) * dir.y;
  const off = (p: V2) => Math.abs((p.x - seg.a.x) * -dir.y + (p.y - seg.a.y) * dir.x);
  const cands: (EdgeSpan & { d: number })[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const el = Math.hypot(q.x - p.x, q.y - p.y);
    if (el < 1e-9 || Math.abs(((q.x - p.x) * dir.x + (q.y - p.y) * dir.y) / el) < PARALLEL) return;
    const d = Math.max(off(p), off(q));
    if (d > tol) return;
    const t0 = Math.max(0, Math.min(along(p), along(q)));
    const t1 = Math.min(len, Math.max(along(p), along(q)));
    if (t1 - t0 > MIN_RUN) cands.push({ edge: i, t0, t1, d });
  });
  cands.sort((x, y) => x.d - y.d);
  const out: EdgeSpan[] = [];
  const claimed: [number, number][] = [];
  for (const c of cands) {
    // What of this edge's stretch nearer edges have not already taken.
    let free: [number, number][] = [[c.t0, c.t1]];
    for (const [c0, c1] of claimed)
      free = free
        .flatMap(([f0, f1]): [number, number][] => [
          [f0, Math.min(f1, c0)],
          [Math.max(f0, c1), f1],
        ])
        .filter(([f0, f1]) => f1 - f0 > MIN_RUN);
    for (const [t0, t1] of free) out.push({ edge: c.edge, t0, t1 });
    claimed.push([c.t0, c.t1]);
  }
  return out.sort((x, y) => x.t0 - y.t0);
}

/**
 * Split the room spans along one side of a wall (from sideSpans) where they
 * pass from one of the room's edges to the next, tagging each part with its
 * edge. Parts along no edge of their room (a wall that only grazes it) keep
 * no edge and take the room's own covering.
 */
export function spansByEdge(seg: { a: V2; b: V2 }, spans: Span[], polyOf: (roomId: string) => V2[] | undefined): Span[] {
  return spans.flatMap((s) => {
    const poly = s.roomId ? polyOf(s.roomId) : undefined;
    if (!poly) return [s];
    const parts: Span[] = [];
    let cursor = s.t0;
    for (const e of edgeSpans(seg, poly)) {
      const t1 = Math.min(e.t1, s.t1);
      let t0 = Math.max(e.t0, cursor);
      if (t1 - t0 < MIN_RUN) continue;
      if (t0 - cursor > MIN_RUN) parts.push({ t0: cursor, t1: t0, roomId: s.roomId });
      else t0 = cursor;
      parts.push({ t0, t1, roomId: s.roomId, edge: e.edge });
      cursor = t1;
    }
    if (!parts.length) return [s];
    if (s.t1 - cursor > MIN_RUN) parts.push({ t0: cursor, t1: s.t1, roomId: s.roomId });
    else parts[parts.length - 1].t1 = s.t1;
    return parts;
  });
}

/** Overrides keyed by edge, keeping only edges a polygon of `n` corners has; undefined when none are left. */
function tidy(entries: [number, WallOverride][], n: number): Record<number, WallOverride> | undefined {
  const kept = entries.filter(([i]) => Number.isInteger(i) && i >= 0 && i < n);
  return kept.length ? Object.fromEntries(kept) : undefined;
}

const entriesOf = (room: Room): [number, WallOverride][] => Object.entries(room.wallFinishes ?? {}).map(([k, v]) => [Number(k), v]);

/**
 * Add a corner after polygon[i], splitting edge i in two. Both halves keep
 * edge i's finish and the edges after it move up by one.
 */
export function insertCorner(room: Room, i: number, p: Pt): Pick<Room, "polygon" | "wallFinishes"> {
  const polygon = [...room.polygon.slice(0, i + 1), p, ...room.polygon.slice(i + 1)];
  const moved = entriesOf(room).flatMap(([j, o]): [number, WallOverride][] => (j < i ? [[j, o]] : j === i ? [[i, o], [i + 1, o]] : [[j + 1, o]]));
  return { polygon, wallFinishes: tidy(moved, polygon.length) };
}

/**
 * Remove corner i, joining the edges either side of it. The joined edge
 * keeps the finish of the edge before the corner (or, without one, the edge
 * after it) and the edges after it move down by one.
 */
export function removeCorner(room: Room, i: number): Pick<Room, "polygon" | "wallFinishes"> {
  const n = room.polygon.length;
  const polygon = room.polygon.filter((_, j) => j !== i);
  const fin = room.wallFinishes ?? {};
  const before = (i - 1 + n) % n;
  const joined = fin[before] ?? fin[i];
  const moved = entriesOf(room).flatMap(([j, o]): [number, WallOverride][] => (j === i || j === before ? [] : [[j < i ? j : j - 1, o]]));
  if (joined) moved.push([before < i ? before : before - 1, joined]);
  return { polygon, wallFinishes: tidy(moved, polygon.length) };
}

/** Set or clear (null) one wall's override. */
export function setWallOverride(room: Room, edge: number, o: WallOverride | null): Room["wallFinishes"] {
  const rest = entriesOf(room).filter(([j]) => j !== edge);
  return tidy(o ? [...rest, [edge, o]] : rest, room.polygon.length);
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const PLAN_SIDE = ["front", "right", "rear", "left"];

/**
 * Where a room's edge i leads, to tell its walls apart in a list: the room
 * that shares it ("to Kitchen"), or for an outside wall the way it faces, by
 * compass when the site's orientation is known and by side of the house
 * otherwise.
 */
export function edgeLabel(floor: Floor, room: Room, i: number, frontBearing?: number): string {
  const poly = roomWorldPolygon(floor, room);
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return "";
  let best: { name: string; run: number } | null = null;
  for (const other of floor.rooms) {
    if (other.id === room.id) continue;
    const run = edgeSpans({ a, b }, roomWorldPolygon(floor, other)).reduce((s, e) => s + e.t1 - e.t0, 0);
    if (run > 0.2 && (!best || run > best.run)) best = { name: other.name, run };
  }
  if (best) return `to ${best.name}`;
  // Outward normal: the polygon's winding says which side of the edge is inside.
  const sign = polygonArea(poly) >= 0 ? 1 : -1;
  const out = { x: ((b.y - a.y) / len) * sign, z: (-(b.x - a.x) / len) * sign };
  if (frontBearing !== undefined) return `outside, faces ${COMPASS[Math.round(worldToBearing(frontBearing, out.x, out.z) / 45) % 8]}`;
  // Plan sides: +z is the front, +x the right.
  const k = Math.round(Math.atan2(out.x, out.z) / (Math.PI / 2));
  return `outside, ${PLAN_SIDE[(k + 4) % 4]}`;
}
