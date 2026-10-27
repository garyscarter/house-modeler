import { formatLength } from "./planMath";

// The 3D view's tape measure: two points in world space (x right, y up, z = plan y), the distance between them and its
// level and plumb parts, and snapping a picked point onto a nearby mesh corner.

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface Measurement {
  /** Straight-line distance, metres. */
  distance: number;
  /** Along the ground (x and z), metres. */
  horizontal: number;
  /** Height difference, metres, always positive. */
  vertical: number;
  /** Slope of the line from level, degrees (0 level, 90 plumb). */
  slope: number;
}

/** Below this a part rounds away at two decimals, so the line counts as level (or plumb). */
export const LEVEL_TOLERANCE = 0.005;
/** How far a picked point may move to land on a mesh corner. */
export const SNAP_RADIUS = 0.05;

export function measure(a: P3, b: P3): Measurement {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const horizontal = Math.hypot(dx, dz);
  const vertical = Math.abs(dy);
  const distance = Math.hypot(horizontal, vertical);
  const slope = distance === 0 ? 0 : (Math.atan2(vertical, horizontal) * 180) / Math.PI;
  return { distance, horizontal, vertical, slope };
}

/** True when the line has both a horizontal and a vertical part worth showing. */
export const isSloped = (m: Measurement) => m.horizontal >= LEVEL_TOLERANCE && m.vertical >= LEVEL_TOLERANCE;

/** The label: "3.46 m", and for a sloped line its parts, "↔ 3.20 m · ↕ 1.10 m · 19°". */
export function measureLabel(m: Measurement): { main: string; parts: string | null } {
  return {
    main: formatLength(m.distance),
    parts: isSloped(m) ? `↔ ${formatLength(m.horizontal)} · ↕ ${formatLength(m.vertical)} · ${Math.round(m.slope)}°` : null,
  };
}

/** The right-angle corner under the higher end, for drawing the level and plumb legs of a sloped line: at the lower end's height. */
export function legCorner(a: P3, b: P3): P3 {
  const [low, high] = a.y <= b.y ? [a, b] : [b, a];
  return { x: high.x, y: low.y, z: high.z };
}

/**
 * The vertex of a geometry nearest `hit`, if one lies within `radius`; otherwise `hit` itself.
 * `positions` is a position attribute's array (x, y, z per vertex). `matrix` (16 numbers, column-major, as
 * THREE.Matrix4.elements) takes the vertices into world space; left out, they already are. `indices` limits the search
 * to those vertices (the hit triangle's, say), which keeps it cheap on big meshes.
 */
export function snapToVertex(hit: P3, positions: ArrayLike<number>, opts: { matrix?: ArrayLike<number>; indices?: ArrayLike<number>; radius?: number } = {}): { point: P3; snapped: boolean } {
  const { matrix: e, indices, radius = SNAP_RADIUS } = opts;
  let best = radius * radius;
  let found: P3 | null = null;
  const count = indices ? indices.length : Math.floor(positions.length / 3);
  for (let n = 0; n < count; n++) {
    const i = indices ? indices[n] : n;
    let x = positions[i * 3];
    let y = positions[i * 3 + 1];
    let z = positions[i * 3 + 2];
    if (x === undefined || y === undefined || z === undefined) continue;
    if (e) {
      const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
      const tx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
      const ty = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
      const tz = (e[2] * x + e[6] * y + e[10] * z + e[14]) / w;
      x = tx;
      y = ty;
      z = tz;
    }
    const d = (x - hit.x) ** 2 + (y - hit.y) ** 2 + (z - hit.z) ** 2;
    if (d <= best) {
      best = d;
      found = { x, y, z };
    }
  }
  return found ? { point: found, snapped: true } : { point: { ...hit }, snapped: false };
}

/** A press and release close enough together, in CSS px, to be a click rather than a camera drag. */
export const CLICK_SLOP_PX = 5;
export const isClick = (down: { x: number; y: number }, up: { x: number; y: number }, slop = CLICK_SLOP_PX) => Math.hypot(up.x - down.x, up.y - down.y) <= slop;
