import type { V2 } from "./geometry";
import { fitTransform, type FitTransform } from "./footprint";
import { pointInPolygon } from "./geometry";
import type { WalkPose } from "./walkTypes";

/** Maths for the walk mini-map: plan metres into a square picture, plan up = -z (world z is plan y, so no flip). */

/** Fit the polygons into a sizePx square. */
export function mapFit(polys: V2[][], sizePx: number, pad = 8): FitTransform {
  return fitTransform(polys, sizePx, sizePx, pad);
}

/** SVG transform for the marker: at the walker, its cone (drawn pointing up) turned to the yaw. Yaw grows turning left; SVG rotate grows clockwise. */
export function markerTransform(fit: FitTransform, pose: Pick<WalkPose, "x" | "y" | "yaw">): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  const deg = -(pose.yaw * 180) / Math.PI;
  return `translate(${r(pose.x * fit.scale + fit.tx)},${r(pose.y * fit.scale + fit.ty)}) rotate(${r(deg)})`;
}

/** The map pixel to plan metres. */
export function mapToWorld(fit: FitTransform, px: number, py: number): V2 {
  return { x: (px - fit.tx) / fit.scale, y: (py - fit.ty) / fit.scale };
}

/** The room under a map pixel (the smallest when rooms overlap), or null. */
export function roomUnder(fit: FitTransform, rooms: { id: string; poly: V2[] }[], px: number, py: number): string | null {
  const p = mapToWorld(fit, px, py);
  let best: string | null = null;
  let bestArea = Infinity;
  for (const r of rooms) {
    if (!pointInPolygon(p, r.poly)) continue;
    const a = Math.abs(r.poly.reduce((s, q, i) => { const n = r.poly[(i + 1) % r.poly.length]; return s + q.x * n.y - n.x * q.y; }, 0)) / 2;
    if (a < bestArea) { best = r.id; bestArea = a; }
  }
  return best;
}
