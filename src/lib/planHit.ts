import type { Floor, Pt } from "../types";
import type { Mode } from "./modes";
import { editsFixtures } from "./modes";
import { isElectricalItem, type CatalogueItem } from "./catalogue";
import { isWallPoint } from "./electrics";
import { pointInPolygon } from "./geometry";
import { closestOnSegment } from "./planMath";

/** What is under the pointer on the plan, for the right-click menu. */
export type PlanTarget =
  | { kind: "fixture"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "wall"; id: string }
  /** `edge` is the index of the room's nearest wall (polygon[edge] to polygon[edge + 1]) when the point is close to one. */
  | { kind: "room"; id: string; edge: number | null }
  | { kind: "empty" };

/** A furniture footprint on the plan, listed in drawing order (the last one is on top). */
export interface HitSolid {
  id: string;
  corners: Pt[];
}

/**
 * "Click again to pick the item under it": the shape under p that comes after currentId going down the stack
 * (topmost first), wrapping round; the topmost when currentId isn't under p; null when nothing is.
 */
export function nextUnder(shapes: HitSolid[], p: Pt, currentId: string | null): string | null {
  const under: string[] = [];
  for (let i = shapes.length - 1; i >= 0; i--) if (pointInPolygon(p, shapes[i].corners)) under.push(shapes[i].id);
  if (!under.length) return null;
  const at = currentId === null ? -1 : under.indexOf(currentId);
  return under[(at + 1) % under.length];
}

/** The nearest edge of a polygon to p within tol, or null. */
export function nearestEdge(poly: Pt[], p: Pt, tol: number): number | null {
  let best: number | null = null;
  let bestD = tol;
  for (let i = 0; i < poly.length; i++) {
    const d = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]).d;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Whether the plan in this mode lets the pointer pick the item. Furnish picks furniture and lights but not Electrics-category
 * points (drawn greyed); Electrics picks only electrical points (Lighting and Electrics); other modes pick nothing.
 */
export function fixtureSelectable(mode: Mode, item: Pick<CatalogueItem, "category">): boolean {
  if (mode === "furnish") return item.category !== "Electrics";
  if (mode === "electrics") return isElectricalItem(item);
  return false;
}

/**
 * How an item snaps when placed or dragged: furniture to a wall and its neighbours; a wall point (socket, switch, wall light)
 * to a wall face only; a ceiling point or floor socket not at all.
 */
export function snapKind(item: Pick<CatalogueItem, "category" | "ceiling" | "symbol">): "furniture" | "wall" | "none" {
  if (!isElectricalItem(item)) return "furniture";
  return isWallPoint(item) ? "wall" : "none";
}

/**
 * The thing under p, in priority order: a fixture (Furnish, Electrics; `solids` holds only what the mode can pick), an opening within `tol.hit` of its centre line (Build),
 * a free-standing wall within `tol.hit` (Build and Decorate), the topmost room containing p with its nearest edge within
 * `tol.edge` (Build and Decorate), else empty. Tolerances are in image px.
 */
export function planTargetAt(floor: Floor, p: Pt, mode: Mode, tol: { hit: number; edge: number }, solids: HitSolid[] = []): PlanTarget {
  if (editsFixtures(mode)) {
    for (let i = solids.length - 1; i >= 0; i--) if (pointInPolygon(p, solids[i].corners)) return { kind: "fixture", id: solids[i].id };
    return { kind: "empty" };
  }
  if (mode !== "build" && mode !== "decorate") return { kind: "empty" };
  if (mode === "build") {
    let best: { id: string; d: number } | null = null;
    for (const o of floor.openings) {
      const half = (o.widthM * floor.pxPerM) / 2;
      const a = o.orientation === "h" ? { x: o.x - half, y: o.y } : { x: o.x, y: o.y - half };
      const b = o.orientation === "h" ? { x: o.x + half, y: o.y } : { x: o.x, y: o.y + half };
      const d = closestOnSegment(p, a, b).d;
      if (d <= tol.hit && (!best || d < best.d)) best = { id: o.id, d };
    }
    if (best) return { kind: "opening", id: best.id };
  }
  let wall: { id: string; d: number } | null = null;
  for (const w of floor.walls ?? []) {
    const d = closestOnSegment(p, w.a, w.b).d;
    if (d <= tol.hit && (!wall || d < wall.d)) wall = { id: w.id, d };
  }
  if (wall) return { kind: "wall", id: wall.id };
  for (let i = floor.rooms.length - 1; i >= 0; i--) {
    const r = floor.rooms[i];
    if (pointInPolygon(p, r.polygon)) return { kind: "room", id: r.id, edge: nearestEdge(r.polygon, p, tol.edge) };
  }
  return { kind: "empty" };
}
