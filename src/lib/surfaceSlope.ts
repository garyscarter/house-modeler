import type { SiteSurface, SlopeToward, SurfaceSlope } from "../types";
import { bbox, type V2 } from "./geometry";

/** Unit direction of climb in plan (x right, y towards the street). */
const CLIMB: Record<SlopeToward, V2> = {
  back: { x: 0, y: -1 },
  front: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The slope as it will be drawn: undefined for a flat surface at ground level. */
export function effectiveSlope(slope: SurfaceSlope | undefined): SurfaceSlope | undefined {
  if (!slope) return undefined;
  const rise = Number.isFinite(slope.rise) ? slope.rise : 0;
  const base = Number.isFinite(slope.base) ? slope.base ?? 0 : 0;
  return rise === 0 && base === 0 ? undefined : { toward: slope.toward, rise, base };
}

/**
 * Height above the ground at plan point `p` of a surface with this slope: a
 * plane that is `base` high along the polygon's low edge and `base + rise` at
 * its high edge (its extent along the direction of climb), flat elsewhere.
 * Points outside the polygon's extent are clamped to the nearer end.
 */
export function slopeHeight(poly: V2[], slope: SurfaceSlope | undefined, p: V2): number {
  const s = effectiveSlope(slope);
  if (!s) return 0;
  const base = s.base ?? 0;
  if (poly.length < 3 || s.rise === 0) return base;
  const d = CLIMB[s.toward];
  const b = bbox(poly);
  const corners = [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ].map((c) => c.x * d.x + c.y * d.y);
  const lo = Math.min(...corners);
  const hi = Math.max(...corners);
  if (hi - lo < 1e-9) return base;
  const t = Math.min(1, Math.max(0, ((p.x * d.x + p.y * d.y) - lo) / (hi - lo)));
  return base + s.rise * t;
}

/** Height of a surface's top at a plan point (0 for a flat surface). */
export const surfaceHeightAt = (surface: Pick<SiteSurface, "polygon" | "slope">, p: V2) => slopeHeight(surface.polygon, surface.slope, p);

/** Steepest gradient of the slope as a fraction (rise over run), 0 when flat. */
export function slopeGradient(poly: V2[], slope: SurfaceSlope | undefined): number {
  const s = effectiveSlope(slope);
  if (!s || s.rise === 0 || poly.length < 3) return 0;
  const d = CLIMB[s.toward];
  const b = bbox(poly);
  const run = d.x !== 0 ? b.x1 - b.x0 : b.y1 - b.y0;
  return run > 1e-9 ? Math.abs(s.rise) / run : 0;
}
