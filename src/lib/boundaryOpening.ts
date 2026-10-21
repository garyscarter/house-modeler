import type { Site, WPt } from "../types";
import { closestOnSegment } from "./site";

/**
 * Widening (or narrowing) an opening in a boundary wall.
 *
 * The boundary line itself is not changed: one end of the opening slides along
 * the line of the wall next to it, so that wall gets shorter or longer. Garden
 * surfaces that met the moved corner (the drive, the lawn) follow it.
 */

/** A neighbouring wall is never left shorter than this, metres. */
export const MIN_NEIGHBOUR = 0.2;
/** An opening is never narrower than this, metres. */
export const MIN_OPENING = 0.3;
/** Surface vertices this close to a boundary corner move with it, metres. */
export const COINCIDENT = 0.03;

/** Which end of an edge moves: "start" is boundary[i], "end" is boundary[i + 1]. */
export type OpeningEnd = "start" | "end";
/** Which neighbouring edge's line a corner slides along: the one before it or the one after it. */
export type SlideAlong = "prev" | "next";

const dist = (a: WPt, b: WPt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Length of boundary edge i (from boundary[i] to the next corner), metres. */
export function edgeLength(site: Pick<Site, "boundary">, i: number): number {
  const n = site.boundary.length;
  return dist(site.boundary[i], site.boundary[(i + 1) % n]);
}

/** Width of an opening: the length of its edge. */
export const openingWidth = edgeLength;

/** The corner that moves for an end of edge `edge`, the corner beyond it on the neighbouring wall, and the fixed corner. */
function ends(n: number, edge: number, end: OpeningEnd) {
  return end === "start"
    ? { corner: edge, far: (edge - 1 + n) % n, fixed: (edge + 1) % n, neighbourEdge: (edge - 1 + n) % n }
    : { corner: (edge + 1) % n, far: (edge + 2) % n, fixed: edge, neighbourEdge: (edge + 1) % n };
}

/** The neighbouring edge that shortens or lengthens when `end` of `edge` moves. */
export const neighbourEdgeOf = (site: Pick<Site, "boundary">, edge: number, end: OpeningEnd) => ends(site.boundary.length, edge, end).neighbourEdge;

/** The end to move by default: the one whose neighbouring edge is the longer straight wall. */
export function defaultOpeningEnd(site: Pick<Site, "boundary">, edge: number): OpeningEnd {
  const n = site.boundary.length;
  return edgeLength(site, ends(n, edge, "end").neighbourEdge) > edgeLength(site, ends(n, edge, "start").neighbourEdge) ? "end" : "start";
}

/**
 * Distance s along the line from `a` (direction `u`, unit) at which the point
 * is `w` from `f`; the root nearer `s0`. Null when the line never gets that near.
 */
function solveAlong(a: WPt, u: WPt, f: WPt, w: number, s0: number): number | null {
  const d = { x: f.x - a.x, y: f.y - a.y };
  const ud = u.x * d.x + u.y * d.y;
  const disc = ud * ud - (d.x * d.x + d.y * d.y) + w * w;
  if (disc < 0) return null;
  const r = Math.sqrt(disc);
  return Math.abs(ud + r - s0) < Math.abs(ud - r - s0) ? ud + r : ud - r;
}

/**
 * Move boundary corner `index` to `p`. Surface vertices that sat on the corner
 * (within 3 cm) move with it.
 *
 * Where a surface edge that ends on the corner (the drive's side) has another
 * surface's vertex partway along it (the lawn's, the path's), the nearest such
 * vertex becomes a pivot: every surface passing through it gets a vertex there,
 * and only the stretch between the pivot and the corner swings out. So the drive
 * widens, the lawn beside it narrows along the same line, and nothing gaps or
 * overlaps, while what lies beyond the pivot stays put.
 */
export function moveBoundaryCorner(site: Site, index: number, p: WPt): Site {
  const old = site.boundary[index];
  if (!old || (old.x === p.x && old.y === p.y)) return site;
  const near = (q: WPt, c: WPt) => dist(q, c) < COINCIDENT;

  // Pivots: for each surface edge ending on the corner, the other-surface vertex on it nearest the corner.
  const pivots: { at: WPt; dir: WPt }[] = [];
  for (const s of site.surfaces) {
    const m = s.polygon.length;
    s.polygon.forEach((u, j) => {
      const v = s.polygon[(j + 1) % m];
      if (near(u, old) === near(v, old)) return;
      const [fixed, end] = near(u, old) ? [v, u] : [u, v];
      const len = dist(fixed, end);
      let best: WPt | null = null;
      for (const o of site.surfaces) {
        if (o.id === s.id) continue;
        for (const q of o.polygon) {
          if (near(q, fixed) || near(q, end) || dist(q, closestOnSegment(q, fixed, end)) >= COINCIDENT) continue;
          if (!best || dist(q, end) < dist(best, end)) best = q;
        }
      }
      if (best && len > 1e-9) pivots.push({ at: { x: best.x, y: best.y }, dir: { x: (end.x - fixed.x) / len, y: (end.y - fixed.y) / len } });
    });
  }

  const surfaces = site.surfaces.map((s) => {
    let polygon = s.polygon;
    // Give every surface a vertex at each pivot that lies along one of its edges.
    for (const pv of pivots) {
      const m = polygon.length;
      if (polygon.some((q) => near(q, pv.at))) continue;
      for (let j = 0; j < m; j++) {
        const u = polygon[j];
        const v = polygon[(j + 1) % m];
        const len = dist(u, v);
        const parallel = len > 1e-9 && Math.abs(((v.x - u.x) * pv.dir.y - (v.y - u.y) * pv.dir.x) / len) < 0.02;
        if (parallel && dist(pv.at, closestOnSegment(pv.at, u, v)) < COINCIDENT) {
          polygon = [...polygon.slice(0, j + 1), { x: pv.at.x, y: pv.at.y }, ...polygon.slice(j + 1)];
          break;
        }
      }
    }
    // Then the vertices on the corner follow it.
    const moved = polygon.map((q) => (near(q, old) ? { x: p.x, y: p.y } : q));
    const changed = polygon !== s.polygon || moved.some((q, i) => q !== polygon[i]);
    return changed ? { ...s, polygon: moved } : s;
  });

  return { ...site, boundary: site.boundary.map((q, i) => (i === index ? { x: p.x, y: p.y } : q)), surfaces };
}

/**
 * Where corner `index` goes when dragged to `p` but held on the line of the
 * edge before it ("prev") or after it ("next"). The wall on that line keeps at
 * least MIN_NEIGHBOUR, and the edge on the other side at least MIN_OPENING.
 */
export function slidePoint(site: Pick<Site, "boundary">, index: number, along: SlideAlong, p: WPt): WPt {
  const n = site.boundary.length;
  const c = site.boundary[index];
  const a = site.boundary[along === "prev" ? (index - 1 + n) % n : (index + 1) % n];
  const f = site.boundary[along === "prev" ? (index + 1) % n : (index - 1 + n) % n];
  const len = dist(a, c);
  if (len < 1e-9) return c;
  const u = { x: (c.x - a.x) / len, y: (c.y - a.y) / len };
  let s = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
  s = Math.max(MIN_NEIGHBOUR, s);
  const at = (t: number): WPt => ({ x: a.x + u.x * t, y: a.y + u.y * t });
  if (dist(at(s), f) < MIN_OPENING) s = solveAlong(a, u, f, MIN_OPENING, len) ?? s;
  return at(Math.max(MIN_NEIGHBOUR, s));
}

/** Drag corner `index` along the line of a neighbouring edge, taking linked surface vertices with it. */
export function slideCorner(site: Site, index: number, along: SlideAlong, p: WPt): Site {
  return moveBoundaryCorner(site, index, slidePoint(site, index, along, p));
}

/**
 * Set the width of boundary edge `edge`. The chosen end (default: see
 * defaultOpeningEnd) slides along the line of its neighbouring wall; the
 * boundary's line is unchanged. Width is held to at least MIN_OPENING and the
 * neighbouring wall to at least MIN_NEIGHBOUR, so a very large width stops short.
 */
export function setOpeningWidth(site: Site, edge: number, width: number, end?: OpeningEnd): Site {
  const n = site.boundary.length;
  if (n < 3 || !site.boundary[edge] || !Number.isFinite(width)) return site;
  const e = ends(n, edge, end ?? defaultOpeningEnd(site, edge));
  const a = site.boundary[e.far];
  const c = site.boundary[e.corner];
  const f = site.boundary[e.fixed];
  const len = dist(a, c);
  if (len < 1e-9) return site;
  const u = { x: (c.x - a.x) / len, y: (c.y - a.y) / len };
  let s = solveAlong(a, u, f, Math.max(MIN_OPENING, width), len);
  // Out of reach (the line never gets this close): the nearest point on it.
  if (s === null) s = (f.x - a.x) * u.x + (f.y - a.y) * u.y;
  s = Math.max(MIN_NEIGHBOUR, s);
  return moveBoundaryCorner(site, e.corner, { x: a.x + u.x * s, y: a.y + u.y * s });
}
