/**
 * Camera framing for the 3D view: the opening "home" view and the elevation
 * presets. Pure maths; the viewer applies the results and animates to them.
 * World frame: x right, z toward the front of the house, y up.
 */

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

export const HOME_AZIMUTH_DEG = 35;
export const HOME_ELEVATION_DEG = 28;
export const HOME_MARGIN = 0.12;

const rad = (d: number) => (d * Math.PI) / 180;

/** Distance at which a sphere of `radius` fits the narrower field of view, with a fractional `margin`. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = HOME_MARGIN): number {
  const tanV = Math.tan(rad(fovDeg) / 2);
  const tanH = tanV * Math.max(aspect, 0.01);
  return (radius * (1 + margin)) / Math.min(tanV, tanH);
}

/**
 * Front three-quarter view (front-right: +x, +z) that fits the whole box in
 * frame. The box corners are projected on the view axes, so a wide plot is
 * fitted horizontally and a tall house vertically.
 */
export function homeView(
  box: FrameBox,
  fovDeg: number,
  aspect: number,
  azimuthDeg = HOME_AZIMUTH_DEG,
  elevationDeg = HOME_ELEVATION_DEG,
  margin = HOME_MARGIN,
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
  const tanH = tanV * Math.max(aspect, 0.01);
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
  return { position: { x: target.x + back.x * dist, y: target.y + back.y * dist, z: target.z + back.z * dist }, target };
}

/** The elevation presets: street level, slightly raised, looking at the house; "top" is a plan view. */
export function presetView(side: ViewSide, bounds: { x0: number; x1: number; y0: number; y1: number }, size: number, centre: V3): CameraPose {
  const d = size * 1.6;
  const eye = 2.2;
  const target: V3 = { x: centre.x, y: 1.6, z: centre.z };
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
