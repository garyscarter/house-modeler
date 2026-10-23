import type { Room } from "../types";

/** Default floor colours by room type, matched on the room name. */
const ROOM_COLORS: Record<string, string> = {
  kitchen: "#e8d9b5",
  bath: "#cfe3ec",
  shower: "#cfe3ec",
  wc: "#cfe3ec",
  "en-suite": "#cfe3ec",
  ensuite: "#cfe3ec",
  bed: "#e3d5e6",
  living: "#d9e4cf",
  lounge: "#d9e4cf",
  recep: "#d9e4cf",
  sitting: "#d9e4cf",
  dining: "#e6dcc8",
  hall: "#e2e2dc",
  landing: "#e2e2dc",
  garage: "#cfcfcf",
  util: "#dcdcd0",
  study: "#d6dfe8",
  office: "#d6dfe8",
  conserv: "#d8ebe0",
  store: "#d9d9d9",
  cupboard: "#d9d9d9",
};

/** A room's own colour, or one picked from its name. */
export function roomColor(room: Room): string {
  if (room.color) return room.color;
  const n = room.name.toLowerCase();
  for (const k of Object.keys(ROOM_COLORS)) if (n.includes(k)) return ROOM_COLORS[k];
  return "#e4e1d8";
}
