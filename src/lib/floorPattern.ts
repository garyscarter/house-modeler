/**
 * Layout maths for patterned floors, in metres, so the texture code only
 * paints. Patterns are laid out in a texture tile's frame (u along the tile's
 * width, v along its height) and are periodic in it, so a tile repeats with
 * no seam. Herringbone and chevron run with their points along u: at a room's
 * floor angle of 0 the zig-zag rows run along the plan's x axis.
 */

export type XY = [number, number];

/** One wood block: its outline and the direction of its length (the grain), radians from +u. */
export interface Block {
  pts: XY[];
  angle: number;
  /** Same for every copy of this block in other repeats, so it can seed its colour. */
  key: number;
}

const SQRT2 = Math.SQRT2;

/** Size of one herringbone or chevron repeat holding `along` by `across` lattice periods. */
export function parquetTile(length: number, width: number, along: number, across: number): [number, number] {
  return [along * width * SQRT2, across * length * SQRT2];
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** True when a polygon reaches into the tile by more than a rounding error (one only touching an edge doesn't). */
const overlaps = (pts: XY[], tu: number, tv: number) => {
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  const e = 1e-9;
  return Math.max(...us) > e && Math.min(...us) < tu - e && Math.max(...vs) > e && Math.min(...vs) < tv - e;
};

/**
 * Classic 90° herringbone of `length` × `width` blocks (length a whole
 * multiple of width or not), every block that touches the tile of
 * `along` × `across` periods (see parquetTile). In the blocks' own frame the
 * pattern is two staircases of blocks, one lying along x and one along y,
 * stepping by (w, w); the second lattice vector is (-l, l). Turned by -45°,
 * those become (w√2, 0) and (0, l√2), so the tile is a whole number of each.
 */
export function herringboneBlocks(length: number, width: number, along: number, across: number): Block[] {
  const [tu, tv] = parquetTile(length, width, along, across);
  const r = 1 / SQRT2;
  // Block frame to tile frame: turn by -45°.
  const toTile = ([x, y]: XY): XY => [(x + y) * r, (y - x) * r];
  const out: Block[] = [];
  const reach = Math.ceil(length / width) + 2;
  for (let j = -2; j <= across + 2; j++)
    for (let i = -reach; i <= along + reach; i++) {
      // Lattice origin in the block frame: i (w, w) + j (-l, l).
      const ox = i * width - j * length;
      const oy = i * width + j * length;
      const id = (mod(j, across) * along + mod(i, along)) * 2;
      const lying: XY[] = [
        [ox, oy],
        [ox + length, oy],
        [ox + length, oy + width],
        [ox, oy + width],
      ];
      const standing: XY[] = [
        [ox, oy + width],
        [ox + width, oy + width],
        [ox + width, oy + width + length],
        [ox, oy + width + length],
      ];
      for (const [pts, angle, key] of [
        [lying, -Math.PI / 4, id],
        [standing, Math.PI / 4, id + 1],
      ] as const) {
        const t = pts.map(toTile);
        if (overlaps(t, tu, tv)) out.push({ pts: t, angle, key });
      }
    }
  return out;
}

/**
 * Chevron: blocks with ends mitred at 45°, in strips along u that meet on
 * straight lines, sloping one way in even strips and the other in odd ones.
 * Each block's long edges are `length`; blocks are `width` across.
 */
export function chevronBlocks(length: number, width: number, along: number, across: number): Block[] {
  const [tu, tv] = parquetTile(length, width, along, across);
  const s = length / SQRT2; // strip height, and how far a block runs along u
  const p = width * SQRT2; // block pitch along u
  const out: Block[] = [];
  const reach = Math.ceil(s / p) + 2;
  for (let k = -1; k <= 2 * across + 1; k++) {
    const even = mod(k, 2) === 0;
    const v0 = k * s;
    const v1 = v0 + s;
    for (let j = -reach; j <= along + reach; j++) {
      const a = j * p + (even ? 0 : s);
      const b = j * p + (even ? s : 0);
      const pts: XY[] = [
        [a, v0],
        [a + p, v0],
        [b + p, v1],
        [b, v1],
      ];
      if (overlaps(pts, tu, tv)) out.push({ pts, angle: even ? Math.PI / 4 : (3 * Math.PI) / 4, key: mod(k, 2 * across) * along + mod(j, along) });
    }
  }
  return out;
}

/** Size of a repeat of pointy-topped hexagons `flat` across their flats: `along` across, `rows` (even) down. */
export function hexTile(flat: number, along: number, rows: number): [number, number] {
  return [along * flat, (rows * flat * Math.sqrt(3)) / 2];
}

/**
 * Pointy-topped hexagons `flat` across the flats (along u), rows `flat`·√3/2
 * apart with every other row offset half a hexagon; every one touching the
 * tile, with a key that repeats with the tile.
 */
export function hexagons(flat: number, along: number, rows: number): { centre: XY; pts: XY[]; key: number }[] {
  const [tu, tv] = hexTile(flat, along, rows);
  const R = flat / Math.sqrt(3);
  const dy = (flat * Math.sqrt(3)) / 2;
  const out: { centre: XY; pts: XY[]; key: number }[] = [];
  for (let r = -1; r <= rows + 1; r++)
    for (let i = -1; i <= along + 1; i++) {
      const centre: XY = [(i + (mod(r, 2) ? 0.5 : 0)) * flat, r * dy];
      const pts = Array.from({ length: 6 }, (_, k): XY => {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        return [centre[0] + R * Math.cos(a), centre[1] + R * Math.sin(a)];
      });
      if (overlaps(pts, tu, tv)) out.push({ centre, pts, key: mod(r, rows) * along + mod(i, along) });
    }
  return out;
}

/** True when (x, y) is inside the convex polygon `pts` (either winding). */
export function inConvex(pts: XY[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c === 0) continue;
    const s = Math.sign(c);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Floor angle in degrees, normalised to [0, 180) (patterns repeat every half turn). */
export function normaliseAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const a = ((deg % 180) + 180) % 180;
  return Math.abs(a - 180) < 1e-9 ? 0 : Math.round(a * 100) / 100;
}

/**
 * Texture coordinates for a floor point (x, y) in metres when the pattern is
 * turned by `deg` degrees: the pattern's u axis then points along the plan
 * direction (cos, sin) of that angle.
 */
export function floorUv(x: number, y: number, deg: number): XY {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + y * s, -x * s + y * c];
}

/** Direction of a polygon's longest edge in degrees, [0, 180): the angle that runs a pattern along the room. */
export function longAxisAngle(poly: { x: number; y: number }[]): number {
  let best = 0;
  let angle = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best + 1e-9) {
      best = len;
      angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
  }
  return normaliseAngle(angle);
}
