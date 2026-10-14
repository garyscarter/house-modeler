import type { Exterior, Floor, HouseModel, Pt, Room } from "../types";
import { DEFAULT_EXTERIOR } from "../types";
import { EXT_WALL_T, bbox, modelBounds, pointInPolygon, roomWorldPolygon, toWorld, type V2 } from "./geometry";

/** How a roof ends along its ridge: hipped, a gable wall with a verge overhang, or flush against a party wall. */
export type RoofEnd = "hip" | "gable" | "flush";

/** A pitched roof over a rectangle of walls. */
export interface RoofBlock {
  /** Wall centre lines, world metres (z = plan y). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height of the wall tops the roof sits on. */
  y: number;
  /** Ridge direction. */
  axis: "x" | "z";
  pitchDeg: number;
  overhang: number;
  /** End treatment at the low and high ends of the ridge axis. */
  start: RoofEnd;
  end: RoofEnd;
  /** Wall thickness; the roof surface passes through the outer top edge of the walls. Default EXT_WALL_T. */
  wallT?: number;
}

export interface RoofMesh {
  /** Roof slope triangles as flat xyz triplets, wound to face upwards. */
  slopes: number[];
  /** Vertical gable-end triangles (drawn in the wall colour), wound to face outwards. */
  gables: number[];
  ridgeY: number;
  eavesY: number;
  /** Ridge end points [x, y, z]; equal when the roof is a pyramid. */
  ridge: [[number, number, number], [number, number, number]];
  /** Eaves outline in world x/z, for fascias and gutters. */
  eaves: [number, number][];
}

type P3 = [number, number, number];

function pushTri(out: number[], a: P3, b: P3, c: P3, outward: P3) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-9) return; // degenerate (pyramid ridge)
  const flip = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0;
  out.push(...a, ...(flip ? c : b), ...(flip ? b : c));
}

/**
 * Triangles for a hipped or gabled roof. Built in a local frame (u along the
 * ridge, v across) and mapped to world space. The slopes pass through the
 * outer top edge of the walls, so no wall pokes through, and overhang the
 * walls by `overhang` (none at a flush end).
 */
export function roofGeometry(b: RoofBlock): RoofMesh {
  const half = (b.wallT ?? EXT_WALL_T) / 2;
  const t = Math.tan((b.pitchDeg * Math.PI) / 180);
  const o = b.overhang;
  const [u0, u1, v0, v1] = b.axis === "x" ? [b.x0, b.x1, b.z0, b.z1] : [b.z0, b.z1, b.x0, b.x1];
  const U0 = b.start === "flush" ? u0 : u0 - half;
  const U1 = b.end === "flush" ? u1 : u1 + half;
  const V0 = v0 - half;
  const V1 = v1 + half;
  const hs = (V1 - V0) / 2;
  const vm = (V0 + V1) / 2;
  const ridgeY = b.y + hs * t;
  const eavesY = b.y - o * t;
  const EU0 = b.start === "flush" ? U0 : U0 - o;
  const EU1 = b.end === "flush" ? U1 : U1 + o;
  const EV0 = V0 - o;
  const EV1 = V1 + o;
  let RU0 = b.start === "hip" ? U0 + hs : EU0;
  let RU1 = b.end === "hip" ? U1 - hs : EU1;
  if (RU0 > RU1) RU0 = RU1 = (RU0 + RU1) / 2;

  // Local (u, h, v) -> world (x, y, z).
  const W = (u: number, h: number, v: number): P3 => (b.axis === "x" ? [u, h, v] : [v, h, u]);
  const up: P3 = [0, 1, 0];
  const slopes: number[] = [];
  const gables: number[] = [];

  const quad = (a: P3, bb: P3, c: P3, d: P3, out: number[], outward: P3) => {
    pushTri(out, a, bb, c, outward);
    pushTri(out, a, c, d, outward);
  };
  const r0 = W(RU0, ridgeY, vm);
  const r1 = W(RU1, ridgeY, vm);
  // Long slopes.
  quad(W(EU0, eavesY, EV0), W(EU1, eavesY, EV0), r1, r0, slopes, up);
  quad(W(EU1, eavesY, EV1), W(EU0, eavesY, EV1), r0, r1, slopes, up);
  // Ends.
  const endFace = (kind: RoofEnd, U: number, EU: number, R: P3, sign: number) => {
    if (kind === "hip") {
      pushTri(slopes, W(EU, eavesY, EV0), W(EU, eavesY, EV1), R, up);
    } else {
      pushTri(gables, W(U, b.y, V0), W(U, b.y, V1), W(U, ridgeY, vm), W(sign, 0, 0));
    }
  };
  endFace(b.start, U0, EU0, r0, -1);
  endFace(b.end, U1, EU1, r1, 1);

  const eaves: [number, number][] = [
    [EU0, EV0],
    [EU1, EV0],
    [EU1, EV1],
    [EU0, EV1],
  ].map(([u, v]) => {
    const p = W(u, 0, v);
    return [p[0], p[2]];
  });
  return { slopes, gables, ridgeY, eavesY, ridge: [r0, r1], eaves };
}

export interface FlatSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
}
export interface Pillar {
  x: number;
  z: number;
  y0: number;
  y1: number;
}

export function floorBase(model: HouseModel, floor: Floor) {
  return floor.level * (model.ceilingHeight + model.slabThickness);
}

export function exteriorOf(model: HouseModel): Exterior {
  return { ...DEFAULT_EXTERIOR, ...(model.exterior ?? {}) };
}

/**
 * Work out the roofs from the floors alone: the top floor gets a gable (one
 * per roof group if the extension roof is "separate"); any lower-floor area
 * with nothing above it, plus canopies, gets a flat roof.
 */
export function planRoofs(model: HouseModel): { blocks: RoofBlock[]; flats: FlatSpec[]; pillars: Pillar[] } {
  const ext = exteriorOf(model);
  const blocks: RoofBlock[] = [];
  const all = modelBounds(model.floors);
  const style: RoofEnd = ext.roofStyle === "hip" ? "hip" : "gable";
  const partyLeft = ext.partyWall === "left" || ext.partyWall === "both";
  const partyRight = ext.partyWall === "right" || ext.partyWall === "both";
  const flats: FlatSpec[] = [];
  const pillars: Pillar[] = [];
  const floors = [...model.floors].sort((a, b) => a.level - b.level);
  const topLevel = floors.length ? floors[floors.length - 1].level : 0;

  for (const floor of floors) {
    const yTop = floorBase(model, floor) + model.ceilingHeight;
    const above = floors.filter((f) => f.level === floor.level + 1);
    const abovePolys = above.flatMap((f) => f.rooms.map((r) => roomWorldPolygon(f, r)));
    const roomPolys = floor.rooms.map((r) => roomWorldPolygon(floor, r));
    const canopyPolys = (floor.canopies ?? []).map((poly) => poly.map((p: Pt) => toWorld(floor, p)));

    if (floor.level === topLevel && floor.rooms.length) {
      const groups = new Map<string, Room[]>();
      for (const r of floor.rooms) {
        const g = ext.extensionRoof === "separate" ? r.roofGroup ?? "main" : "main";
        groups.set(g, [...(groups.get(g) ?? []), r]);
      }
      const rects = [...groups.values()].map((rooms) => bbox(rooms.flatMap((r) => roomWorldPolygon(floor, r))));
      const TOL = 0.3;
      for (const b of rects) {
        const axis = ext.ridgeAxis === "auto" ? (b.w >= b.h ? "x" : "z") : ext.ridgeAxis;
        const [lo, hi] = axis === "x" ? [b.x0, b.x1] : [b.y0, b.y1];
        // An end that meets another roof block, or the party wall, stops flush.
        const touches = (v: number) =>
          rects.some((o) => o !== b && (axis === "x" ? Math.abs(o.x0 - v) < TOL || Math.abs(o.x1 - v) < TOL : Math.abs(o.y0 - v) < TOL || Math.abs(o.y1 - v) < TOL));
        const party = (v: number, side: "lo" | "hi") =>
          axis === "x" && (side === "lo" ? partyLeft && Math.abs(v - all.x0) < TOL : partyRight && Math.abs(v - all.x1) < TOL);
        blocks.push({
          x0: b.x0,
          z0: b.y0,
          x1: b.x1,
          z1: b.y1,
          y: yTop,
          axis,
          pitchDeg: ext.pitchDeg,
          overhang: ext.overhang,
          start: party(lo, "lo") || touches(lo) ? "flush" : style,
          end: party(hi, "hi") || touches(hi) ? "flush" : style,
        });
      }
      // Canopies on the top floor still get a flat roof.
      if (canopyPolys.length) flats.push(...rasterFlat(canopyPolys, [], yTop));
    } else if (roomPolys.length || canopyPolys.length) {
      flats.push(...rasterFlat([...roomPolys, ...canopyPolys], abovePolys, yTop));
    }

    // Pillars at canopy corners that are not on a wall.
    for (const poly of canopyPolys) {
      for (const v of poly) {
        const nearWall = roomPolys.some((rp) => distToPolygonEdge(v, rp) < 0.4);
        if (!nearWall) pillars.push({ x: v.x, z: v.y, y0: floorBase(model, floor), y1: yTop });
      }
    }
  }
  return { blocks, flats, pillars };
}

function distToPolygonEdge(p: V2, poly: V2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

/** Rasterise (cover minus above) on a 0.25 m grid and merge cells into rectangles. */
function rasterFlat(cover: V2[][], above: V2[][], y: number): FlatSpec[] {
  const CELL = 0.25;
  const pts = cover.flat();
  if (!pts.length) return [];
  const b = bbox(pts);
  const nx = Math.ceil(b.w / CELL);
  const nz = Math.ceil(b.h / CELL);
  const grid: boolean[][] = [];
  for (let j = 0; j < nz; j++) {
    const row: boolean[] = [];
    for (let i = 0; i < nx; i++) {
      const c = { x: b.x0 + (i + 0.5) * CELL, y: b.y0 + (j + 0.5) * CELL };
      const inCover = cover.some((p) => pointInPolygon(c, p));
      const inAbove = inCover && above.some((p) => pointInPolygon(c, p));
      row.push(inCover && !inAbove);
    }
    grid.push(row);
  }
  // Greedy rectangle decomposition.
  const out: FlatSpec[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!grid[j][i]) continue;
      let w = 1;
      while (i + w < nx && grid[j][i + w]) w++;
      let h = 1;
      outer: while (j + h < nz) {
        for (let k = 0; k < w; k++) if (!grid[j + h][i + k]) break outer;
        h++;
      }
      for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) grid[j + jj][i + k] = false;
      out.push({ x0: b.x0 + i * CELL, z0: b.y0 + j * CELL, x1: b.x0 + (i + w) * CELL, z1: b.y0 + (j + h) * CELL, y });
    }
  }
  return out;
}
