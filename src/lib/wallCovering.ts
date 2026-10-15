import type { Room, WallCovering } from "../types";

/** Default colour of interior paint (warm white). */
export const WARM_WHITE = "#f4f1ea";

export type Pattern = Exclude<WallCovering, "paint">;

/** Colour of the covering itself when the room sets none: brick is exposed, so it starts brick-coloured. */
const DEFAULT_BASE: Record<WallCovering, string> = {
  paint: WARM_WHITE,
  stripe: WARM_WHITE,
  floral: WARM_WHITE,
  sprig: WARM_WHITE,
  tiles: WARM_WHITE,
  brick: "#b5714f",
};

/** Pattern colour when the room sets none. Tiles have no feature strip unless one is chosen. */
const DEFAULT_ACCENT: Record<Pattern, string | null> = {
  stripe: "#d2c9bb",
  floral: "#c8364a",
  sprig: "#6f8fc4",
  tiles: null,
  brick: "#c9c3b6",
};

/** What the base colour paints, for the inspector. */
export const BASE_LABEL: Record<WallCovering, string> = {
  paint: "Wall paint",
  stripe: "Paper colour",
  floral: "Paper colour",
  sprig: "Paper colour",
  tiles: "Tile colour",
  brick: "Brick colour",
};

/** What the pattern colour paints, for the inspector. */
export const ACCENT_LABEL: Record<Pattern, string> = {
  stripe: "Stripe colour",
  floral: "Flower colour",
  sprig: "Pattern colour",
  tiles: "Feature strip colour",
  brick: "Mortar colour",
};

export type InteriorFinish = { covering: "paint"; color: string } | { covering: Pattern; color: string; accent: string | null };

/** Base colour of a room's walls (paint, wallpaper ground, tile or brick). */
export function wallBase(room: Room): string {
  return room.wallPaint ?? DEFAULT_BASE[room.wallCovering ?? "paint"];
}

/** Pattern colour of a room's covering, or null for paint and plain tiles. */
export function wallAccent(room: Room): string | null {
  const c = room.wallCovering ?? "paint";
  return c === "paint" ? null : (room.wallAccent ?? DEFAULT_ACCENT[c]);
}

/**
 * The finish of an inside wall face. A wall with its own colour (a free-standing
 * wall) is painted that colour; otherwise the room's covering applies.
 */
export function interiorFinish(room: Room | undefined, wallColor: string | undefined): InteriorFinish {
  if (wallColor) return { covering: "paint", color: wallColor };
  if (!room) return { covering: "paint", color: WARM_WHITE };
  const covering = room.wallCovering ?? "paint";
  if (covering === "paint") return { covering, color: wallBase(room) };
  return { covering, color: wallBase(room), accent: wallAccent(room) };
}
