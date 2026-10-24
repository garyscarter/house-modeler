/**
 * Camera framing for the 3D view: the opening "home" view and the elevation
 * presets. Pure maths; the viewer applies the results and animates to them.
 * World frame: x right, z toward the front of the house, y up.
 */

import { elevationFraming } from "./viewFraming";
import type { HouseModel } from "../types";
import { modelBounds } from "./geometry";

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface CameraPose {
  position: V3;
  target: V3;
}
/** Plan bounds (y is world z) and the height to frame, metres. */
export interface FrameBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  height: number;
}
export type ViewSide = "front" | "rear" | "left" | "right" | "top";
export type ViewRequest = ViewSide | "home";

/** Allowance for the roof above the top storey when framing the house, metres. */
const ROOF_ALLOWANCE = 3.5;

/**
 * The box the opening view frames: every floor of every model given, with its
 * roof allowance. The plots are left out, so the house fills the frame.
 * Passing both layouts makes As listed and Proposed open on the same camera.
 */
export function frameFor(models: HouseModel[], roofAllowance = ROOF_ALLOWANCE): FrameBox {
  const b = modelBounds(models.flatMap((m) => m.floors));
  let height = roofAllowance;
  for (const m of models) {
    if (!m.floors.length) continue;
    const top = Math.max(...m.floors.map((f) => f.level));
    height = Math.max(height, (top + 1) * (m.ceilingHeight + m.slabThickness) + roofAllowance);
  }
  return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, height };
}

/** Width the floating inspector card takes on the right of the canvas: 320 px card, 12 px gap, 12 px edge. */
export const INSPECTOR_INSET_PX = 344;

/** A camera pose that is safe to apply: every coordinate finite and the camera not on its target. */
export function isValidPose(p: unknown): p is CameraPose {
  if (!p || typeof p !== "object") return false;
  const { position, target } = p as Partial<CameraPose>;
  const ok = (v: unknown) => {
    const q = v as Partial<V3> | undefined;
    return !!q && [q.x, q.y, q.z].every((n) => typeof n === "number" && Number.isFinite(n));
  };
  if (!ok(position) || !ok(target)) return false;
  return Math.hypot(position!.x - target!.x, position!.y - target!.y, position!.z - target!.z) > 1e-6;
}

/**
 * A remembered pose that belongs with this frame: valid, looking at a point in
 * or near the box (half its largest span of slack, for panning), from no
 * further than `maxDistance`. A pose saved for another house or plot fails, so
 * the view opens on home instead of on empty ground.
 */
export function poseFits(p: unknown, box: FrameBox, maxDistance: number): p is CameraPose {
  if (!isValidPose(p)) return false;
  const pad = Math.max(box.x1 - box.x0, box.y1 - box.y0, box.height, 6) / 2;
  const t = p.target;
  const near = t.x >= box.x0 - pad && t.x <= box.x1 + pad && t.z >= box.y0 - pad && t.z <= box.y1 + pad && t.y >= -pad && t.y <= box.height + pad;
  const d = Math.hypot(p.position.x - t.x, p.position.y - t.y, p.position.z - t.z);
  return near && d <= maxDistance * 1.001;
}

const HOME_AZIMUTH_DEG = 35;
const HOME_ELEVATION_DEG = 35;
const HOME_MARGIN = 0.15;

const rad = (d: number) => (d * Math.PI) / 180;

/** Distance at which a sphere of `radius` fits the narrower field of view, with a fractional `margin`. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = HOME_MARGIN): number {
  const tanV = Math.tan(rad(fovDeg) / 2);
  const tanH = tanV * Math.max(aspect, 0.01);
  return (radius * (1 + margin)) / Math.min(tanV, tanH);
}

/**
 * Front three-quarter view (front-right: +x, +z) that fits the whole box in
 * frame. The box corners are projected on the view axes, so a wide house is
 * fitted horizontally and a tall one vertically. With `rightInsetPx` of the
 * canvas (of `canvasWidthPx`) covered on the right, the box is fitted to the
 * visible part and centred in it.
 */
export function homeView(
  box: FrameBox,
  fovDeg: number,
  aspect: number,
  azimuthDeg = HOME_AZIMUTH_DEG,
  elevationDeg = HOME_ELEVATION_DEG,
  margin = HOME_MARGIN,
  rightInsetPx = 0,
  canvasWidthPx = 0,
): CameraPose {
  const target: V3 = { x: (box.x0 + box.x1) / 2, y: box.height / 2, z: (box.y0 + box.y1) / 2 };
  const az = rad(azimuthDeg);
  const el = rad(elevationDeg);
  // Unit vector from the target toward the camera.
  const back: V3 = { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: Math.cos(az) * Math.cos(el) };
  // Camera right = forward x up, with forward = -back and up = +y (normalised).
  const rl = Math.hypot(back.z, back.x) || 1;
  const right: V3 = { x: back.z / rl, y: 0, z: -back.x / rl };
  const up: V3 = {
    x: back.y * right.z - back.z * right.y,
    y: back.z * right.x - back.x * right.z,
    z: back.x * right.y - back.y * right.x,
  };
  const tanV = Math.tan(rad(fovDeg) / 2);
  const tanFull = tanV * Math.max(aspect, 0.01);
  const inset = canvasWidthPx > 0 ? Math.min(Math.max(rightInsetPx, 0) / canvasWidthPx, 0.6) : 0;
  // The visible strip is (1 - inset) of the width, so it behaves like a narrower canvas.
  const tanH = tanFull * (1 - inset);
  let dist = 1;
  for (const x of [box.x0, box.x1]) {
    for (const z of [box.y0, box.y1]) {
      for (const y of [0, box.height]) {
        const p = { x: x - target.x, y: y - target.y, z: z - target.z };
        const r = Math.abs(p.x * right.x + p.y * right.y + p.z * right.z);
        const u = Math.abs(p.x * up.x + p.y * up.y + p.z * up.z);
        // Depth of the point from the camera is dist + (point along -back).
        const along = -(p.x * back.x + p.y * back.y + p.z * back.z);
        dist = Math.max(dist, (r * (1 + margin)) / tanH - along, (u * (1 + margin)) / tanV - along);
      }
    }
  }
  // Slide the camera to the right of the box so the box sits in the middle of the visible strip.
  const slide = inset * dist * tanFull;
  const shifted: V3 = { x: target.x + right.x * slide, y: target.y, z: target.z + right.z * slide };
  return { position: { x: shifted.x + back.x * dist, y: shifted.y + back.y * dist, z: shifted.z + back.z * dist }, target: shifted };
}

/** What the elevation presets fit: the house's height (ridge included) and the camera's lens. */
interface ElevationLens {
  height: number;
  fovDeg: number;
  aspect: number;
}

/**
 * The elevation presets: from standing eye level, aimed at half the house's
 * height and backed off until its height and width fit the frame (so the
 * house, not the road, fills it); "top" is a plan view.
 */
export function presetView(side: ViewSide, bounds: { x0: number; x1: number; y0: number; y1: number }, size: number, centre: V3, lens: ElevationLens): CameraPose {
  const across = side === "front" || side === "rear" ? bounds.x1 - bounds.x0 : bounds.y1 - bounds.y0;
  const f = elevationFraming(lens.height, across, lens.fovDeg, lens.aspect);
  const d = f.distance;
  const eye = f.eyeY;
  const target: V3 = { x: centre.x, y: side === "top" ? 1.6 : f.targetY, z: centre.z };
  let position: V3;
  switch (side) {
    case "front":
      position = { x: centre.x, y: eye, z: bounds.y1 + d };
      break;
    case "rear":
      position = { x: centre.x, y: eye, z: bounds.y0 - d };
      break;
    case "left":
      position = { x: bounds.x0 - d, y: eye, z: centre.z };
      break;
    case "right":
      position = { x: bounds.x1 + d, y: eye, z: centre.z };
      break;
    case "top":
      position = { x: centre.x, y: size * 2.2, z: centre.z + 0.01 };
      break;
  }
  return { position, target };
}

/** Ease-in-out (cubic) for t in 0..1. */
export const easeInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Where a face for the house side at world azimuth `sideDeg` (0 = front, 90 =
 * right/+x, 180 = rear, 270 = left) sits on the cube, given the camera's
 * azimuth around the house (0 = camera in front). Unit vector, screen right
 * and down: the side nearest the camera points down.
 */
export function faceDirection(sideDeg: number, cameraDeg: number): { x: number; y: number } {
  const a = rad(sideDeg - cameraDeg);
  return { x: Math.sin(a), y: Math.cos(a) };
}

export const SIDE_AZIMUTH: Record<Exclude<ViewSide, "top">, number> = { front: 0, right: 90, rear: 180, left: 270 };
