import type { HouseModel } from "../types";
import { planRoofs, roofGeometry } from "./roof";

/** Fallback height when a model has no floors, metres. */
const DEFAULT_HEIGHT = 7;

/**
 * Height of the house above ground, metres: the highest ridge, flat roof or
 * wall top. Chimneys are left out; they are thin and would push the framing
 * up for little gain.
 */
export function houseHeight(model: HouseModel): number {
  if (!model.floors.length) return DEFAULT_HEIGHT;
  const storey = model.ceilingHeight + model.slabThickness;
  const top = Math.max(...model.floors.map((f) => f.level)) + 1;
  let h = top * storey;
  try {
    const plan = planRoofs(model);
    for (const b of plan.blocks) h = Math.max(h, roofGeometry(b).ridgeY);
    for (const f of plan.flatRoofs) h = Math.max(h, f.top);
  } catch {
    // A model the roof planner can't handle still gets framed by its walls.
  }
  return Number.isFinite(h) && h > 0 ? h : DEFAULT_HEIGHT;
}

export interface ElevationFraming {
  /** Camera distance from the facade, metres. */
  distance: number;
  /** Height the camera looks at. */
  targetY: number;
  /** Camera height: standing eye level. */
  eyeY: number;
}

/** Eye level for the elevation presets, metres. */
export const EYE_HEIGHT = 1.7;
/** Breathing room around the house in the frame. */
const MARGIN = 1.15;

/**
 * Where to put the camera to see one elevation of a house `height` tall and
 * `width` wide: aimed at half the height and backed off until both the
 * height and the width fit the frame, from standing eye level.
 */
export function elevationFraming(height: number, width: number, fovDeg: number, aspect: number): ElevationFraming {
  const tanV = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const fitH = (height / 2 / tanV) * MARGIN;
  const fitW = (width / 2 / (tanV * a)) * MARGIN;
  return { distance: Math.max(fitH, fitW, 4), targetY: Math.max(height / 2, EYE_HEIGHT), eyeY: EYE_HEIGHT };
}
