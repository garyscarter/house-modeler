import { useMemo } from "react";
import { byId, isElectricalItem, isFloorCovering, mountOf, type CatalogueItem } from "../../lib/catalogue";
import { ELECTRIC_GLYPH_M } from "../../lib/electricSymbols";
import { glyphOffset } from "../../lib/electrics";
import type { Mode } from "../../lib/modes";
import { fixtureSelectable } from "../../lib/planHit";
import { EXT_WALL_T, WALL_T } from "../../lib/geometry";
import { abutNeighbours, fixtureBox, fixtureSolids, overlappingIds, rectCorners, snapToWall, wallLines, type Placement, type Seg } from "../../lib/planMath";
import { planWallLines, planWalls } from "../../lib/planWalls";
import { fitProblem, fitRecess, fitWindow, floorFaces } from "../../lib/recess";
import type { Fixture, Floor, JoineryConfig, Pt } from "../../types";
import { sameMap, useSame } from "./layers/shared";

/** The catalogue item for furniture (not an electrical point, which has its own layer and snapping). */
const furnitureOf = (id: string): CatalogueItem | undefined => {
  const item = byId(id);
  return item && !isElectricalItem(item) ? item : undefined;
};

type Fit = Placement & { w: number; d?: number; h?: number; joinery?: JoineryConfig };

/**
 * Everything the plan derives from the floor's geometry: wall lines and faces, fixture solids and footprints, clashes
 * and misfits, the snap targets, and the two placement helpers. Memoised on the pieces each really depends on, so a
 * fixture drag does not rebuild the walls and a corner drag does not rebuild the furniture.
 */
export function usePlanGeometry(floor: Floor, wallsOn: boolean, snapTol: number, mode: Mode = "build") {
  const ppm = floor.pxPerM;
  const { rooms: fRooms, walls: fWalls, openings: fOpenings, pxPerM: fPpm, origin: fOrigin, offset: fOffset } = floor;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => wallLines(floor, WALL_T, EXT_WALL_T), [fRooms, fPpm]);
  const segs = useMemo(() => lines.map((l) => [l.a, l.b] as Seg), [lines]);
  // The walls as the 3D shell builds them, with real thickness: drawn as the wall layer and used to sit furniture flush on the faces.
  const wallShapes = useMemo(() => (wallsOn ? planWalls(floor) : []), [wallsOn, fRooms, fWalls, fOpenings, fPpm, fOrigin, fOffset]);
  const faceLines = useMemo(() => planWallLines(floor), [fRooms, fWalls, fPpm, fOrigin, fOffset]);
  const faces = useMemo(() => floorFaces(floor), [fRooms, fWalls, fOpenings, fPpm, fOrigin, fOffset]);
  // Electrical points are not furniture: a socket behind a sofa is no clash, and a sofa does not stop at a socket.
  const solids = useMemo(() => fixtureSolids(floor.fixtures ?? [], ppm, furnitureOf), [floor.fixtures, ppm]);
  const clashes = useMemo(() => overlappingIds(solids, 0.5), [solids]);
  // Fitted joinery that no longer fits its recess or window, with why.
  const misfitsNow = useMemo(() => {
    const out = new Map<string, string>();
    for (const fx of floor.fixtures ?? []) {
      if (!fx.joinery?.fit) continue;
      const item = byId(fx.type);
      const why = item && fitProblem(floor, fx, item, faces);
      if (why) out.set(fx.id, why);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.fixtures, faces]);
  // A corner drag rebuilds `faces`; keep the same map while its contents hold so the furniture layer is not redrawn for it.
  const misfits = useSame(misfitsNow, sameMap);
  const flagged = useMemo(() => new Set([...clashes, ...misfits.keys()]), [clashes, misfits]);
  /**
   * A built-in or window seat fitted to the recess or window under c (a placed unit takes the recess's width and depth);
   * null for other items, when Alt is held, or when nothing is in reach (a built-in then places like any unit).
   */
  const fitPlacing = (c: Pt, item: CatalogueItem, free: boolean): Fit | null => {
    if (free) return null;
    if (item.symbol === "built-in") {
      const f = fitRecess(floor, c, { defaultW: item.w, defaultD: item.d }, faces);
      if (!f) return null;
      return { x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, ...(f.sides >= 1 ? { joinery: { fit: "recess" as const } } : {}) };
    }
    if (item.symbol === "window-seat") {
      const f = fitWindow(floor, c, { defaultD: item.d, h: item.h }, faces);
      if (!f) return null;
      return { x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, ...(f.h !== undefined ? { h: f.h } : {}), joinery: { fit: "window" as const } };
    }
    return null;
  };
  // Rugs draw under everything, and wall-hung and worktop items over the units below them, whatever order they were placed in.
  const drawOrder = useMemo(() => {
    const mountedAt = (fx: Fixture) => { const it = byId(fx.type); return !it ? 0 : isFloorCovering(it) ? -1 : mountOf(fx, it); };
    return [...(floor.fixtures ?? [])].sort((a, b) => mountedAt(a) - mountedAt(b));
  }, [floor.fixtures]);
  // What the pointer can pick in this mode: furniture boxes, or in Electrics the points' symbol squares (easy to hit).
  const hitShapes = useMemo(
    () =>
      drawOrder.flatMap((fx) => {
        const item = byId(fx.type);
        if (!item || !fixtureSelectable(mode, item)) return [];
        if (mode === "electrics") {
          const o = glyphOffset(fx, item, ELECTRIC_GLYPH_M);
          const half = ELECTRIC_GLYPH_M * 0.6 * ppm;
          const c = { x: fx.x + o.x * ppm, y: fx.y + o.y * ppm };
          return [{ id: fx.id, corners: [{ x: c.x - half, y: c.y - half }, { x: c.x + half, y: c.y - half }, { x: c.x + half, y: c.y + half }, { x: c.x - half, y: c.y + half }] }];
        }
        const b = fixtureBox(fx, item);
        return [{ id: fx.id, corners: rectCorners(fx, b.w * ppm, b.d * ppm, fx.rot) }];
      }),
    [drawOrder, ppm, mode],
  );
  const footprints = useMemo(
    () =>
      (floor.fixtures ?? []).flatMap((fx) => {
        const item = furnitureOf(fx.type);
        if (!item) return [];
        const b = fixtureBox(fx, item);
        return [{ id: fx.id, x: fx.x, y: fx.y, rot: fx.rot, w: b.w * ppm, d: b.d * ppm, z0: b.z0, z1: b.z0 + b.h }];
      }),
    [floor.fixtures, ppm],
  );
  /**
   * Where a fixture centred at c lands: back against a wall within reach,
   * facing into the room and flush with its neighbours in the run; null when
   * no wall is near or Alt is held. `how` "wall" (an electrical point on a wall) only sits its back on the wall face,
   * never abutting furniture; "none" (a ceiling point or floor socket) never snaps.
   */
  const snapFixture = (c: Pt, b: { w: number; d: number; h: number; z0: number }, rot: number, free: boolean, exclude?: string, how: "furniture" | "wall" | "none" = "furniture"): Placement | null => {
    if (free || how === "none") return null;
    // Reach: a little more than for corners, and never under 10 cm when zoomed right in.
    const reach = Math.max(snapTol * 1.5, 0.1 * ppm);
    const onWall = snapToWall(c, b.w * ppm, b.d * ppm, faceLines, reach, rot);
    if (!onWall || how === "wall") return onWall;
    const others = footprints.filter((f) => f.id !== exclude);
    return abutNeighbours(onWall, b.w * ppm, b.d * ppm, b.z0, b.z0 + b.h, others, reach);
  };
  /** Points worth snapping to: room corners, wall ends and fixture corners. */
  const corners = useMemo(
    () => [...floor.rooms.flatMap((r) => r.polygon), ...(floor.walls ?? []).flatMap((w) => [w.a, w.b]), ...solids.flatMap((s) => s.corners)],
    [floor.rooms, floor.walls, solids],
  );
  /** Snap to room corners and wall ends, then to their x / y lines, so walls line up. */
  const snapTargets = useMemo(() => [...floor.rooms.flatMap((r) => r.polygon), ...(floor.walls ?? []).flatMap((w) => [w.a, w.b])], [floor.rooms, floor.walls]);
  return { segs, wallShapes, faceLines, faces, clashes, misfits, flagged, fitPlacing, drawOrder, hitShapes, snapFixture, corners, snapTargets };
}
