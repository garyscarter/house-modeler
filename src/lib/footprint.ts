import type { V2 } from "./geometry";

/** A scale and offset that carry plan metres into a w × h picture. */
export interface FitTransform {
  scale: number;
  tx: number;
  ty: number;
}

/** Bounding box of some points, or null when there are none. */
export function boundsOf(polys: V2[][]): { x0: number; y0: number; x1: number; y1: number } | null {
  const pts = polys.flat();
  if (!pts.length) return null;
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

/** Scale the polygons to fit a w × h box with `pad` to spare on every side, centred. `inset` reserves room on the right and bottom (for an offset layer). */
export function fitTransform(polys: V2[][], w: number, h: number, pad = 8, inset = 0): FitTransform {
  const b = boundsOf(polys);
  if (!b) return { scale: 1, tx: w / 2, ty: h / 2 };
  const bw = Math.max(b.x1 - b.x0, 1e-6);
  const bh = Math.max(b.y1 - b.y0, 1e-6);
  const availW = Math.max(w - 2 * pad - inset, 1);
  const availH = Math.max(h - 2 * pad - inset, 1);
  const scale = Math.min(availW / bw, availH / bh);
  return { scale, tx: pad + (availW - bw * scale) / 2 - b.x0 * scale, ty: pad + (availH - bh * scale) / 2 - b.y0 * scale };
}

/** An SVG path for a polygon under a transform, with an optional pixel offset. */
export function pathFor(poly: V2[], t: FitTransform, dx = 0, dy = 0): string {
  if (!poly.length) return "";
  const r = (n: number) => Math.round(n * 10) / 10;
  return `${poly.map((p, i) => `${i ? "L" : "M"}${r(p.x * t.scale + t.tx + dx)} ${r(p.y * t.scale + t.ty + dy)}`).join("")}Z`;
}
