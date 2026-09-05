import type { Exterior, Floor, HouseModel, Pt, Room } from "../types";
import { DEFAULT_EXTERIOR } from "../types";
import { bbox, pointInPolygon, roomWorldPolygon, toWorld, type V2 } from "./geometry";

export interface GableSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height of the top of the walls the roof sits on. */
  y: number;
  axis: "x" | "z";
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
export function planRoofs(model: HouseModel): { gables: GableSpec[]; flats: FlatSpec[]; pillars: Pillar[] } {
  const ext = exteriorOf(model);
  const gables: GableSpec[] = [];
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
      for (const rooms of groups.values()) {
        const b = bbox(rooms.flatMap((r) => roomWorldPolygon(floor, r)));
        const axis = ext.ridgeAxis === "auto" ? (b.w >= b.h ? "x" : "z") : ext.ridgeAxis;
        gables.push({ x0: b.x0, z0: b.y0, x1: b.x1, z1: b.y1, y: yTop, axis });
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
  return { gables, flats, pillars };
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
