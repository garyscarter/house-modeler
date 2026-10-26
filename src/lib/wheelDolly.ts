/**
 * One wheel step of the 3D view's zoom. OrbitControls' own wheel zoom moves a fixed 5 % an event, whatever the
 * event's size, towards its orbit target wherever that happens to be; this instead moves the camera towards what
 * is under the cursor by a factor from the wheel delta, and stops `minDistance` short of it.
 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** How far along the camera's view axis (`forward`, unit) the point `p` lies, seen from `position`. */
export const depthOf = (position: V3, forward: V3, p: V3): number => dot(add(p, position, -1), forward);

/**
 * The camera after a zoom step. It moves along `dir` (the unit ray through the cursor) by the change in orbit
 * radius: from `depth` (how far along the view axis the point under the cursor is) to depth / factor, both kept
 * within [minDistance, maxDistance]; factor > 1 zooms in. The orbit target is put on the view axis at the new
 * radius, so the camera doesn't turn and a later orbit pivots about what was zoomed towards. Already closer than
 * minDistance, zooming in does nothing and zooming out backs away from minDistance.
 */
export function dollyStep(position: V3, forward: V3, dir: V3, depth: number, factor: number, minDistance: number, maxDistance: number): { position: V3; target: V3 } {
  const clamp = (r: number) => Math.max(minDistance, Math.min(maxDistance, r));
  const r0 = clamp(Number.isFinite(depth) ? depth : minDistance);
  const r1 = clamp(r0 / factor);
  const moved = add(position, dir, r0 - r1);
  return { position: moved, target: add(moved, forward, r1) };
}
