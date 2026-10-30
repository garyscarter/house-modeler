import type { Floor } from "../types";
import { byId, type CatalogueItem } from "./catalogue";
import { toWorld, WALL_T, type V2 } from "./geometry";
import { fixtureBox, rectCorners } from "./planMath";

/**
 * Bulkheads: boxes hung flush from a ceiling (catalogue "bulkhead"), the boxing-in along a wall that hides a
 * flight passing over it, or pipes and ducts. Plain plan geometry in world metres, shared by the 3D stairs (a
 * flight under a bulkhead is boxed down to its underside, not given a soffit) and the 3D fixtures (the box is
 * left out where a flight passes up through it).
 */

/** A bulkhead on the plan: its footprint (convex, world metres) and the height of its underside above the floor. */
export interface Bulkhead {
  pts: V2[];
  bottom: number;
}

export const isBulkhead = (item: Pick<CatalogueItem, "symbol">): boolean => item.symbol === "bulkhead";

/**
 * How far past its own edges a bulkhead boxes a flight in, metres: half a partition and a little, so one built
 * against a wall also covers the flight where it passes over that wall's thickness.
 */
export const BULKHEAD_REACH = WALL_T / 2 + 0.01;

/** The bulkheads of a floor, in world metres, for a storey `ceiling` metres high. */
export function floorBulkheads(floor: Floor, ceiling: number): Bulkhead[] {
  const out: Bulkhead[] = [];
  for (const fx of floor.fixtures ?? []) {
    const item = byId(fx.type);
    if (!item || !isBulkhead(item)) continue;
    const b = fixtureBox(fx, item, ceiling);
    if (b.w <= 0 || b.d <= 0) continue;
    out.push({ pts: rectCorners(fx, b.w * floor.pxPerM, b.d * floor.pxPerM, fx.rot).map((p) => toWorld(floor, p)), bottom: b.z0 });
  }
  return out;
}

/** Twice the signed area of a polygon. */
const area2 = (p: V2[]) => p.reduce((s, a, i) => s + a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y, 0);
const areaOf = (p: V2[]): number => Math.abs(area2(p)) / 2;

/** Pieces smaller than this (m²) are slivers of rounding and are dropped. */
const MIN_AREA = 1e-5;

/** The part of convex `poly` on the side of line a→b where `side` > 0 (side = +1 left, -1 right). */
function halfPlane(poly: V2[], a: V2, b: V2, keep: 1 | -1): V2[] {
  const f = (p: V2) => keep * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = f(p);
    const fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp > 0 && fq < 0) || (fp < 0 && fq > 0)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/**
 * Convex `poly` split by convex `cut`: the piece inside the cut (or null) and the convex pieces outside it.
 * Slivers under MIN_AREA are dropped.
 */
export function splitConvex(poly: V2[], cut: V2[]): { inside: V2[] | null; outside: V2[][] } {
  const inward: 1 | -1 = area2(cut) >= 0 ? 1 : -1;
  const outside: V2[][] = [];
  let rest = poly;
  for (let i = 0; i < cut.length && rest.length >= 3; i++) {
    const a = cut[i];
    const b = cut[(i + 1) % cut.length];
    const out = halfPlane(rest, a, b, inward === 1 ? -1 : 1);
    if (out.length >= 3 && areaOf(out) > MIN_AREA) outside.push(out);
    rest = halfPlane(rest, a, b, inward);
  }
  const inside = rest.length >= 3 && areaOf(rest) > MIN_AREA ? rest : null;
  return { inside, outside };
}

/** Convex `poly` less each convex polygon in `cuts`: the convex pieces left. */
export function subtractConvex(poly: V2[], cuts: V2[][]): V2[][] {
  let pieces = [poly];
  for (const c of cuts) pieces = pieces.flatMap((p) => splitConvex(p, c).outside);
  return pieces;
}

/** Convex `poly` grown outwards by `d` metres on every side (each edge moved out, corners mitred). */
export function growConvex(poly: V2[], d: number): V2[] {
  const n = poly.length;
  const sgn = area2(poly) >= 0 ? 1 : -1;
  // Each edge moved out along its outward normal, as a point and direction.
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (sgn * (b.y - a.y)) / len;
    const ny = (-sgn * (b.x - a.x)) / len;
    return { p: { x: a.x + nx * d, y: a.y + ny * d }, v: { x: b.x - a.x, y: b.y - a.y } };
  });
  return poly.map((_, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const l1 = lines[i];
    const den = l0.v.x * l1.v.y - l0.v.y * l1.v.x;
    if (Math.abs(den) < 1e-12) return l1.p;
    const t = ((l1.p.x - l0.p.x) * l1.v.y - (l1.p.y - l0.p.y) * l1.v.x) / den;
    return { x: l0.p.x + l0.v.x * t, y: l0.p.y + l0.v.y * t };
  });
}
