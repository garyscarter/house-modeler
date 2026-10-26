import type { EdgeLink, SiteSurface, WPt } from "../types";
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

type Curvable = Pick<SiteSurface, "polygon" | "smooth" | "curves"> & Partial<Pick<SiteSurface, "id" | "links">>;
/** The other surfaces a linked edge may follow (lib callers pass the site's list; without it links are ignored). */
export type Neighbours = readonly Curvable[] | undefined;

/**
 * The outline with only the edges in `curves` drawn as spline spans (edge i runs
 * from poly[i] to poly[i + 1]; each curved span is the same Catmull-Rom span the
 * whole-surface spline would give it, so a curved edge beside a straight one
 * still bulges smoothly). No curved edges: a copy of `poly`.
 */
export function mixedOutline(poly: readonly WPt[], curves: readonly number[], samples: number = CURVE_SAMPLES): WPt[] {
  const n = poly.length;
  if (n < 3 || !curves.length) return poly.map((p) => ({ x: p.x, y: p.y }));
  const s = Math.max(1, Math.round(samples));
  const set = new Set(curves);
  const out: WPt[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: poly[i].x, y: poly[i].y });
    if (!set.has(i)) continue;
    const p0 = poly[(i - 1 + n) % n];
    const p2 = poly[(i + 1) % n];
    const p3 = poly[(i + 2) % n];
    for (let j = 1; j < s; j++) out.push(crPoint(p0, poly[i], p2, p3, j / s));
  }
  return out;
}

/** The link that draws edge i of a surface, if any, with its target found among `surfaces`. */
function linkOf(surface: Curvable, i: number, surfaces: Neighbours): { link: EdgeLink; target: Curvable } | undefined {
  const link = surface.links?.find((l) => l.edge === i);
  if (!link || !surfaces) return undefined;
  const target = surfaces.find((s) => s.id === link.surface && s !== surface);
  if (!target || target.polygon.length < 3 || link.theirEdge >= target.polygon.length) return undefined;
  return { link, target };
}

/** The interior points of edge j of `poly` as drawn: its spline span when curved, nothing when straight. */
function spanPoints(poly: readonly WPt[], j: number, curved: boolean, samples: number): WPt[] {
  if (!curved) return [];
  const n = poly.length;
  const s = Math.max(1, Math.round(samples));
  const out: WPt[] = [];
  for (let k = 1; k < s; k++) out.push(crPoint(poly[(j - 1 + n) % n], poly[j], poly[(j + 1) % n], poly[(j + 2) % n], k / s));
  return out;
}

/**
 * The corners a surface is really drawn through: its own, except at the ends
 * of a linked edge, which come from the surface it follows.
 */
export function resolvedPoints(surface: Curvable, surfaces: Neighbours): WPt[] {
  const n = surface.polygon.length;
  const pts = surface.polygon.map((p) => ({ x: p.x, y: p.y }));
  if (!surfaces || !surface.links?.length) return pts;
  for (let i = 0; i < n; i++) {
    const r = linkOf(surface, i, surfaces);
    if (!r) continue;
    const a = r.target.polygon[r.link.theirEdge];
    const b = r.target.polygon[(r.link.theirEdge + 1) % r.target.polygon.length];
    const [p, q] = r.link.reversed ? [b, a] : [a, b];
    pts[i] = { x: p.x, y: p.y };
    pts[(i + 1) % n] = { x: q.x, y: q.y };
  }
  return pts;
}

/**
 * The outline a surface is drawn with: the spline when `smooth`, its curved
 * edges when some are, else its polygon as is. Given the site's surfaces, a
 * linked edge is drawn as the edge it follows (the other surface's own
 * drawing of it, reversed as needed), so the two meet exactly.
 */
export function surfaceOutline(surface: Curvable, surfaces?: Neighbours, samples: number = CURVE_SAMPLES): WPt[] {
  const linked = !!surfaces && !!surface.links?.some((l) => linkOf(surface, l.edge, surfaces));
  if (!linked) {
    if (surface.smooth) return closedSpline(surface.polygon, samples);
    if (surface.curves?.length) return mixedOutline(surface.polygon, surface.curves, samples);
    return surface.polygon;
  }
  const pts = resolvedPoints(surface, surfaces);
  const n = pts.length;
  const out: WPt[] = [];
  for (let i = 0; i < n; i++) {
    out.push(pts[i]);
    const r = linkOf(surface, i, surfaces);
    if (r) {
      const j = r.link.theirEdge;
      const span = spanPoints(r.target.polygon, j, edgeCurved(r.target, j), samples);
      out.push(...(r.link.reversed ? span.reverse() : span));
    } else if (edgeCurved(surface, i)) out.push(...spanPoints(pts, i, true, samples));
  }
  return out;
}

/** A link that could be made: the edge of another surface lying along edge `i`, by its ends; `reversed` when the two run opposite ways. */
export interface LinkCandidate {
  surface: string;
  theirEdge: number;
  reversed: boolean;
  /** How far the two edges' ends are apart in all, metres. */
  gap: number;
}

/** The nearest other surface's edge whose ends lie within `tol` of this edge's ends (either way round), if any. */
export function linkCandidate(surface: Curvable, i: number, surfaces: readonly Curvable[], tol = 0.6): LinkCandidate | undefined {
  const n = surface.polygon.length;
  if (n < 3 || i >= n) return undefined;
  const e0 = surface.polygon[i];
  const e1 = surface.polygon[(i + 1) % n];
  let best: LinkCandidate | undefined;
  for (const s of surfaces) {
    if (s === surface || !s.id || s.id === surface.id || s.polygon.length < 3) continue;
    const m = s.polygon.length;
    for (let j = 0; j < m; j++) {
      if (s.links?.some((l) => l.edge === j)) continue; // never follow an edge that itself follows another
      const a = s.polygon[j];
      const b = s.polygon[(j + 1) % m];
      const fwd = dist(e0, a) + dist(e1, b);
      const rev = dist(e0, b) + dist(e1, a);
      const gap = Math.min(fwd, rev);
      if (gap <= 2 * tol && (!best || gap < best.gap)) best = { surface: s.id, theirEdge: j, reversed: rev < fwd, gap };
    }
  }
  return best;
}

/** The surface with edge i following `cand`: its ends snapped onto the other edge, and no curve of its own there. */
export function linkEdge<S extends Curvable>(surface: S, i: number, cand: LinkCandidate, surfaces: readonly Curvable[]): S {
  const target = surfaces.find((s) => s.id === cand.surface);
  const n = surface.polygon.length;
  const polygon = surface.polygon.map((p) => ({ x: p.x, y: p.y }));
  if (target) {
    const a = target.polygon[cand.theirEdge];
    const b = target.polygon[(cand.theirEdge + 1) % target.polygon.length];
    const [p, q] = cand.reversed ? [b, a] : [a, b];
    polygon[i] = { x: p.x, y: p.y };
    polygon[(i + 1) % n] = { x: q.x, y: q.y };
  }
  const links = [...(surface.links ?? []).filter((l) => l.edge !== i), { edge: i, surface: cand.surface, theirEdge: cand.theirEdge, reversed: cand.reversed }];
  const curves = surface.curves?.filter((k) => k !== i);
  return { ...surface, polygon, links, curves: curves?.length ? curves : undefined };
}

/** The surface with edge i on its own again, keeping the curve it was following as its own curve. */
export function unlinkEdge<S extends Curvable>(surface: S, i: number, surfaces: Neighbours): S {
  const r = linkOf(surface, i, surfaces);
  const polygon = resolvedPoints(surface, surfaces);
  const links = (surface.links ?? []).filter((l) => l.edge !== i);
  const wasCurved = !!r && edgeCurved(r.target, r.link.theirEdge);
  const curves = surface.smooth ? surface.curves : wasCurved ? [...new Set([...(surface.curves ?? []), i])].sort((a, b) => a - b) : surface.curves;
  return { ...surface, polygon, links: links.length ? links : undefined, curves: curves?.length ? curves : undefined };
}

/** A surface's own links after a corner is inserted after polygon[i]: a link on the split edge is dropped, later ones move up. */
export function linksAfterInsert(links: readonly EdgeLink[] | undefined, i: number): EdgeLink[] | undefined {
  if (!links?.length) return undefined;
  const out = links.filter((l) => l.edge !== i).map((l) => (l.edge > i ? { ...l, edge: l.edge + 1 } : l));
  return out.length ? out : undefined;
}

/** A surface's own links after corner i is removed: links on the two edges that met it are dropped, later ones move down. */
export function linksAfterRemove(links: readonly EdgeLink[] | undefined, i: number, n: number): EdgeLink[] | undefined {
  if (!links?.length || n < 4) return undefined;
  const before = (i - 1 + n) % n;
  const out = links.filter((l) => l.edge !== before && l.edge !== i).map((l) => (i === 0 || l.edge > i ? { ...l, edge: l.edge - 1 } : l));
  return out.length ? out : undefined;
}

/** Every surface's links to surface `id` after a corner is inserted after its polygon[j]: links to the split edge go, later ones move up. */
export function relinkAfterInsert<S extends Curvable>(surfaces: readonly S[], id: string, j: number): S[] {
  return surfaces.map((s) => {
    if (!s.links?.some((l) => l.surface === id)) return s;
    const links = s.links.filter((l) => l.surface !== id || l.theirEdge !== j).map((l) => (l.surface === id && l.theirEdge > j ? { ...l, theirEdge: l.theirEdge + 1 } : l));
    return { ...s, links: links.length ? links : undefined };
  });
}

/** Every surface's links to surface `id` after its corner i (of n) is removed: links to the two merged edges go, later ones move down. */
export function relinkAfterRemove<S extends Curvable>(surfaces: readonly S[], id: string, i: number, n: number): S[] {
  const before = (i - 1 + n) % n;
  return surfaces.map((s) => {
    if (!s.links?.some((l) => l.surface === id)) return s;
    const links = s.links
      .filter((l) => l.surface !== id || (l.theirEdge !== before && l.theirEdge !== i))
      .map((l) => (l.surface === id && (i === 0 || l.theirEdge > i) ? { ...l, theirEdge: l.theirEdge - 1 } : l));
    return { ...s, links: links.length ? links : undefined };
  });
}

/** Whether edge i (polygon[i] to polygon[i + 1]) of a surface is drawn curved. */
export const edgeCurved = (surface: Curvable, i: number): boolean => !!surface.smooth || !!surface.curves?.includes(i);

/**
 * The surface's `smooth` and `curves` with edge i curved or straight: every edge
 * curved folds into `smooth`, none leaves both unset.
 */
export function setEdgeCurved(surface: Curvable, i: number, on: boolean): Pick<SiteSurface, "smooth" | "curves"> {
  const n = surface.polygon.length;
  const all = Array.from({ length: n }, (_, k) => k);
  const now = new Set(surface.smooth ? all : surface.curves ?? []);
  if (on) now.add(i);
  else now.delete(i);
  const list = all.filter((k) => now.has(k));
  if (list.length === n && n > 0) return { smooth: true, curves: undefined };
  return { smooth: false, curves: list.length ? list : undefined };
}

/** The curved-edge list after a corner is inserted after polygon[i] (the old edge i splits into edges i and i + 1, both curved if it was). */
export function curvesAfterInsert(curves: readonly number[] | undefined, i: number): number[] | undefined {
  if (!curves?.length) return undefined;
  const out = new Set<number>();
  for (const k of curves) {
    if (k < i) out.add(k);
    else if (k === i) out.add(i), out.add(i + 1);
    else out.add(k + 1);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The curved-edge list after corner i of an n-corner polygon is removed: the
 * two edges that met it merge into one, curved if either was.
 */
export function curvesAfterRemove(curves: readonly number[] | undefined, i: number, n: number): number[] | undefined {
  if (!curves?.length || n < 4) return undefined;
  const before = (i - 1 + n) % n;
  const merged = i === 0 ? n - 2 : i - 1;
  const out = new Set<number>();
  for (const k of curves) {
    if (k === before || k === i) out.add(merged);
    else if (i === 0 || k > i) out.add(k - 1);
    else out.add(k);
  }
  return [...out].sort((a, b) => a - b);
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
export const surfaceArea = (surface: Curvable, surfaces?: Neighbours): number => Math.abs(polygonArea(surfaceOutline(surface, surfaces)));

/** Length of the drawn outline, metres: the kerb run of a lawn or bed. */
export function surfacePerimeter(surface: Curvable, surfaces?: Neighbours): number {
  const o = surfaceOutline(surface, surfaces);
  return o.length < 2 ? 0 : o.reduce((s, p, i) => s + dist(p, o[(i + 1) % o.length]), 0);
}

/** SVG path data ("M … Z") of the drawn outline, given a point mapper (world metres to SVG units). */
export function outlinePath(surface: Curvable, toSvg: (p: WPt) => { x: number; y: number }, surfaces?: Neighbours): string {
  const o = surfaceOutline(surface, surfaces);
  if (!o.length) return "";
  return o.map((p, i) => {
    const q = toSvg(p);
    return `${i ? "L" : "M"}${+q.x.toFixed(2)} ${+q.y.toFixed(2)}`;
  }).join(" ") + " Z";
}
