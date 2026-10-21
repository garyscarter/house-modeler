import type { PartMat } from "./openings";
import { EXT_WALL_T, WALL_T, coveredIntervals, pointInPolygon, type OpeningPlacement, type V2, type WallPiece, type WallSeg } from "./geometry";

/**
 * Face-level wall geometry for the 3D view. Walls are built from quads rather
 * than boxes so each face can take the finish of the room on its side (paint
 * inside, brick or render outside), corners close without a notch, and faces
 * hidden inside a joint are never drawn.
 */

export type V3 = [number, number, number];

/** Rendered thickness of a wall: cavity walls outside, partitions inside. */
export function wallThickness(w: WallSeg): number {
  return w.exterior ? EXT_WALL_T : WALL_T;
}

/** How each end of a wall meets its neighbours. Index 0 is the `a` end. */
export interface WallEnds {
  /** Metres to extend the wall past its end point so a corner closes. */
  ext: [number, number];
  /**
   * At a corner, the side (0 = +n, 1 = -n) facing into the corner, and how
   * far that face runs past the end point (negative: it stops short, at the
   * other wall's face, instead of running through it to the far side).
   */
  inner: [{ side: 0 | 1; ext: number } | null, { side: 0 | 1; ext: number } | null];
  /** Whether the end face is visible (a free end, or one thicker than the wall it runs into). */
  cap: [boolean, boolean];
}

const JOIN_TOL = 0.06;
/** Extra overlap at closed corners, metres. */
const SEAM = 0.003;

function frame(w: { a: V2; b: V2 }) {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  const dir = len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  return { len, dir, n: { x: -dir.y, y: dir.x } };
}

/**
 * Work out how wall ends join. Walls are centred on the traced lines, so two
 * walls meeting at a corner each stop at the other's centre line and leave a
 * square notch on the outside (or inside) of the corner. Extending both by
 * half the other's thickness fills it. A wall ending part-way along another
 * (a T) already ends inside it, and one continuing in line needs nothing.
 */
export function wallEnds(walls: WallSeg[], thick: number[]): WallEnds[] {
  const frames = walls.map(frame);
  return walls.map((w, i) => {
    const { dir, n } = frames[i];
    const res: WallEnds = { ext: [0, 0], cap: [true, true], inner: [null, null] };
    for (const end of [0, 1] as const) {
      const P = end ? w.b : w.a;
      const out = end ? dir : { x: -dir.x, y: -dir.y };
      let through = false;
      let cont = false;
      let contCovers = false;
      let corner = 0;
      let inner: { side: 0 | 1; ext: number } | null = null;
      const sides = new Set<0 | 1>();
      walls.forEach((o, j) => {
        if (j === i) return;
        const f = frames[j];
        if (f.len < 1e-6) return;
        const t = (P.x - o.a.x) * f.dir.x + (P.y - o.a.y) * f.dir.y;
        const tc = Math.max(0, Math.min(f.len, t));
        const d = Math.hypot(P.x - (o.a.x + f.dir.x * tc), P.y - (o.a.y + f.dir.y * tc));
        if (d > JOIN_TOL) return;
        const cos = Math.abs(dir.x * f.dir.x + dir.y * f.dir.y);
        if (cos > 0.98) {
          const beyond = Math.max((o.a.x - P.x) * out.x + (o.a.y - P.y) * out.y, (o.b.x - P.x) * out.x + (o.b.y - P.y) * out.y);
          if (beyond > JOIN_TOL) {
            cont = true;
            if (thick[j] >= thick[i] - 1e-9) contCovers = true;
          }
        } else if (tc > JOIN_TOL && tc < f.len - JOIN_TOL) {
          through = true;
        } else {
          const sin = Math.sqrt(1 - cos * cos);
          const ext = thick[j] / 2 / sin + ((thick[i] / 2) * cos) / sin;
          // The other wall heads off to one side of this one: that side's face is inside the corner.
          const far = Math.hypot(o.a.x - P.x, o.a.y - P.y) > Math.hypot(o.b.x - P.x, o.b.y - P.y) ? o.a : o.b;
          const side: 0 | 1 = (far.x - P.x) * n.x + (far.y - P.y) * n.y > 0 ? 0 : 1;
          sides.add(side);
          if (ext > corner) {
            corner = ext;
            inner = { side, ext: Math.min(0, -thick[j] / 2 / sin + ((thick[i] / 2) * cos) / sin) };
          }
        }
      });
      // Walls leaving on both sides make a T: stop at the centre line, hidden inside them.
      if (sides.size > 1) through = true;
      if (through) res.cap[end] = false;
      else if (cont) res.cap[end] = !contCovers;
      else if (corner > 0) {
        res.ext[end] = Math.min(corner, 0.5);
        res.inner[end] = inner;
        res.cap[end] = false;
      }
    }
    return res;
  });
}

export interface RoomPoly {
  id: string;
  poly: V2[];
}

/** A stretch of one side of a wall and the room on that side (null = outside). */
export interface Span {
  t0: number;
  t1: number;
  roomId: string | null;
  /** The room's polygon edge this stretch runs along, for feature walls (see featureWalls.ts). */
  edge?: number;
}

/**
 * Which room lies along one side of a wall, as intervals along it. A merged
 * wall often has several rooms on one side, so this samples just beyond the
 * face and refines each change of room by bisection.
 */
export function sideSpans(w: { a: V2; b: V2 }, side: 1 | -1, probe: number, rooms: RoomPoly[]): Span[] {
  const { len, dir, n } = frame(w);
  if (len < 1e-6) return [];
  const roomAt = (t: number) => {
    const p = { x: w.a.x + dir.x * t + n.x * probe * side, y: w.a.y + dir.y * t + n.y * probe * side };
    return rooms.find((r) => pointInPolygon(p, r.poly))?.id ?? null;
  };
  const steps = Math.max(1, Math.ceil(len / 0.1));
  const step = len / steps;
  const spans: Span[] = [];
  let prevT = step / 2;
  let prev = roomAt(prevT);
  let start = 0;
  for (let k = 1; k < steps; k++) {
    const t = (k + 0.5) * step;
    const id = roomAt(t);
    if (id !== prev) {
      // The change lies between the two samples: bisect it.
      let lo = prevT;
      let hi = t;
      for (let it = 0; it < 10; it++) {
        const mid = (lo + hi) / 2;
        if (roomAt(mid) === prev) lo = mid;
        else hi = mid;
      }
      const cut = (lo + hi) / 2;
      spans.push({ t0: start, t1: cut, roomId: prev });
      start = cut;
      prev = id;
    }
    prevT = t;
  }
  spans.push({ t0: start, t1: len, roomId: prev });
  return spans;
}

export function spanAt(spans: Span[], t: number): string | null {
  return spanOf(spans, t)?.roomId ?? null;
}

/** The span covering t (the last one beyond the end), if any. */
export function spanOf(spans: Span[], t: number): Span | undefined {
  return spans.find((s) => t <= s.t1) ?? spans[spans.length - 1];
}

/**
 * What a face shows: the paint of the room it faces, the outside finish of
 * the room behind it (null = the house default) and the edge of that room it lies along, the cut top of a wall, or a
 * joinery part (frames, glass, sills; see openings.ts).
 */
export type FaceSlot =
  | { kind: "inside"; roomId: string; edge?: number }
  | { kind: "outside"; roomId: string | null; edge?: number }
  | { kind: "top" }
  | { kind: "part"; mat: PartMat };

export interface FaceQuad {
  /** Corners, wound anticlockwise seen from the front. */
  v: [V3, V3, V3, V3];
  n: V3;
  /** Texture coordinates in metres, so finishes keep their real scale. */
  uv: [number, number][];
  slot: FaceSlot;
}

/** A run of skirting board along an inside face. `n` points into the room. */
export interface Skirting {
  a: V2;
  b: V2;
  n: V2;
  roomId: string;
}

export interface WallFaceInput {
  wall: WallSeg;
  thickness: number;
  ends: WallEnds;
  /** Rooms along the +n and -n sides (n = the wall direction turned anticlockwise on the plan). */
  spans: [Span[], Span[]];
  /** Pieces left after cutting openings; their inner ends are reveals, drawn per opening. */
  pieces: WallPiece[];
  /** Extra bands (through the slab, plinths) whose inner ends are steps that need an end face. */
  bands: WallPiece[];
  placements: OpeningPlacement[];
  /** Height of the wall top: faces at or above it are drawn as the cut top. */
  top: number;
  /** Floor base height, added to texture v so brick courses run on between storeys. */
  baseY: number;
  skirting: boolean;
}

/** Build the visible faces of one wall (sides, tops, exposed ends and opening reveals). */
export function wallFaces(inp: WallFaceInput): { quads: FaceQuad[]; skirting: Skirting[] } {
  const { wall, ends, spans, baseY } = inp;
  const { len, dir, n } = frame(wall);
  const h = inp.thickness / 2;
  const quads: FaceQuad[] = [];
  const skirting: Skirting[] = [];
  if (len < 1e-6) return { quads, skirting };
  const u0 = wall.a.x * dir.x + wall.a.y * dir.y;
  const P = (t: number, off: number): V2 => ({ x: wall.a.x + dir.x * t + n.x * off, y: wall.a.y + dir.y * t + n.y * off });
  const V = (t: number, off: number, y: number): V3 => {
    const p = P(t, off);
    return [p.x, y, p.y];
  };
  const clampT = (t: number) => Math.max(0, Math.min(len, t));
  /** Slot for side 0 (+n) or 1 (-n) at t. */
  const slotAt = (side: 0 | 1, t: number): FaceSlot => {
    const own = spanOf(spans[side], clampT(t));
    if (own?.roomId) return { kind: "inside", roomId: own.roomId, edge: own.edge };
    const behind = spanOf(spans[1 - side], clampT(t));
    return { kind: "outside", roomId: behind?.roomId ?? null, edge: behind?.edge };
  };
  const push = (v: [V3, V3, V3, V3], nn: V3, uv: [number, number][], slot: FaceSlot) => {
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (c[0] * nn[0] + c[1] * nn[1] + c[2] * nn[2] < 0) {
      v = [v[0], v[3], v[2], v[1]];
      uv = [uv[0], uv[3], uv[2], uv[1]];
    }
    quads.push({ v, n: nn, uv, slot });
  };
  const sideNormal = (side: 0 | 1): V3 => (side ? [-n.x, 0, -n.y] : [n.x, 0, n.y]);
  /** Vertical face along one side between t0 and t1. */
  const side = (s: 0 | 1, t0: number, t1: number, y0: number, y1: number, slot: FaceSlot) => {
    const off = s ? -h : h;
    push(
      [V(t0, off, y0), V(t1, off, y0), V(t1, off, y1), V(t0, off, y1)],
      sideNormal(s),
      [
        [u0 + t0, baseY + y0],
        [u0 + t1, baseY + y0],
        [u0 + t1, baseY + y1],
        [u0 + t0, baseY + y1],
      ],
      slot,
    );
  };
  /** Horizontal face across the wall (both halves), facing up or down. */
  const flat = (t0: number, t1: number, y: number, up: boolean, slots: [FaceSlot, FaceSlot]) => {
    const nn: V3 = [0, up ? 1 : -1, 0];
    for (const s of [0, 1] as const) {
      const [o0, o1] = s ? [-h, 0] : [0, h];
      push(
        [V(t0, o0, y), V(t1, o0, y), V(t1, o1, y), V(t0, o1, y)],
        nn,
        [
          [u0 + t0, o0],
          [u0 + t1, o0],
          [u0 + t1, o1],
          [u0 + t0, o1],
        ],
        slots[s],
      );
    }
  };
  /** End face across the wall at t, facing along +dir (sign 1) or -dir (sign -1), split at the centre line. */
  const end = (t: number, sign: 1 | -1, y0: number, y1: number) => {
    const nn: V3 = [dir.x * sign, 0, dir.y * sign];
    for (const s of [0, 1] as const) {
      const [o0, o1] = s ? [-h, 0] : [0, h];
      push(
        [V(t, o0, y0), V(t, o1, y0), V(t, o1, y1), V(t, o0, y1)],
        nn,
        [
          [o0, baseY + y0],
          [o1, baseY + y0],
          [o1, baseY + y1],
          [o0, baseY + y1],
        ],
        slotAt(s, t),
      );
    }
  };
  // Where the room changes on either side; faces are split there.
  const breaks = [...new Set([...spans[0], ...spans[1]].map((s) => s.t1))].filter((t) => t > 1e-6 && t < len - 1e-6);
  const along = (p: { a: V2 }) => (p.a.x - wall.a.x) * dir.x + (p.a.y - wall.a.y) * dir.y;

  const addPiece = (p: WallPiece, isBand: boolean) => {
    const t0 = along(p);
    const t1 = along({ a: p.b });
    const atStart = t0 < 1e-6;
    const atEnd = t1 > len - 1e-6;
    // Outer faces and the top run round the corner, overlapping by a hair so
    // the meeting faces leave no hairline crack; the face inside the corner
    // stops at the other wall's face.
    const T0 = atStart ? -ends.ext[0] - (ends.ext[0] ? SEAM : 0) : t0;
    const T1 = atEnd ? len + ends.ext[1] + (ends.ext[1] ? SEAM : 0) : t1;
    const startOf = (s: 0 | 1) => (atStart && ends.inner[0]?.side === s ? -ends.inner[0].ext : T0);
    const endOf = (s: 0 | 1) => (atEnd && ends.inner[1]?.side === s ? len + ends.inner[1].ext : T1);
    const cuts = [T0];
    for (const b of breaks.filter((b) => b > T0 && b < T1).sort((a, b) => a - b)) if (b > cuts[cuts.length - 1] + 1e-3 && b < T1 - 1e-3) cuts.push(b);
    cuts.push(T1);
    const isTop = p.y1 >= inp.top - 1e-6;
    for (let k = 0; k < cuts.length - 1; k++) {
      const s0 = cuts[k];
      const s1 = cuts[k + 1];
      const mid = (s0 + s1) / 2;
      for (const s of [0, 1] as const) {
        const a = Math.max(s0, startOf(s));
        const b = Math.min(s1, endOf(s));
        if (b - a < 1e-4) continue;
        const slot = slotAt(s, mid);
        side(s, a, b, p.y0, p.y1, slot);
        if (inp.skirting && !isBand && slot.kind === "inside" && p.y0 <= 1e-6 && p.y1 > 0.2) {
          const off = s ? -h : h;
          skirting.push({ a: P(a, off), b: P(b, off), n: s ? { x: -n.x, y: -n.y } : n, roomId: slot.roomId });
        }
      }
      if (isTop) flat(s0, s1, p.y1, true, [{ kind: "top" }, { kind: "top" }]);
    }
    if (atStart ? ends.cap[0] : isBand) end(T0, -1, p.y0, p.y1);
    if (atEnd ? ends.cap[1] : isBand) end(T1, 1, p.y0, p.y1);
  };
  for (const p of inp.pieces) addPiece(p, false);
  for (const p of inp.bands) addPiece(p, true);

  // Reveals: the jambs, lintel soffit and sill of each hole.
  for (const pl of inp.placements) {
    const tc = along({ a: pl.centre });
    const ta = tc - pl.width / 2;
    const tb = tc + pl.width / 2;
    end(ta, 1, pl.y0, pl.y1);
    end(tb, -1, pl.y0, pl.y1);
    const slots: [FaceSlot, FaceSlot] = [slotAt(0, tc), slotAt(1, tc)];
    if (pl.y1 < inp.top - 0.01) flat(ta, tb, pl.y1, false, slots);
    if (pl.y0 > 0.01) flat(ta, tb, pl.y0, true, slots);
  }
  return { quads, skirting };
}

/**
 * Stretches (t along the wall) where another wall's footprint overlaps this
 * wall's footprint, both taken as rectangles their thickness wide between
 * their end points. Used for the walls of the floor above: a wall standing
 * on this one, along it or across it, covers it out to its outer face, which
 * lies half its thickness beyond the room outlines.
 */
export function footprintOverlaps(wall: { a: V2; b: V2 }, thickness: number, others: { wall: { a: V2; b: V2 }; thickness: number }[]): [number, number][] {
  const { len, dir, n } = frame(wall);
  if (len < 1e-6) return [];
  const h = thickness / 2;
  const EPS = 1e-3;
  const out: [number, number][] = [];
  for (const o of others) {
    const f = frame(o.wall);
    if (f.len < 1e-6) continue;
    const oh = o.thickness / 2;
    // The other footprint's corners in this wall's frame (t along, s across).
    const local = (p: V2): V2 => ({ x: (p.x - wall.a.x) * dir.x + (p.y - wall.a.y) * dir.y, y: (p.x - wall.a.x) * n.x + (p.y - wall.a.y) * n.y });
    const at = (base: V2, off: number): V2 => local({ x: base.x + f.n.x * off, y: base.y + f.n.y * off });
    let poly: V2[] = [at(o.wall.a, -oh), at(o.wall.b, -oh), at(o.wall.b, oh), at(o.wall.a, oh)];
    // Clip to this wall's strip, |s| <= h.
    poly = clipHalfPlane(poly, (p) => h - p.y);
    poly = clipHalfPlane(poly, (p) => h + p.y);
    if (poly.length < 3) continue;
    const ss = poly.map((p) => p.y);
    if (Math.max(...ss) - Math.min(...ss) < EPS) continue;
    const t0 = Math.max(0, Math.min(...poly.map((p) => p.x)));
    const t1 = Math.min(len, Math.max(...poly.map((p) => p.x)));
    if (t1 - t0 > EPS) out.push([t0, t1]);
  }
  return mergeIntervals(out);
}

/** Keep the part of a convex polygon where `inside(p) >= 0` (Sutherland-Hodgman, one edge). */
function clipHalfPlane(poly: V2[], inside: (p: V2) => number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = inside(p);
    const dq = inside(q);
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const k = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
    }
  }
  return out;
}

/** Sort and join overlapping or touching intervals. */
export function mergeIntervals(iv: [number, number][], gap = 1e-6): [number, number][] {
  const sorted = [...iv].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Where a wall carries on up through the floor slab to the floor above (the
 * band between storeys): under the rooms above, and under the walls above out
 * to their outer faces. Room outlines run along wall centre lines, so the
 * rooms alone stop the band half a wall short of the corner of an upper
 * storey, leaving a slot beside a lower roof that stops at the wall's face;
 * and a wall closing a chimney-breast notch upstairs stands on this wall
 * with no room above it at all.
 */
export function bandIntervals(
  wall: { a: V2; b: V2 },
  thickness: number,
  upperPolys: V2[][],
  upperWalls: { wall: { a: V2; b: V2 }; thickness: number }[],
): [number, number][] {
  return mergeIntervals([...coveredIntervals(wall, upperPolys), ...footprintOverlaps(wall, thickness, upperWalls)], 0.01);
}

/**
 * The extra pieces a wall carries beyond its storey: external walls, and
 * free-standing ones with outside on a side (such as the back of a chimney
 * breast closing a notch in the party wall), run up through the slab where
 * there is a floor above (see bandIntervals), so the outside face is
 * continuous between storeys, and down to the ground on the lowest floor.
 * Walls of a set height (garden walls, dwarf walls) carry neither.
 */
export function wallBands(
  wall: WallSeg,
  thickness: number,
  spans: [Span[], Span[]],
  opts: { ceiling: number; slab: number; upperPolys: V2[][]; upperWalls: { wall: { a: V2; b: V2 }; thickness: number }[]; plinthY: number | null },
): WallPiece[] {
  if (wall.height !== undefined) return [];
  if (!wall.exterior && !spans.some((side) => side.some((s) => s.roomId === null))) return [];
  const { len, dir } = frame(wall);
  const at = (t: number): V2 => ({ x: wall.a.x + dir.x * t, y: wall.a.y + dir.y * t });
  const out: WallPiece[] = bandIntervals(wall, thickness, opts.upperPolys, opts.upperWalls).map(([t0, t1]) => ({
    a: t0 < 1e-6 ? wall.a : at(t0),
    b: t1 > len - 1e-6 ? wall.b : at(t1),
    y0: opts.ceiling,
    y1: opts.ceiling + opts.slab,
  }));
  if (opts.plinthY !== null) out.push({ a: wall.a, b: wall.b, y0: opts.plinthY, y1: 0 });
  return out;
}

/**
 * Which way is outside at an opening, relative to its wall's +n side:
 * 1 or -1 when exactly one side is in a room, 0 for internal openings.
 */
export function outwardSign(pl: { centre: V2; dir: V2 }, rooms: V2[][], probe = 0.4): 1 | -1 | 0 {
  const n = { x: -pl.dir.y, y: pl.dir.x };
  const inside = (s: number) => rooms.some((r) => pointInPolygon({ x: pl.centre.x + n.x * probe * s, y: pl.centre.y + n.y * probe * s }, r));
  const plus = inside(1);
  const minus = inside(-1);
  if (plus === minus) return 0;
  return plus ? -1 : 1;
}
