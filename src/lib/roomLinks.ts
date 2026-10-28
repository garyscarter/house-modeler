import type { Floor, Room } from "../types";

export const FLOOR_LINK_FIELDS = ["floorFinish", "floorAngle", "floorGrout", "color"] as const;
export const WALL_LINK_FIELDS = ["wallCovering", "wallPaint", "wallAccent", "upperCovering", "upperAccent", "skirtingColor"] as const;

export type LinkKind = "floor" | "walls";

const fromKey = (kind: LinkKind) => (kind === "floor" ? "floorFrom" : "wallsFrom") as "floorFrom" | "wallsFrom";
const fieldsOf = (kind: LinkKind): readonly (keyof Room)[] => (kind === "floor" ? FLOOR_LINK_FIELDS : WALL_LINK_FIELDS);

const roomCount = (floors: Floor[]) => floors.reduce((n, f) => n + f.rooms.length, 0);

export function findRoom(floors: Floor[], id: string): { floor: Floor; room: Room } | undefined {
  for (const floor of floors) {
    const room = floor.rooms.find((r) => r.id === id);
    if (room) return { floor, room };
  }
  return undefined;
}

/** Follow links from `id` to the room that follows nobody; undefined if the chain hits a missing room or loops. */
export function linkRoot(floors: Floor[], id: string, kind: LinkKind): string | undefined {
  let cur = id;
  const max = roomCount(floors);
  for (let i = 0; i <= max; i++) {
    const found = findRoom(floors, cur);
    if (!found) return undefined;
    const next = found.room[fromKey(kind)];
    if (!next) return cur;
    cur = next;
  }
  return undefined;
}

function copyFields(from: Room, to: Room, kind: LinkKind): Room {
  let out = to;
  for (const f of fieldsOf(kind)) {
    if (out[f] !== from[f]) out = { ...out, [f]: from[f] };
  }
  return out;
}

function mapRoom(floors: Floor[], roomId: string, fn: (r: Room) => Room): Floor[] {
  return floors.map((f) => {
    if (!f.rooms.some((r) => r.id === roomId)) return f;
    return { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? fn(r) : r)) };
  });
}

/** Make a room follow `sourceId` (copying its values), or clear the link (keeping the values). */
export function setLink(floors: Floor[], floorId: string, roomId: string, kind: LinkKind, sourceId: string | undefined): Floor[] {
  const key = fromKey(kind);
  const floor = floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);
  if (!room) return floors;
  const root = sourceId ? linkRoot(floors, sourceId, kind) : undefined;
  if (!root || root === roomId) {
    if (room[key] === undefined) return floors;
    return mapRoom(floors, roomId, (r) => ({ ...r, [key]: undefined }));
  }
  const src = findRoom(floors, root)!.room;
  return mapRoom(floors, roomId, (r) => ({ ...copyFields(src, r, kind), [key]: root }));
}

/** After a room changed, copy its link fields onto every room that follows it. Same array when nothing changed. */
export function syncLinks(floors: Floor[], changedRoomId: string, depth = 0): Floor[] {
  if (depth > 8) return floors;
  const src = findRoom(floors, changedRoomId)?.room;
  if (!src) return floors;
  let out = floors;
  const touched: string[] = [];
  for (const kind of ["floor", "walls"] as const) {
    const key = fromKey(kind);
    const mapped = out.map((f) => {
      let rooms = f.rooms;
      f.rooms.forEach((r, i) => {
        if (r[key] !== changedRoomId) return;
        const next = copyFields(src, r, kind);
        if (next === r) return;
        if (rooms === f.rooms) rooms = [...f.rooms];
        rooms[i] = next;
        touched.push(r.id);
      });
      return rooms === f.rooms ? f : { ...f, rooms };
    });
    if (mapped.some((f, i) => f !== out[i])) out = mapped;
  }
  for (const id of new Set(touched)) out = syncLinks(out, id, depth + 1);
  return out;
}

export function linkedFollowers(floors: Floor[], id: string, kind: LinkKind): Room[] {
  const key = fromKey(kind);
  return floors.flatMap((f) => f.rooms.filter((r) => r[key] === id));
}
