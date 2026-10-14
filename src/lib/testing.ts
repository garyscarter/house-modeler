import type { Floor, Opening, Room } from "../types";

/** Test helpers: build floors in a 1 px = 1 cm image so coordinates read as centimetres. */
export function rect(name: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<Room> = {}): Room {
  return {
    id: name,
    name,
    polygon: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    ...extra,
  };
}

export function floor(rooms: Room[], openings: Opening[] = [], extra: Partial<Floor> = {}): Floor {
  return {
    id: "f" + (extra.level ?? 0),
    name: "Floor",
    level: 0,
    image: "",
    imageW: 2000,
    imageH: 2000,
    pxPerM: 100,
    origin: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    rooms,
    openings,
    ...extra,
  };
}
