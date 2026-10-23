import type { Pt } from "../types";
import type { Rect } from "./fixtureGroups";
import { rectCorners, type WallLine } from "./planMath";

/** Drag-time aids in the plan editor, all in image px: gaps from a box to the walls, and alignment between furniture. */

export interface Clearance {
  /** Direction in the box's own frame. */
  dir: "left" | "right" | "up" | "down";
  /** The dimension line: from the box edge to the wall face. */
  from: Pt;
  to: Pt;
  px: number;
}

const EPS = 1e-6;

/** Clip the segment p-q to lo <= coordinate <= hi; null when nothing remains. */
function clip(p: Pt, q: Pt, key: "x" | "y", lo: number, hi: number): [Pt, Pt] | null {
  const a = p[key];
  const b = q[key];
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(b - a) < 1e-12) {
    if (a < lo - EPS || a > hi + EPS) return null;
  } else {
    let ta = (lo - a) / (b - a);
    let tb = (hi - a) / (b - a);
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(0, ta);
    t1 = Math.min(1, tb);
    if (t0 > t1 + EPS) return null;
  }
  const at = (t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  return [at(t0), at(Math.max(t0, t1))];
}

/**
 * Free distance from each side of a box to the nearest wall face in front of it,
 * measured straight out from the side (so only wall that overlaps the side counts).
 * Sides with nothing within maxPx are left out.
 */
export function wallClearances(box: { c: Pt; w: number; d: number; rot: number }, walls: WallLine[], maxPx: number): Clearance[] {
  const r = (box.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const toLocal = (p: Pt): Pt => {
    const dx = p.x - box.c.x;
    const dy = p.y - box.c.y;
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  };
  const toImage = (p: Pt): Pt => ({ x: box.c.x + p.x * cos - p.y * sin, y: box.c.y + p.x * sin + p.y * cos });
  const hw = box.w / 2;
  const hd = box.d / 2;

  // Each wall as the four edges of its face rectangle, in the box's frame.
  const edges: [Pt, Pt][] = [];
  for (const wl of walls) {
    const dx = wl.b.x - wl.a.x;
    const dy = wl.b.y - wl.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (-dy / len) * wl.halfT;
    const ny = (dx / len) * wl.halfT;
    const c = [
      { x: wl.a.x + nx, y: wl.a.y + ny },
      { x: wl.b.x + nx, y: wl.b.y + ny },
      { x: wl.b.x - nx, y: wl.b.y - ny },
      { x: wl.a.x - nx, y: wl.a.y - ny },
    ].map(toLocal);
    for (let i = 0; i < 4; i++) edges.push([c[i], c[(i + 1) % 4]]);
  }

  const sides: { dir: Clearance["dir"]; sign: 1 | -1; along: "x" | "y"; half: number; across: "x" | "y"; band: number }[] = [
    { dir: "right", sign: 1, along: "x", half: hw, across: "y", band: hd },
    { dir: "left", sign: -1, along: "x", half: hw, across: "y", band: hd },
    { dir: "down", sign: 1, along: "y", half: hd, across: "x", band: hw },
    { dir: "up", sign: -1, along: "y", half: hd, across: "x", band: hw },
  ];
  const out: Clearance[] = [];
  for (const s of sides) {
    let best: { gap: number; across: number } | null = null;
    for (const [p, q] of edges) {
      const inBand = clip(p, q, s.across, -s.band, s.band);
      if (!inBand) continue;
      // Keep only what lies at or beyond the box's edge on this side.
      const lo = s.sign === 1 ? s.half - EPS : -Infinity;
      const hi = s.sign === 1 ? Infinity : -s.half + EPS;
      const ahead = clip(inBand[0], inBand[1], s.along, lo, hi);
      if (!ahead) continue;
      for (const pt of ahead) {
        const gap = s.sign * pt[s.along] - s.half;
        if (gap < -EPS) continue;
        if (!best || gap < best.gap) best = { gap: Math.max(0, gap), across: Math.max(-s.band, Math.min(s.band, pt[s.across])) };
      }
    }
    if (!best || best.gap > maxPx) continue;
    const found = best;
    const mk = (along: number): Pt => toImage(s.along === "x" ? { x: along, y: found.across } : { x: found.across, y: along });
    out.push({ dir: s.dir, from: mk(s.sign * s.half), to: mk(s.sign * (s.half + found.gap)), px: found.gap });
  }
  return out;
}

/** The axis-aligned bounds of a w × d box centred on c and turned by rot degrees. */
export function boxRect(c: Pt, w: number, d: number, rot: number): Rect {
  const pts = rectCorners(c, w, d, rot);
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

const xs = (r: Rect) => [r.x0, (r.x0 + r.x1) / 2, r.x1];
const ys = (r: Rect) => [r.y0, (r.y0 + r.y1) / 2, r.y1];

/** The smallest shift (under tol) that lines the moving box's left / centre / right (top / middle / bottom) up with another's, per allowed axis. */
export function alignSnap(moving: Rect, others: Rect[], tol: number, axes: { x: boolean; y: boolean }): { dx: number; dy: number } {
  const best = (mine: number[], theirs: number[][]) => {
    let b = 0;
    let bAbs = tol;
    for (const t of theirs)
      for (const m of mine)
        for (const o of t) {
          const diff = o - m;
          if (Math.abs(diff) < bAbs) {
            bAbs = Math.abs(diff);
            b = diff;
          }
        }
    return b;
  };
  return {
    dx: axes.x ? best(xs(moving), others.map(xs)) : 0,
    dy: axes.y ? best(ys(moving), others.map(ys)) : 0,
  };
}

/** A line to draw: axis "x" is a vertical line at x = at running from y = from to y = to; axis "y" is horizontal. */
export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

/** Lines through every exact (within eps) edge or centre match between the moving box and another, spanning both; same-position lines merge. */
export function alignGuides(moving: Rect, others: Rect[], eps = 0.5): Guide[] {
  const out: Guide[] = [];
  const add = (axis: "x" | "y", at: number, from: number, to: number) => {
    const g = out.find((o) => o.axis === axis && Math.abs(o.at - at) <= eps);
    if (g) {
      g.from = Math.min(g.from, from);
      g.to = Math.max(g.to, to);
    } else out.push({ axis, at, from, to });
  };
  for (const o of others) {
    for (const m of xs(moving)) for (const t of xs(o)) if (Math.abs(m - t) <= eps) add("x", t, Math.min(moving.y0, o.y0), Math.max(moving.y1, o.y1));
    for (const m of ys(moving)) for (const t of ys(o)) if (Math.abs(m - t) <= eps) add("y", t, Math.min(moving.x0, o.x0), Math.max(moving.x1, o.x1));
  }
  return out;
}
