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
  // A tap exactly on an edge is decided by the normal probe below, not by the parity of pointInPolygon.
  const onEdge = rooms.some((room) => {
    const n = nearestEdge(room.poly, p);
    return n !== null && n.d < 1e-6;
  });
  const r = onEdge ? undefined : roomAt(rooms, p);
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
 * The first edge crossed walking from `hit` along `dir` (unit) for at most
 * `maxDist`. Walls are centred on the traced lines, so this is the wall that was
 * hit, where the nearest edge can be a neighbouring wall at a junction.
 */
function edgeBehind(poly: V2[], hit: V2, dir: V2, maxDist: number): number | null {
  let best: { edge: number; t: number } | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y, den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const wx = a.x - hit.x, wy = a.y - hit.y;
    const t = (wx * ey - wy * ex) / den, s = (wx * dir.y - wy * dir.x) / den;
    if (t >= -1e-6 && t <= maxDist && s >= -1e-6 && s <= 1 + 1e-6 && (!best || t < best.t)) best = { edge: i, t };
  }
  return best?.edge ?? null;
}

/**
 * Which wall face a 3D hit is on. `hit` and `normal` are in the plan frame
 * (world x, z). A face looking into a room is that room's inside; a face
 * looking away from the room behind it is its outside. `null` when no room's
 * edge is within `maxDist`. `extra` holds outlines (bay floors) that only say
 * which room a probe point belongs to; the edge is then taken from the room
 * itself, with no distance limit as the bay lies outside its polygon.
 * Known limitation: an open door leaf is not told apart from the wall it hangs in.
 */
export function pickWallFace(
  rooms: RoomOutline[],
  hit: V2,
  normal: V2,
  o: { probe: number; through: number; maxDist: number },
  extra: RoomOutline[] = [],
): DecorPick {
  const nl = Math.hypot(normal.x, normal.y);
  if (nl < 1e-9) return null;
  const n = { x: normal.x / nl, y: normal.y / nl };
  const probe = { x: hit.x + n.x * o.probe, y: hit.y + n.y * o.probe };
  const through = { x: hit.x - n.x * o.through, y: hit.y - n.y * o.through };
  let side: Side = "inside";
  let fromBay = false;
  let room = roomAt(rooms, probe);
  if (!room) {
    const bay = roomAt(extra, probe);
    if (bay) {
      room = rooms.find((r) => r.id === bay.id);
      fromBay = true;
    }
  }
  if (!room) {
    side = "outside";
    room = roomAt(rooms, through);
    if (!room) {
      const bay = roomAt(extra, through);
      if (bay) {
        room = rooms.find((r) => r.id === bay.id);
        fromBay = true;
      }
    }
  }
  if (!room) return null;
  const dir = { x: -n.x, y: -n.y };
  const behind = edgeBehind(room.poly, hit, dir, fromBay ? Infinity : o.maxDist);
  if (behind !== null) return { roomId: room.id, edge: behind, side };
  const e = nearestEdge(room.poly, hit);
  if (!e || (!fromBay && e.d > o.maxDist)) return null;
  return { roomId: room.id, edge: e.edge, side };
}
