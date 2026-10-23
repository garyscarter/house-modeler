import { pointInPolygon, type V2 } from "./geometry";
import { closestOnSegment } from "./planMath";

/** A room's outline in the same frame as the hit point (plan px or world metres). */
export interface RoomOutline {
  id: string;
  poly: V2[];
}

export type Side = "inside" | "outside";

/** The wall face Decorate has selected: edge i of the selected room, and which face of it. */
export interface EdgePick {
  edge: number;
  side: Side;
}

/** What a tap landed on: a room's floor (edge null) or one face of one of its walls. */
export type DecorPick = { roomId: string; edge: number | null; side: Side } | null;

/** The last room (array order, as the plan draws them) that contains p. */
function roomAt(rooms: RoomOutline[], p: V2): RoomOutline | undefined {
  for (let i = rooms.length - 1; i >= 0; i--) if (pointInPolygon(p, rooms[i].poly)) return rooms[i];
  return undefined;
}

/** Nearest edge of a polygon to p, with its distance and the closest point on it. */
function nearestEdge(poly: V2[], p: V2): { edge: number; d: number; q: V2 } | null {
  let best: { edge: number; d: number; q: V2 } | null = null;
  for (let i = 0; i < poly.length; i++) {
    const c = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    if (!best || c.d < best.d) best = { edge: i, d: c.d, q: c.q };
  }
  return best;
}

/**
 * What a tap on the plan picks in Decorate. Inside a room: its nearest edge if
 * within `tol`, else the floor (edge null). Outside every room: the nearest
 * edge of any room within `tol`, on its outside unless another room lies just
 * past it.
 */
export function pickInPlan(rooms: RoomOutline[], p: V2, tol: number): DecorPick {
  const r = roomAt(rooms, p);
  if (r) {
    const n = nearestEdge(r.poly, p);
    if (n && n.d <= tol) return { roomId: r.id, edge: n.edge, side: "inside" };
    return { roomId: r.id, edge: null, side: "inside" };
  }
  let best: { room: RoomOutline; edge: number; d: number; q: V2 } | null = null;
  for (const room of rooms) {
    const n = nearestEdge(room.poly, p);
    if (n && n.d <= tol && (!best || n.d < best.d)) best = { room, ...n };
  }
  if (!best) return null;
  // Step away from the room: towards the tap, or along the outward normal when the tap is on the edge itself.
  const a = best.room.poly[best.edge];
  const b = best.room.poly[(best.edge + 1) % best.room.poly.length];
  let dx = p.x - best.q.x;
  let dy = p.y - best.q.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const el = Math.hypot(ex, ey) || 1;
    dx = ey / el;
    dy = -ex / el;
    const probe = { x: best.q.x + dx * tol * 0.1, y: best.q.y + dy * tol * 0.1 };
    if (pointInPolygon(probe, best.room.poly)) {
      dx = -dx;
      dy = -dy;
    }
    len = 1;
  }
  const past = { x: best.q.x + (dx / len) * 2 * tol, y: best.q.y + (dy / len) * 2 * tol };
  return { roomId: best.room.id, edge: best.edge, side: roomAt(rooms, past) ? "inside" : "outside" };
}

/**
 * Which wall face a 3D hit is on. `hit` and `normal` are in the plan frame
 * (world x, z). A face looking into a room is that room's inside; a face
 * looking away from the room behind it is its outside. `null` when no room's
 * edge is within `maxDist`.
 */
export function pickWallFace(
  rooms: RoomOutline[],
  hit: V2,
  normal: V2,
  o: { probe: number; through: number; maxDist: number },
): DecorPick {
  const nl = Math.hypot(normal.x, normal.y);
  if (nl < 1e-9) return null;
  const n = { x: normal.x / nl, y: normal.y / nl };
  let room = roomAt(rooms, { x: hit.x + n.x * o.probe, y: hit.y + n.y * o.probe });
  let side: Side = "inside";
  if (!room) {
    room = roomAt(rooms, { x: hit.x - n.x * o.through, y: hit.y - n.y * o.through });
    side = "outside";
  }
  if (!room) return null;
  const e = nearestEdge(room.poly, hit);
  if (!e || e.d > o.maxDist) return null;
  return { roomId: room.id, edge: e.edge, side };
}
