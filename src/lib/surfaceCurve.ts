import type { SiteSurface, WPt } from "../types";
import { polygonArea } from "./geometry";
import { rectPoly } from "./site";

/**
 * Smooth garden surfaces: a surface with `smooth` set is drawn as a closed
 * centripetal Catmull-Rom spline through its polygon's points (which stay
 * the control points the editor drags). Everything that needs the real
 * outline (editor path, 3D shape and kerb, areas, export, point-in-surface
 * tests) goes through `surfaceOutline`.
 *
 * Chunk 0 (Björk) landed working first versions; Lily Allen owns this file and its tests (docs/garden-plan.md).
 */

/** Samples per control-point span used by `surfaceOutline` unless told otherwise. */
export const CURVE_SAMPLES = 12;

const dist = (a: WPt, b: WPt) => Math.hypot(b.x - a.x, b.y - a.y);

/** One centripetal Catmull-Rom span from p1 to p2 at t in [0, 1] (Barry-Goldman form). */
function crPoint(p0: WPt, p1: WPt, p2: WPt, p3: WPt, t: number): WPt {
  const k = (a: WPt, b: WPt) => Math.max(Math.sqrt(dist(a, b)), 1e-6);
  const t0 = 0;
  const t1 = t0 + k(p0, p1);
  const t2 = t1 + k(p1, p2);
  const t3 = t2 + k(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: WPt, b: WPt, ta: number, tb: number): WPt => {
    const w = (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/**
 * Points along the closed centripetal Catmull-Rom spline (alpha 0.5) through
 * `poly`, `samples` per span, starting at poly[0] and passing through every
 * control point; the last span closes back to poly[0] (not repeated). Fewer
 * than 3 points: a copy of `poly`.
 */
export function closedSpline(poly: readonly WPt[], samples: number = CURVE_SAMPLES): WPt[] {
  const n = poly.length;
  if (n < 3) return poly.map((p) => ({ x: p.x, y: p.y }));
  const s = Math.max(1, Math.round(samples));
  const out: WPt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const p3 = poly[(i + 2) % n];
    out.push({ x: p1.x, y: p1.y });
    for (let j = 1; j < s; j++) out.push(crPoint(p0, p1, p2, p3, j / s));
  }
  return out;
}

/** The outline a surface is drawn with: the spline when `smooth`, else its polygon as is. */
export function surfaceOutline(surface: Pick<SiteSurface, "polygon" | "smooth">, samples: number = CURVE_SAMPLES): WPt[] {
  return surface.smooth ? closedSpline(surface.polygon, samples) : surface.polygon;
}

/** Control points for a circle (or ellipse) of radii rx, ry about `c`, for the circle draw tool; drawn with smooth: true. */
export function circleControls(c: WPt, rx: number, ry: number = rx, n = 8): WPt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) };
  });
}

/** The four corners of the rectangle spanning a and b, wound like the rest of the site's polygons (lib/site.ts rectPoly). */
export const rectControls = (a: WPt, b: WPt): WPt[] => rectPoly(a.x, a.y, b.x, b.y);

/** Area of the drawn outline, m² (smooth surfaces: the spline's, not the control polygon's). */
export const surfaceArea = (surface: Pick<SiteSurface, "polygon" | "smooth">): number => Math.abs(polygonArea(surfaceOutline(surface)));

/** Length of the drawn outline, metres: the kerb run of a lawn or bed. */
export function surfacePerimeter(surface: Pick<SiteSurface, "polygon" | "smooth">): number {
  const o = surfaceOutline(surface);
  return o.length < 2 ? 0 : o.reduce((s, p, i) => s + dist(p, o[(i + 1) % o.length]), 0);
}

/** SVG path data ("M … Z") of the drawn outline, given a point mapper (world metres to SVG units). */
export function outlinePath(surface: Pick<SiteSurface, "polygon" | "smooth">, toSvg: (p: WPt) => { x: number; y: number }): string {
  const o = surfaceOutline(surface);
  if (!o.length) return "";
  return o.map((p, i) => {
    const q = toSvg(p);
    return `${i ? "L" : "M"}${+q.x.toFixed(2)} ${+q.y.toFixed(2)}`;
  }).join(" ") + " Z";
}
