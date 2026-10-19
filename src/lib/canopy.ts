import type { Pt } from "../types";
import { pointInPolygon } from "./geometry";
import { axisRect, resizeRect, snapPoint, type Corner } from "./planMath";

/**
 * Pure helpers for editing a floor's porch canopies (`Floor.canopies`, image
 * px polygons). Canopies have no ids, so they are addressed by index; every
 * helper returns a new array and leaves the input alone, and an index that is
 * out of range changes nothing.
 */

/** Smallest side a dragged rectangle may shrink to, in px. */
const MIN_PX = 2;

const inRange = (canopies: Pt[][], i: number) => Number.isInteger(i) && i >= 0 && i < canopies.length;

const replaceAt = (canopies: Pt[][], i: number, poly: Pt[]) => canopies.map((c, k) => (k === i ? poly : c));

/** The canopy under p, or -1. Later canopies are drawn on top, so they win. */
export function canopyAt(canopies: Pt[][], p: Pt): number {
  for (let i = canopies.length - 1; i >= 0; i--) if (canopies[i].length >= 3 && pointInPolygon(p, canopies[i])) return i;
  return -1;
}

/** Corners of the rectangle between two opposite corners, clockwise from top-left. */
export function rectPolygon(a: Pt, b: Pt): Pt[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Add a rectangular canopy between two opposite corners; a flat sliver (under minPx either way) is ignored. */
export function addCanopy(canopies: Pt[][], a: Pt, b: Pt, minPx = 1): Pt[][] {
  if (Math.abs(a.x - b.x) < minPx || Math.abs(a.y - b.y) < minPx) return canopies;
  return [...canopies, rectPolygon(a, b)];
}

/** Delete one canopy. Deleting the last one leaves an empty list, not undefined. */
export function removeCanopy(canopies: Pt[][], i: number): Pt[][] {
  return inRange(canopies, i) ? canopies.filter((_, k) => k !== i) : canopies;
}

/** Move a whole canopy by (dx, dy). */
export function moveCanopy(canopies: Pt[][], i: number, dx: number, dy: number): Pt[][] {
  if (!inRange(canopies, i)) return canopies;
  return replaceAt(
    canopies,
    i,
    canopies[i].map((p) => ({ x: p.x + dx, y: p.y + dy })),
  );
}

/**
 * Where a canopy dragged by (dx, dy) should end up: one of its corners snaps
 * to a nearby room corner (or lines up with one), whichever pulls least. The
 * result is the adjusted shift, not the new polygon.
 */
export function snapShift(poly: Pt[], dx: number, dy: number, targets: Pt[], tol: number): { dx: number; dy: number } {
  let best: { dx: number; dy: number; d: number } | null = null;
  for (const c of poly) {
    const moved = { x: c.x + dx, y: c.y + dy };
    const s = snapPoint(moved, targets, tol);
    if (s.kind === "none") continue;
    const ax = s.p.x - moved.x;
    const ay = s.p.y - moved.y;
    // A corner snap beats an axis snap; otherwise the smaller pull wins.
    const d = Math.hypot(ax, ay) + (s.kind === "corner" ? 0 : tol);
    if (!best || d < best.d) best = { dx: dx + ax, dy: dy + ay, d };
  }
  return best ? { dx: best.dx, dy: best.dy } : { dx, dy };
}

/**
 * Drag corner idx to p. A rectangular canopy stays a rectangle (the corners
 * either side follow along the shared edges), which is what the roof planner
 * and a porch both want; any other shape just moves that one corner.
 */
export function moveCanopyCorner(canopies: Pt[][], i: number, idx: number, p: Pt): Pt[][] {
  if (!inRange(canopies, i)) return canopies;
  const poly = canopies[i];
  if (idx < 0 || idx >= poly.length) return canopies;
  const r = axisRect(poly);
  if (!r) return replaceAt(canopies, i, poly.map((v, k) => (k === idx ? p : v)));
  const midX = (r.x0 + r.x1) / 2;
  const midY = (r.y0 + r.y1) / 2;
  const grabbed = poly[idx];
  const left = grabbed.x < midX;
  const top = grabbed.y < midY;
  // Stop short of the opposite side so the rectangle never collapses or inverts under the drag.
  const x0 = left ? Math.min(p.x, r.x1 - MIN_PX) : r.x0;
  const x1 = left ? r.x1 : Math.max(p.x, r.x0 + MIN_PX);
  const y0 = top ? Math.min(p.y, r.y1 - MIN_PX) : r.y0;
  const y1 = top ? r.y1 : Math.max(p.y, r.y0 + MIN_PX);
  return replaceAt(
    canopies,
    i,
    poly.map((v) => ({ x: v.x < midX ? x0 : x1, y: v.y < midY ? y0 : y1 })),
  );
}

/** Rectangular canopy's size in px (width × depth), or null for any other shape. */
export function canopySize(poly: Pt[]): { w: number; h: number } | null {
  const r = axisRect(poly);
  return r ? { w: r.x1 - r.x0, h: r.y1 - r.y0 } : null;
}

/** Set a rectangular canopy to wPx × hPx keeping the `fixed` corner put; other shapes are left alone. */
export function resizeCanopy(canopies: Pt[][], i: number, wPx: number, hPx: number, fixed: Corner): Pt[][] {
  if (!inRange(canopies, i)) return canopies;
  return replaceAt(canopies, i, resizeRect(canopies[i], wPx, hPx, fixed));
}
