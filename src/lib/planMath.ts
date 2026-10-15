import type { Fixture, Floor, Opening, OpeningKind, Pt, Room } from "../types";
import type { CatalogueItem } from "./catalogue";
import { polygonArea, pointInPolygon } from "./geometry";

/**
 * Pure helpers for the plan editor: measuring, snapping, numeric edits and
 * view maths. Everything works in floorplan image pixels unless a name says
 * metres; callers convert with the floor's pxPerM.
 */

export const M2_TO_FT2 = 10.7639;

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Area of a polygon traced in image px, in square metres. */
export function areaM2(poly: Pt[], pxPerM: number): number {
  return Math.abs(polygonArea(poly)) / (pxPerM * pxPerM);
}

/** "12.3 m² · 132 ft²" */
export function formatArea(m2: number): string {
  return `${m2.toFixed(1)} m² · ${Math.round(m2 * M2_TO_FT2)} ft²`;
}

/** Length in metres of each edge i (polygon[i] to polygon[i + 1]). */
export function edgeLengthsM(poly: Pt[], pxPerM: number): number[] {
  return poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]) / pxPerM);
}

/**
 * Make edge i lenPx long by sliding its end point (polygon[i + 1]) along the
 * edge's direction. The start stays put, so the neighbouring edge stretches.
 */
export function setEdgeLength(poly: Pt[], i: number, lenPx: number): Pt[] {
  const j = (i + 1) % poly.length;
  const a = poly[i];
  const b = poly[j];
  const len = dist(a, b);
  if (len < 1e-9 || lenPx <= 0) return poly;
  const k = lenPx / len;
  const end = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  return poly.map((p, idx) => (idx === j ? end : p));
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The rectangle when the polygon is a 4-corner axis-aligned rectangle (within tol px), else null. */
export function axisRect(poly: Pt[], tol = 0.5): Rect | null {
  if (poly.length !== 4) return null;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  if (r.x1 - r.x0 < tol || r.y1 - r.y0 < tol) return null;
  const near = (v: number, a: number) => Math.abs(v - a) <= tol;
  const corners = new Set<string>();
  for (const p of poly) {
    const cx = near(p.x, r.x0) ? 0 : near(p.x, r.x1) ? 1 : -1;
    const cy = near(p.y, r.y0) ? 0 : near(p.y, r.y1) ? 1 : -1;
    if (cx < 0 || cy < 0) return null;
    corners.add(`${cx}${cy}`);
  }
  return corners.size === 4 ? r : null;
}

/** Corner of a rectangle on the plan: top-left, top-right, bottom-left, bottom-right. */
export type Corner = "tl" | "tr" | "bl" | "br";

/**
 * Resize an axis-aligned rectangular room to wPx × hPx, keeping the `fixed`
 * corner where it is. Vertex order (and so edge indices) is preserved.
 */
export function resizeRect(poly: Pt[], wPx: number, hPx: number, fixed: Corner): Pt[] {
  const r = axisRect(poly);
  if (!r || wPx <= 0 || hPx <= 0) return poly;
  const left = fixed === "tl" || fixed === "bl";
  const top = fixed === "tl" || fixed === "tr";
  const x0 = left ? r.x0 : r.x1 - wPx;
  const y0 = top ? r.y0 : r.y1 - hPx;
  const midX = (r.x0 + r.x1) / 2;
  const midY = (r.y0 + r.y1) / 2;
  return poly.map((p) => ({ x: p.x < midX ? x0 : x0 + wPx, y: p.y < midY ? y0 : y0 + hPx }));
}

/**
 * Compare a traced size with the printed one, in percent (positive = traced is
 * bigger). Printed width and depth are often given the other way round, so the
 * pairing with the smaller error is used.
 */
export function comparePrinted(tracedW: number, tracedH: number, printed: { w: number; h: number }): { w: number; h: number; worst: number; swapped: boolean } | null {
  if (printed.w <= 0 || printed.h <= 0 || tracedW <= 0 || tracedH <= 0) return null;
  const pct = (t: number, p: number) => ((t - p) / p) * 100;
  const straight = { w: pct(tracedW, printed.w), h: pct(tracedH, printed.h), swapped: false };
  const swapped = { w: pct(tracedW, printed.h), h: pct(tracedH, printed.w), swapped: true };
  const worst = (c: { w: number; h: number }) => Math.max(Math.abs(c.w), Math.abs(c.h));
  const best = worst(swapped) < worst(straight) ? swapped : straight;
  return { ...best, worst: worst(best) };
}

export interface SnapResult {
  p: Pt;
  kind: "corner" | "axis" | "none";
}

/** Snap to the nearest corner within tol, else line up x and y with the nearest corners. */
export function snapPoint(p: Pt, corners: Pt[], tol: number): SnapResult {
  let best: Pt | null = null;
  let bestD = tol;
  let sx: number | null = null;
  let sy: number | null = null;
  let dx = tol;
  let dy = tol;
  for (const v of corners) {
    const d = dist(v, p);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
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

export type Seg = [Pt, Pt];

/** Closest point on segment ab to p, with its distance along the segment (px) and from p. */
export function closestOnSegment(p: Pt, a: Pt, b: Pt): { q: Pt; along: number; len: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { q: a, along: 0, len: 0, d: dist(p, a) };
  const along = Math.max(0, Math.min(len, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  const q = { x: a.x + (dx / len) * along, y: a.y + (dy / len) * along };
  return { q, along, len, d: dist(p, q) };
}

/** The segment nearest to p, with the closest point on it. */
export function nearestSegment(p: Pt, segs: Seg[]): { seg: Seg; q: Pt; d: number } | null {
  let best: { seg: Seg; q: Pt; d: number } | null = null;
  for (const seg of segs) {
    const c = closestOnSegment(p, seg[0], seg[1]);
    if (!best || c.d < best.d) best = { seg, q: c.q, d: c.d };
  }
  return best;
}

/** "h" when a segment runs more left-right than up-down on the plan. */
export const segOrientation = ([a, b]: Seg): "h" | "v" => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v");

export const normDeg = (deg: number) => ((deg % 360) + 360) % 360;

export interface Placement {
  x: number;
  y: number;
  rot: number;
}

/** A wall's centre line in image px with half its thickness. */
export interface WallLine {
  a: Pt;
  b: Pt;
  halfT: number;
}

/**
 * Centre lines of every wall on a floor in image px: room edges (external
 * ones, with no room on one side, at extT; the rest at intT, both metres) and
 * free-standing walls. Shared edges appear once per room, which is harmless
 * for snapping.
 */
export function wallLines(floor: Floor, intT: number, extT: number): WallLine[] {
  const probe = 0.3 * floor.pxPerM;
  const inAny = (p: Pt) => floor.rooms.some((r) => pointInPolygon(p, r.polygon));
  const out: WallLine[] = [];
  for (const r of floor.rooms) {
    r.polygon.forEach((a, i) => {
      const b = r.polygon[(i + 1) % r.polygon.length];
      const len = dist(a, b);
      if (len < 1e-6) return;
      const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const exterior = !(inAny({ x: m.x + n.x * probe, y: m.y + n.y * probe }) && inAny({ x: m.x - n.x * probe, y: m.y - n.y * probe }));
      out.push({ a, b, halfT: ((exterior ? extT : intT) * floor.pxPerM) / 2 });
    });
  }
  for (const w of floor.walls ?? []) out.push({ a: w.a, b: w.b, halfT: (intT * floor.pxPerM) / 2 });
  return out;
}

/**
 * Snap a fixture's back against the nearest wall: the back (local -y at
 * rotation 0) sits on the wall face and the front looks into the room on the
 * side the fixture is already on. Near the end of a wall the side snaps flush
 * into the corner too. Returns null when no wall face is within tol.
 *
 * In a corner, where two walls are in reach, the one that keeps the fixture's
 * current rotation (prefRot) wins unless the other is clearly closer, so a run
 * of units along one wall doesn't swing round at its ends.
 *
 * c: fixture centre; w, d: footprint (px).
 */
export function snapToWall(c: Pt, w: number, d: number, walls: WallLine[], tol: number, prefRot?: number): Placement | null {
  let best: { score: number; place: Placement } | null = null;
  for (const { a, b, halfT } of walls) {
    const len = dist(a, b);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const along = (c.x - a.x) * ux + (c.y - a.y) * uy;
    if (along < 0 || along > len) continue;
    const side = (c.x - a.x) * -uy + (c.y - a.y) * ux; // signed distance along the left normal
    const gap = Math.abs(side) - (d / 2 + halfT);
    if (gap > tol) continue;
    // Inward normal: from the wall towards the fixture.
    const s = side >= 0 ? 1 : -1;
    const n = { x: -uy * s, y: ux * s };
    const rot = normDeg((Math.atan2(-n.x, n.y) * 180) / Math.PI);
    const turnAway = prefRot !== undefined && Math.abs(((rot - prefRot + 540) % 360) - 180) > 1 ? tol : 0;
    const score = Math.abs(gap) + turnAway;
    if (best && score >= best.score) continue;
    let t = along;
    const lo = halfT + w / 2;
    const hi = len - halfT - w / 2;
    if (Math.abs(t - lo) < tol) t = lo;
    else if (Math.abs(t - hi) < tol) t = hi;
    const off = halfT + d / 2;
    best = {
      score,
      place: { x: a.x + ux * t + n.x * off, y: a.y + uy * t + n.y * off, rot: Math.round(rot * 1e6) / 1e6 },
    };
  }
  return best?.place ?? null;
}

/** A placed fixture's footprint (image px) and vertical extent (metres), for lining items up. */
export interface Footprint extends Placement {
  w: number;
  d: number;
  z0: number;
  z1: number;
}

/**
 * Slide a wall-snapped fixture sideways so it sits flush against a neighbour
 * in the same run: same rotation, backs on the same line, overlapping in
 * height (so wall cabinets line up with wall cabinets, not with the base
 * units below), and a side gap or overlap of less than tol px.
 */
export function abutNeighbours(p: Placement, w: number, d: number, z0: number, z1: number, others: Footprint[], tol: number): Placement {
  const r = (p.rot * Math.PI) / 180;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  const n = { x: -Math.sin(r), y: Math.cos(r) };
  let best: number | null = null;
  for (const o of others) {
    if (Math.abs(((o.rot - p.rot + 540) % 360) - 180) > 0.5) continue;
    if (Math.min(z1, o.z1) - Math.max(z0, o.z0) <= 0.005) continue;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const across = dx * n.x + dy * n.y;
    if (Math.abs(across - (o.d - d) / 2) > 1) continue;
    const along = dx * u.x + dy * u.y;
    const reach = (w + o.w) / 2;
    // Shift that makes the facing sides meet.
    const shift = along > 0 ? along - reach : along + reach;
    if (Math.abs(shift) < tol && (best === null || Math.abs(shift) < Math.abs(best))) best = shift;
  }
  return best === null ? p : { x: p.x + u.x * best, y: p.y + u.y * best, rot: p.rot };
}

/** Corners of a w × d rectangle centred on c and rotated clockwise on the plan by rotDeg. */
export function rectCorners(c: Pt, w: number, d: number, rotDeg: number): Pt[] {
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos }));
}

/** Whether two convex polygons overlap by more than eps (touching does not count). */
export function convexOverlap(a: Pt[], b: Pt[], eps = 0): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = dist(p, q);
      if (len < 1e-9) continue;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      const proj = (pts: Pt[]) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of pts) {
          const s = v.x * nx + v.y * ny;
          lo = Math.min(lo, s);
          hi = Math.max(hi, s);
        }
        return [lo, hi];
      };
      const [a0, a1] = proj(a);
      const [b0, b1] = proj(b);
      if (Math.min(a1, b1) - Math.max(a0, b0) <= eps) return false;
    }
  }
  return true;
}

/** A fixture's footprint and vertical extent, for clash checks. */
export interface Solid {
  id: string;
  corners: Pt[];
  /** Bottom and top above the floor, metres. */
  z0: number;
  z1: number;
}

/** Ids of solids that clash with another: overlapping on plan (by more than eps px) and in height. */
export function overlappingIds(solids: Solid[], eps = 0): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i];
      const b = solids[j];
      if (Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) <= 0.005) continue;
      if (convexOverlap(a.corners, b.corners, eps)) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}

/** Door-like openings that are drawn with a swing or fold and can be flipped. */
export const SWING_KINDS: OpeningKind[] = ["door", "front", "french", "bifold"];
/** Openings with a head height (no sill). */
export const DOOR_KINDS: OpeningKind[] = ["door", "front", "french", "bifold", "patio", "garage"];
/** Openings painted in a single colour. */
export const COLOUR_KINDS: OpeningKind[] = ["door", "front", "garage"];

/** Default sill and head heights above the floor, metres. Matches cutWall. */
export function defaultSill(kind: OpeningKind): number | undefined {
  return kind === "window" || kind === "bay" ? 0.9 : undefined;
}
export function defaultHead(kind: OpeningKind): number | undefined {
  if (kind === "door" || kind === "front") return 2.05;
  if (kind === "garage") return 2.15;
  if (kind === "gap") return undefined;
  return 2.1;
}

/**
 * Which side of an opening's wall is outside, as the sign of the local y axis
 * (the default swing side, see doorFrame): 1 or -1, or 0 when both or neither
 * side is in a room (an internal wall, or a stray opening).
 */
export function outsideSide(o: Pick<Opening, "x" | "y" | "orientation">, rooms: Room[], probe: number): 1 | -1 | 0 {
  const n = o.orientation === "h" ? { x: 0, y: 1 } : { x: -1, y: 0 };
  const inside = (s: number) => rooms.some((r) => pointInPolygon({ x: o.x + n.x * probe * s, y: o.y + n.y * probe * s }, r.polygon));
  const pos = inside(1);
  const neg = inside(-1);
  return pos === neg ? 0 : pos ? -1 : 1;
}

/**
 * Hinge and swing frame of a door in image px, shared by the plan symbol and
 * the 3D door. Along the wall the axis runs left to right ("h") or top to
 * bottom ("v"); by default the hinge is at the start jamb and the leaf swings
 * towards (-axis.y, axis.x), i.e. down the plan for "h" walls and left for "v"
 * walls. flipHinge moves the hinge to the far jamb; flipSwing swings to the
 * other side of the wall.
 */
export function doorFrame(o: Pick<Opening, "orientation" | "flipHinge" | "flipSwing">): { axis: Pt; hingeSide: 1 | -1; swing: Pt } {
  const axis = o.orientation === "h" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const s = o.flipSwing ? -1 : 1;
  return { axis, hingeSide: o.flipHinge ? 1 : -1, swing: { x: -axis.y * s, y: axis.x * s } };
}

/**
 * The plan camera: the image point at the top-left of the view and the scale
 * in image px per screen px. Keeping the scale rather than a view box means a
 * resize of the editor neither zooms nor drifts the plan.
 */
export interface Cam {
  x: number;
  y: number;
  s: number;
}

export interface Size {
  w: number;
  h: number;
}

/** The SVG viewBox for a camera on an element of the given size. */
export const viewBoxOf = (c: Cam, el: Size) => ({ x: c.x, y: c.y, w: el.w * c.s, h: el.h * c.s });

/** A camera showing rect r, padded and centred, on an element of the given size. */
export function fitCam(r: Rect, el: Size, padFrac = 0.06): Cam {
  const bw = Math.max(r.x1 - r.x0, 1);
  const bh = Math.max(r.y1 - r.y0, 1);
  const pad = Math.max(bw, bh) * padFrac;
  const s = Math.max((bw + pad * 2) / Math.max(el.w, 1), (bh + pad * 2) / Math.max(el.h, 1));
  return { x: (r.x0 + r.x1) / 2 - (el.w * s) / 2, y: (r.y0 + r.y1) / 2 - (el.h * s) / 2, s };
}

/**
 * Two-finger gesture: the image point that was under screen point m0 ends up
 * under m1, and the scale changes by the ratio of finger spreads d0 / d1. A
 * wheel zoom is the same with m0 = m1. Screen points are element-relative px;
 * the scale is clamped to [minS, maxS].
 */
export function pinchCam(c0: Cam, m0: Pt, m1: Pt, d0: number, d1: number, minS = 0, maxS = Infinity): Cam {
  const s = Math.max(minS, Math.min(maxS, (c0.s * d0) / Math.max(d1, 1e-6)));
  const px = c0.x + m0.x * c0.s;
  const py = c0.y + m0.y * c0.s;
  return { x: px - m1.x * s, y: py - m1.y * s, s };
}

/** Zoom by factor (> 1 zooms in) about element-relative screen point p. */
export const zoomCam = (c: Cam, p: Pt, factor: number, minS = 0, maxS = Infinity) => pinchCam(c, p, p, 1, factor, minS, maxS);

/** Move the plan with the pointer by (dx, dy) screen px. */
export const panCam = (c: Cam, dx: number, dy: number): Cam => ({ x: c.x - dx * c.s, y: c.y - dy * c.s, s: c.s });

/** "3.45 m" */
export const formatLength = (m: number) => `${m.toFixed(2)} m`;

/**
 * Unit inward normal of each edge of a polygon (towards the inside for a
 * simple polygon, whichever way it was traced). Used to put edge labels
 * inside the room.
 */
export function inwardNormals(poly: Pt[]): Pt[] {
  const sign = polygonArea(poly) >= 0 ? 1 : -1;
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const len = dist(a, b) || 1;
    return { x: (-(b.y - a.y) / len) * sign, y: ((b.x - a.x) / len) * sign };
  });
}

/** Add delta degrees to a rotation, normalised to [0, 360). */
export const turn = (rot: number, delta: number) => Math.round(normDeg(rot + delta) * 1e6) / 1e6;

/** A fixture's size in metres (custom or catalogue) and the height of its base above the floor. */
export function fixtureBox(fx: Fixture, item: CatalogueItem): { w: number; d: number; h: number; z0: number } {
  return { w: fx.w ?? item.w, d: fx.d ?? item.d, h: fx.h ?? item.h, z0: item.mount ?? 0 };
}

/** Plan footprints and heights of fixtures for clash checks; unknown catalogue ids are skipped. */
export function fixtureSolids(fixtures: Fixture[], pxPerM: number, lookup: (id: string) => CatalogueItem | undefined): Solid[] {
  const out: Solid[] = [];
  for (const fx of fixtures) {
    const item = lookup(fx.type);
    if (!item) continue;
    const b = fixtureBox(fx, item);
    out.push({ id: fx.id, corners: rectCorners(fx, b.w * pxPerM, b.d * pxPerM, fx.rot), z0: b.z0, z1: b.z0 + b.h });
  }
  return out;
}
