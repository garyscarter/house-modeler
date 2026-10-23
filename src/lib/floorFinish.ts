import type { FloorFinish, Room } from "../types";

export type TexturedFloor = Exclude<FloorFinish, "plain">;

/** Typical colour of each floor finish, used when the room has no colour of its own. */
export const FLOOR_COLOUR: Record<TexturedFloor, string> = {
  oak: "#b88a58",
  laminate: "#c9b393",
  tile: "#e4e0d8",
  quarry: "#9a4a35",
  stone: "#b7ae9f",
  carpet: "#d4c8b6",
  vinyl: "#d5d0c6",
  concrete: "#a9a8a3",
  // Light natural oak.
  herringbone: "#d2ae82",
  chevron: "#d2ae82",
  wideoak: "#c9a67b",
  // Warm pale grey, stone effect.
  porcelain: "#d8d3ca",
  microcement: "#bfb9b0",
  // The ground; the chips keep their own colours.
  terrazzo: "#ebe6dc",
  // The pattern colour, on an off-white ground.
  encaustic: "#3f5768",
  // The terracotta, with black and cream.
  victorian: "#a7553a",
  hexagon: "#ecebe6",
};

/** Grout colour of the finishes laid in grout, when the room doesn't set its own. */
export const DEFAULT_GROUT = {
  tile: "#b9b4aa",
  quarry: "#4a3f3a",
  porcelain: "#a7a29a",
  hexagon: "#9c978e",
  victorian: "#8f887d",
  encaustic: "#cdc6b9",
} satisfies Partial<Record<TexturedFloor, string>>;
export type GroutedFloor = keyof typeof DEFAULT_GROUT;

export const takesGrout = (f: FloorFinish | undefined): f is GroutedFloor => !!f && f in DEFAULT_GROUT;

/** Finishes with no direction to turn (carpet, concrete, terrazzo, microcement): no angle field for them. */
const UNDIRECTED: FloorFinish[] = ["plain", "carpet", "concrete", "microcement", "terrazzo"];
export const takesAngle = (f: FloorFinish | undefined): boolean => !UNDIRECTED.includes(f ?? "plain");

/** The floor's colour for a textured finish: the room's own, else the finish's typical colour. Undefined for plain floors. */
export function finishColour(room: Pick<Room, "floorFinish" | "color">): string | undefined {
  const f = room.floorFinish ?? "plain";
  return f === "plain" ? undefined : (room.color ?? FLOOR_COLOUR[f]);
}

/** The grout colour for a finish laid in grout, or undefined. */
export function groutColour(room: Pick<Room, "floorFinish" | "floorGrout">): string | undefined {
  return takesGrout(room.floorFinish) ? (room.floorGrout ?? DEFAULT_GROUT[room.floorFinish]) : undefined;
}

/** Pattern direction in degrees for a room (0 when unset or not directional). */
export const floorAngle = (room: Pick<Room, "floorFinish" | "floorAngle">): number => (takesAngle(room.floorFinish) ? (room.floorAngle ?? 0) : 0);
