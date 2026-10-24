import type { HouseModel } from "../types";
import { buildWalls, pointInPolygon, roomWorldPolygon, type V2 } from "./geometry";
import { wallEnds, wallThickness } from "./walls";
import { wallPolysWorld, type WorldWallPoly } from "./planWalls";

/**
 * Walls for the site view, in world metres (x right, y = plan y): the real
 * wall bands per storey, and the outer face of every exterior wall.
 */

export type WorldWall = WorldWallPoly;

export interface ExteriorFace {
  a: V2;
  b: V2;
  /** Unit normal pointing away from the house. */
  n: V2;
}

export interface LevelWalls {
  level: number;
  walls: WorldWall[];
}

export interface LevelFaces {
  level: number;
  segments: ExteriorFace[];
}

const levelsOf = (model: HouseModel) => [...new Set(model.floors.map((f) => f.level))].sort((a, b) => a - b);

/** Wall polygons of every floor, grouped by storey. */
export function siteWalls(model: HouseModel): LevelWalls[] {
  return levelsOf(model).map((level) => ({
    level,
    walls: model.floors.filter((f) => f.level === level).flatMap((f) => wallPolysWorld(f)),
  }));
}

/**
 * The outer face of every exterior wall: the centre line moved out by half the
 * thickness, away from the rooms, and lengthened by the same so corners meet.
 */
export function exteriorFaces(model: HouseModel): LevelFaces[] {
  return levelsOf(model).map((level) => {
    const segments: ExteriorFace[] = [];
    for (const floor of model.floors.filter((f) => f.level === level)) {
      const rooms = floor.rooms.map((r) => roomWorldPolygon(floor, r));
      const walls = buildWalls(floor);
      const thick = walls.map(wallThickness);
      const ends = wallEnds(walls, thick);
      walls.forEach((w, i) => {
        if (!w.exterior) return;
        const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        if (len < 1e-6) return;
        const dir = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
        let n = { x: -dir.y, y: dir.x };
        const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
        if (rooms.some((p) => pointInPolygon({ x: mid.x + n.x * 0.05, y: mid.y + n.y * 0.05 }, p))) n = { x: -n.x, y: -n.y };
        const h = thick[i] / 2;
        // Same end rules as planWalls: side 0 is the +n face. The outer face runs round a corner.
        const e = ends[i];
        const side: 0 | 1 = n.x * -dir.y + n.y * dir.x > 0 ? 0 : 1;
        const s0 = e.inner[0]?.side === side ? -e.inner[0].ext : -e.ext[0];
        const s1 = e.inner[1]?.side === side ? e.inner[1].ext : e.ext[1];
        const off = { x: n.x * h, y: n.y * h };
        segments.push({
          a: { x: w.a.x + dir.x * s0 + off.x, y: w.a.y + dir.y * s0 + off.y },
          b: { x: w.b.x + dir.x * s1 + off.x, y: w.b.y + dir.y * s1 + off.y },
          n,
        });
      });
    }
    return { level, segments };
  });
}
