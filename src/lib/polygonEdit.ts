import type { Pt } from "../types";

/**
 * Polygon editing maths shared by the plan editor (image px) and the site editor (metres).
 * Nothing here knows the unit: tolerances arrive already in model units (SNAP_PX * unitsPerPx).
 */

/** Snap tolerance for corners, axes and edge lines, in screen px. */
export const SNAP_PX = 10;

export interface SnapResult {
  p: Pt;
  kind: "corner" | "axis" | "none";
}

/**
 * Snap to the nearest target within tol; else (unless axis is false) line up x and y separately with the nearest
 * targets. `skip(q, k)` drops target k (at q) from consideration. Strict `<`, so the first target wins a tie.
 */
export function snapPoint(
  p: Pt,
  targets: readonly Pt[],
  tol: number,
  opts: { axis?: boolean; skip?: (q: Pt, k: number) => boolean } = {},
): SnapResult {
  const axis = opts.axis !== false;
  let best: Pt | null = null;
  let bestD = tol;
  let sx: number | null = null;
  let sy: number | null = null;
  let dx = tol;
  let dy = tol;
  for (let k = 0; k < targets.length; k++) {
    const v = targets[k];
    if (opts.skip?.(v, k)) continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
    if (!axis) continue;
    const ax = Math.abs(v.x - p.x);
    const ay = Math.abs(v.y - p.y);
    if (ax < dx) {
      dx = ax;
      sx = v.x;
    }
    if (ay < dy) {
      dy = ay;
      sy = v.y;
    }
  }
  if (best) return { p: { x: best.x, y: best.y }, kind: "corner" };
  if (sx === null && sy === null) return { p, kind: "none" };
  return { p: { x: sx ?? p.x, y: sy ?? p.y }, kind: "axis" };
}

/** Signed area (shoelace); only its sign is used, for the winding. */
function signedArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

/** Unit normal of edge i (vertex i to i+1) pointing OUT of the polygon, whichever way it winds; null for a zero-length edge. */
export function outwardNormal(poly: readonly Pt[], i: number): Pt | null {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return null;
  const sign = signedArea(poly) >= 0 ? 1 : -1;
  return { x: ((b.y - a.y) / len) * sign + 0, y: (-(b.x - a.x) / len) * sign + 0 };
}

/** Component of delta along edge i's outward normal (0 for a zero-length edge). */
export function edgeOffset(poly: readonly Pt[], i: number, delta: Pt): number {
  const n = outwardNormal(poly, i);
  return n ? delta.x * n.x + delta.y * n.y : 0;
}

/** Move edge i by offset along its outward normal; both ends move, neighbours stretch. Copies every point (extra fields kept). */
export function slideEdge<P extends Pt>(poly: readonly P[], i: number, offset: number): P[] {
  const n = poly.length < 3 ? null : outwardNormal(poly, i);
  if (!n) return poly.map((p) => ({ ...p }));
  const j = (i + 1) % poly.length;
  return poly.map((p, k) => (k === i || k === j ? { ...p, x: p.x + n.x * offset, y: p.y + n.y * offset } : { ...p }));
}

/** Snap offset so the slid edge's line passes through the nearest target within tol (strict <, first wins on ties). */
export function snapEdgeOffset(poly: readonly Pt[], i: number, offset: number, targets: readonly Pt[], tol: number): number {
  const n = outwardNormal(poly, i);
  if (!n) return offset;
  const a = poly[i];
  let best = offset;
  let bestD = tol;
  for (const t of targets) {
    const s = (t.x - a.x) * n.x + (t.y - a.y) * n.y;
    const d = Math.abs(s - offset);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export const midpointOf = (poly: readonly Pt[], i: number): Pt => {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

/** Insert p after vertex i (the new vertex is i + 1). */
export function insertVertex<P extends Pt>(poly: readonly P[], i: number, p: P): P[] {
  const out = poly.slice();
  out.splice(i + 1, 0, p);
  return out;
}

/** Remove vertex i, or null when that would leave fewer than min (default 3). */
export function removeVertex<P extends Pt>(poly: readonly P[], i: number, min = 3): P[] | null {
  if (poly.length - 1 < min || i < 0 || i >= poly.length) return null;
  return poly.filter((_, k) => k !== i);
}

/** Replace vertex i with p, keeping any extra fields of the old vertex. */
export function moveVertex<P extends Pt>(poly: readonly P[], i: number, p: Pt): P[] {
  return poly.map((v, k) => (k === i ? { ...v, x: p.x, y: p.y } : v));
}

/** Shift lock for a whole-shape move: keep only the axis the pointer travelled further along (site `move`). */
export function lockToAxis(d: Pt): Pt {
  return Math.abs(d.x) >= Math.abs(d.y) ? { x: d.x, y: 0 } : { x: 0, y: d.y };
}

/** Shift lock for a segment move: keep only the part of d along the segment's normal (plan `wall`). */
export function lockToNormal(d: Pt, a: Pt, b: Pt): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return d;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const k = d.x * n.x + d.y * n.y;
  return { x: n.x * k, y: n.y * k };
}
