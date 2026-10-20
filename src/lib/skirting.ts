import type { Room } from "../types";

/** White-painted skirting, the default in every room. */
export const DEFAULT_SKIRTING_COLOUR = "#f3f1ea";

/** The skirting colour of a room: its own, or white paint when it has none (or the room is unknown). */
export function skirtingColour(room: Pick<Room, "skirtingColor"> | undefined): string {
  return room?.skirtingColor || DEFAULT_SKIRTING_COLOUR;
}
