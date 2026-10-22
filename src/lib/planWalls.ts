import type { Floor, Pt } from "../types";
import { buildWalls, cutWall, type V2 } from "./geometry";
import { wallEnds, wallThickness } from "./walls";
import type { WallLine } from "./planMath";

/**
 * Walls as they are drawn in the plan editor: the same segments, thicknesses
 * and mitred corners the 3D shell builds (buildWalls, wallThickness, wallEnds),
 * returned as polygons in floorplan image px with each opening's width cut out
 * of the wall it sits in. Room polygons follow wall centre lines; these are the
 * real faces, so furniture can be placed against them.
 */

export interface PlanWall {
  /** Index of the wall in buildWalls(floor), shared by all the pieces of one wall. */
  wall: number;
  /** Outline of one solid stretch of the wall (between openings), image px. */
  poly: Pt[];
  /** Wall thickness in image px. */
  thickness: number;
  /** True for an external wall (cavity thickness), false for a partition or free-standing wall. */
  exterior: boolean;
}

/** Extra overlap at a closed corner, metres, as in the 3D shell. */
const SEAM = 0.003;

function toPx(floor: Floor, p: V2): Pt {
  return {
    x: (p.x - floor.offset.x) * floor.pxPerM + floor.origin.x,
    y: (p.y - floor.offset.y) * floor.pxPerM + floor.origin.y,
  };
}

/** Keep the part of a convex polygon where `inside(p) >= 0` (Sutherland-Hodgman, one edge). */
function clip(poly: V2[], inside: (p: V2) => number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = inside(p);
    const dq = inside(q);
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const k = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
    }
  }
  return out;
}

/** Sort and join overlapping intervals. */
function union(iv: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...iv].sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** The solid stretches of every wall on a floor, as polygons in image px. */
export function planWalls(floor: Floor): PlanWall[] {
  const walls = buildWalls(floor);
  const thick = walls.map(wallThickness);
  const ends = wallEnds(walls, thick);
  const ppm = floor.pxPerM;
  const out: PlanWall[] = [];
  walls.forEach((wall, i) => {
    const dx = wall.b.x - wall.a.x;
    const dy = wall.b.y - wall.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const dir = { x: dx / len, y: dy / len };
    const n = { x: -dir.y, y: dir.x };
    const h = thick[i] / 2;
    const e = ends[i];
    // Along-wall extent of each face. Side 0 is +n, side 1 is -n. The outer face runs round a corner;
    // the face inside the corner stops at the other wall's face, which mitres the end.
    const start = (s: 0 | 1) => (e.inner[0]?.side === s ? -e.inner[0].ext : -e.ext[0] - (e.ext[0] ? SEAM : 0));
    const end = (s: 0 | 1) => (e.inner[1]?.side === s ? len + e.inner[1].ext : len + e.ext[1] + (e.ext[1] ? SEAM : 0));
    // Local frame: x along the wall from a, y across it along n.
    const local: V2[] = [
      { x: start(0), y: h },
      { x: end(0), y: h },
      { x: end(1), y: -h },
      { x: start(1), y: -h },
    ];
    const lo = Math.min(start(0), start(1));
    const hi = Math.max(end(0), end(1));
    // Every opening, whatever its height, is a gap in the plan.
    const { placements } = cutWall(wall, 3);
    const gaps = union(
      placements.map((pl): [number, number] => {
        const tc = (pl.centre.x - wall.a.x) * dir.x + (pl.centre.y - wall.a.y) * dir.y;
        return [tc - pl.width / 2, tc + pl.width / 2];
      }),
    );
    const solids: [number, number][] = [];
    let cursor = lo;
    for (const [g0, g1] of gaps) {
      if (g0 > cursor + 1e-6) solids.push([cursor, g0]);
      cursor = Math.max(cursor, g1);
    }
    if (hi > cursor + 1e-6) solids.push([cursor, hi]);
    for (const [s0, s1] of solids) {
      const piece = clip(clip(local, (p) => p.x - s0), (p) => s1 - p.x);
      if (piece.length < 3) continue;
      out.push({
        wall: i,
        poly: piece.map((p) => toPx(floor, { x: wall.a.x + dir.x * p.x + n.x * p.y, y: wall.a.y + dir.y * p.x + n.y * p.y })),
        thickness: thick[i] * ppm,
        exterior: !!wall.exterior,
      });
    }
  });
  return out;
}

/**
 * Centre lines and half thicknesses of the walls the 3D shell builds, in
 * image px, for snapping furniture to the wall faces drawn by planWalls.
 */
export function planWallLines(floor: Floor): WallLine[] {
  return buildWalls(floor).map((w) => ({ a: toPx(floor, w.a), b: toPx(floor, w.b), halfT: (wallThickness(w) * floor.pxPerM) / 2 }));
}
