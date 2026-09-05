import type { Floor, Opening, Pt, Room } from "../types";

export interface V2 {
  x: number;
  y: number;
}

/** Wall segment in world metres (x, z plane). */
export interface WallSeg {
  a: V2;
  b: V2;
  /** Openings that sit on this segment, with their position along it. */
  openings: { opening: Opening; t: number }[];
  /** True when only one room touches this wall (an external wall). */
  exterior?: boolean;
  /** A room that contributed this wall (used for exterior colour). */
  roomId?: string;
}

export function polygonArea(poly: V2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function polygonCentroid(poly: V2[]): V2 {
  const a = polygonArea(poly);
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bbox(poly: V2[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Convert an image pixel point to world metres (x -> x, y -> z). */
export function toWorld(floor: Floor, p: Pt): V2 {
  return {
    x: (p.x - floor.origin.x) / floor.pxPerM + floor.offset.x,
    y: (p.y - floor.origin.y) / floor.pxPerM + floor.offset.y,
  };
}

export function roomWorldPolygon(floor: Floor, room: Room): V2[] {
  return room.polygon.map((p) => toWorld(floor, p));
}

/**
 * Snap near-equal x and y coordinates across all rooms so shared walls line up.
 * `tol` is in image pixels.
 */
export function snapRooms(rooms: Room[], tol: number): Room[] {
  const snapAxis = (vals: number[]) => {
    const sorted = [...new Set(vals)].sort((a, b) => a - b);
    const map = new Map<number, number>();
    let cluster: number[] = [];
    const flush = () => {
      if (!cluster.length) return;
      const mean = cluster.reduce((s, v) => s + v, 0) / cluster.length;
      for (const v of cluster) map.set(v, mean);
      cluster = [];
    };
    for (const v of sorted) {
      if (cluster.length && v - cluster[cluster.length - 1] > tol) flush();
      cluster.push(v);
    }
    flush();
    return map;
  };
  const xs = snapAxis(rooms.flatMap((r) => r.polygon.map((p) => p.x)));
  const ys = snapAxis(rooms.flatMap((r) => r.polygon.map((p) => p.y)));
  return rooms.map((r) => ({
    ...r,
    polygon: dedupeConsecutive(
      r.polygon.map((p) => ({ x: xs.get(p.x) ?? p.x, y: ys.get(p.y) ?? p.y })),
    ),
  }));
}

function dedupeConsecutive(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) out.pop();
  }
  return out;
}

/**
 * Build a deduplicated wall list for a floor. Every room edge becomes a wall;
 * collinear, overlapping edges (shared walls between rooms) are merged so we
 * don't get z-fighting or doubled walls.
 */
export function buildWalls(floor: Floor): WallSeg[] {
  interface Edge {
    dir: V2; // unit direction
    c: number; // signed distance of line from origin along the normal
    t0: number;
    t1: number;
    roomId: string;
    /** No room on one side of this edge. */
    exterior: boolean;
    /** Exterior colour key so brick and render walls stay separate segments. */
    colorKey: string;
  }
  const edges: Edge[] = [];
  const polys = floor.rooms.map((r) => roomWorldPolygon(floor, r));
  const inAnyRoom = (p: V2) => polys.some((poly) => pointInPolygon(p, poly));
  for (let ri = 0; ri < floor.rooms.length; ri++) {
    const room = floor.rooms[ri];
    const poly = polys[ri];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nx = -dy / len;
      const ny = dx / len;
      const exterior = !(inAnyRoom({ x: mid.x + nx * 0.3, y: mid.y + ny * 0.3 }) && inAnyRoom({ x: mid.x - nx * 0.3, y: mid.y - ny * 0.3 }));
      const colorKey = exterior ? room.exteriorColor ?? "" : "";
      let dir = { x: dx / len, y: dy / len };
      // Canonical direction so opposite edges group together.
      if (dir.x < -1e-9 || (Math.abs(dir.x) < 1e-9 && dir.y < 0)) dir = { x: -dir.x, y: -dir.y };
      const n = { x: -dir.y, y: dir.x };
      const c = a.x * n.x + a.y * n.y;
      const ta = a.x * dir.x + a.y * dir.y;
      const tb = b.x * dir.x + b.y * dir.y;
      edges.push({ dir, c, t0: Math.min(ta, tb), t1: Math.max(ta, tb), roomId: room.id, exterior, colorKey });
    }
  }

  const ANG = 0.995; // cos of ~6 degrees
  const OFF = 0.22; // metres between parallel lines to count as the same wall
  const groups: Edge[][] = [];
  for (const e of edges) {
    const g = groups.find((grp) => {
      const r = grp[0];
      const dot = r.dir.x * e.dir.x + r.dir.y * e.dir.y;
      return dot > ANG && Math.abs(r.c - e.c) < OFF && r.exterior === e.exterior && r.colorKey === e.colorKey;
    });
    if (g) g.push(e);
    else groups.push([e]);
  }

  const walls: WallSeg[] = [];
  for (const g of groups) {
    const dir = g[0].dir;
    const n = { x: -dir.y, y: dir.x };
    const c = g.reduce((s, e) => s + e.c, 0) / g.length;
    const intervals = g.map((e) => [e.t0, e.t1, e.roomId] as [number, number, string]).sort((a, b) => a[0] - b[0]);
    const merged: { t0: number; t1: number; rooms: Set<string> }[] = [];
    for (const [t0, t1, roomId] of intervals) {
      const last = merged[merged.length - 1];
      if (last && t0 <= last.t1 + 0.05) {
        last.t1 = Math.max(last.t1, t1);
        last.rooms.add(roomId);
      } else merged.push({ t0, t1, rooms: new Set([roomId]) });
    }
    for (const { t0, t1, rooms } of merged) {
      walls.push({
        a: { x: dir.x * t0 + n.x * c, y: dir.y * t0 + n.y * c },
        b: { x: dir.x * t1 + n.x * c, y: dir.y * t1 + n.y * c },
        openings: [],
        exterior: g[0].exterior,
        roomId: [...rooms][0],
      });
    }
  }

  // Attach openings to the nearest wall.
  for (const op of floor.openings) {
    const p = toWorld(floor, { x: op.x, y: op.y });
    let best: { wall: WallSeg; t: number; d: number } | null = null;
    for (const w of walls) {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const ux = dx / len;
      const uy = dy / len;
      const t = (p.x - w.a.x) * ux + (p.y - w.a.y) * uy;
      const tc = Math.max(0, Math.min(len, t));
      const cx = w.a.x + ux * tc;
      const cy = w.a.y + uy * tc;
      let d = Math.hypot(p.x - cx, p.y - cy);
      // Prefer walls whose direction matches the opening's stated orientation.
      const horizontal = Math.abs(ux) > Math.abs(uy);
      if ((op.orientation === "h") !== horizontal) d += 0.5;
      if (!best || d < best.d) best = { wall: w, t: tc, d };
    }
    if (best && best.d < 0.9) best.wall.openings.push({ opening: op, t: best.t });
  }
  return walls;
}

/** Pieces of a wall after cutting out its openings. Heights in metres. */
export interface WallPiece {
  a: V2;
  b: V2;
  y0: number;
  y1: number;
}

export interface OpeningPlacement {
  opening: Opening;
  centre: V2;
  dir: V2;
  width: number;
}

export function cutWall(
  wall: WallSeg,
  ceiling: number,
  doorH = 2.05,
  sillH = 0.9,
  windowTop = 2.1,
): { pieces: WallPiece[]; placements: OpeningPlacement[] } {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy);
  const dir = { x: dx / len, y: dy / len };
  const at = (t: number): V2 => ({ x: wall.a.x + dir.x * t, y: wall.a.y + dir.y * t });
  const ops = [...wall.openings].sort((p, q) => p.t - q.t);
  const pieces: WallPiece[] = [];
  const placements: OpeningPlacement[] = [];
  let cursor = 0;
  for (const { opening, t } of ops) {
    const w = Math.min(opening.widthM, len);
    let t0 = Math.max(0, t - w / 2);
    let t1 = Math.min(len, t + w / 2);
    if (t0 < cursor) t0 = cursor;
    if (t1 - t0 < 0.2) continue;
    if (t0 > cursor) pieces.push({ a: at(cursor), b: at(t0), y0: 0, y1: ceiling });
    if (opening.kind === "door" || opening.kind === "garage") {
      pieces.push({ a: at(t0), b: at(t1), y0: opening.kind === "garage" ? 2.15 : doorH, y1: ceiling });
    } else {
      // window or bay
      pieces.push({ a: at(t0), b: at(t1), y0: 0, y1: sillH });
      pieces.push({ a: at(t0), b: at(t1), y0: windowTop, y1: ceiling });
    }
    placements.push({ opening, centre: at((t0 + t1) / 2), dir, width: t1 - t0 });
    cursor = t1;
  }
  if (cursor < len - 0.01) pieces.push({ a: at(cursor), b: at(len), y0: 0, y1: ceiling });
  return { pieces, placements };
}

/** Median of a list, or undefined when empty. */
export function median(vals: number[]): number | undefined {
  if (!vals.length) return undefined;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Work out image pixels per metre from rooms that carry printed dimensions.
 * Uses area so it doesn't matter which printed number is width vs depth.
 */
export function estimatePxPerM(rooms: Room[]): number | undefined {
  const est: number[] = [];
  for (const r of rooms) {
    if (!r.dims || r.dims.w <= 0 || r.dims.h <= 0) continue;
    const b = bbox(r.polygon);
    if (b.w <= 0 || b.h <= 0) continue;
    est.push(Math.sqrt((b.w * b.h) / (r.dims.w * r.dims.h)));
  }
  return median(est);
}

export function floorFootprint(floor: Floor) {
  const pts = floor.rooms.flatMap((r) => roomWorldPolygon(floor, r));
  if (!pts.length) return { x0: -5, y0: -5, x1: 5, y1: 5, w: 10, h: 10 };
  return bbox(pts);
}

/** Overall model bounds across floors, world metres. */
export function modelBounds(floors: Floor[]) {
  const pts = floors.flatMap((f) => f.rooms.flatMap((r) => roomWorldPolygon(f, r)));
  if (!pts.length) return { x0: -5, y0: -5, x1: 5, y1: 5, w: 10, h: 10 };
  return bbox(pts);
}

export function pointInPolygon(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Parts of walls in `a` that are not covered by any wall in `b` (collinear
 * within tolerance). Used to show what a renovation removes or adds.
 */
export function diffWalls(a: WallSeg[], b: WallSeg[]): WallSeg[] {
  const ANG = 0.995;
  const OFF = 0.25;
  const out: WallSeg[] = [];
  for (const w of a) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const dir = { x: dx / len, y: dy / len };
    const n = { x: -dir.y, y: dir.x };
    const c = w.a.x * n.x + w.a.y * n.y;
    // Intervals along w covered by walls in b.
    const covered: [number, number][] = [];
    for (const o of b) {
      const odx = o.b.x - o.a.x;
      const ody = o.b.y - o.a.y;
      const olen = Math.hypot(odx, ody);
      if (olen < 1e-6) continue;
      const dot = Math.abs((odx * dir.x + ody * dir.y) / olen);
      if (dot < ANG) continue;
      const oc = o.a.x * n.x + o.a.y * n.y;
      if (Math.abs(oc - c) > OFF) continue;
      const t0 = (o.a.x - w.a.x) * dir.x + (o.a.y - w.a.y) * dir.y;
      const t1 = (o.b.x - w.a.x) * dir.x + (o.b.y - w.a.y) * dir.y;
      covered.push([Math.max(0, Math.min(t0, t1)), Math.min(len, Math.max(t0, t1))]);
    }
    covered.sort((p, q) => p[0] - q[0]);
    let cursor = 0;
    const emit = (t0: number, t1: number) => {
      if (t1 - t0 < 0.15) return;
      out.push({
        a: { x: w.a.x + dir.x * t0, y: w.a.y + dir.y * t0 },
        b: { x: w.a.x + dir.x * t1, y: w.a.y + dir.y * t1 },
        openings: [],
      });
    };
    for (const [c0, c1] of covered) {
      if (c1 <= cursor) continue;
      if (c0 > cursor) emit(cursor, c0);
      cursor = Math.max(cursor, c1);
    }
    emit(cursor, len);
  }
  return out;
}
