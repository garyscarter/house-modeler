import type { Room, WallCovering, WallFinish } from "../types";

/** Default colour of interior paint (warm white). */
export const WARM_WHITE = "#f4f1ea";

export type Pattern = Exclude<WallCovering, "paint">;

/** The fields that describe a wall covering, on a room or resolved for one of its walls. */
export type WallLook = Pick<Room, "wallCovering" | "wallPaint" | "wallAccent">;

/** Colour of the covering itself when the room sets none: brick is exposed, so it starts brick-coloured. */
const DEFAULT_BASE: Record<WallCovering, string> = {
  paint: WARM_WHITE,
  stripe: WARM_WHITE,
  floral: WARM_WHITE,
  rose: WARM_WHITE,
  trail: WARM_WHITE,
  sprig: WARM_WHITE,
  tiles: WARM_WHITE,
  squares: "#efe0bd",
  brick: "#b5714f",
};

/** Pattern colour when the room sets none. Tiles have no feature strip unless one is chosen. */
const DEFAULT_ACCENT: Record<Pattern, string | null> = {
  stripe: "#d2c9bb",
  floral: "#c8364a",
  rose: "#b9a446",
  trail: "#c4473a",
  sprig: "#6f8fc4",
  tiles: null,
  squares: "#9a6236",
  brick: "#c9c3b6",
};

/** What the base colour paints, for the inspector. */
export const BASE_LABEL: Record<WallCovering, string> = {
  paint: "Wall paint",
  stripe: "Paper colour",
  floral: "Paper colour",
  rose: "Paper colour",
  trail: "Paper colour",
  sprig: "Paper colour",
  tiles: "Tile colour",
  squares: "Tile colour",
  brick: "Brick colour",
};

/** What the pattern colour paints, for the inspector. */
export const ACCENT_LABEL: Record<Pattern, string> = {
  stripe: "Stripe colour",
  floral: "Flower colour",
  rose: "Flower colour",
  trail: "Bud colour",
  sprig: "Pattern colour",
  tiles: "Feature strip colour",
  squares: "Edge colour",
  brick: "Mortar colour",
};

export type InteriorFinish = { covering: "paint"; color: string } | { covering: Pattern; color: string; accent: string | null };

/** Base colour of a covering (paint, wallpaper ground, tile or brick). */
export function wallBase(look: WallLook): string {
  return look.wallPaint ?? DEFAULT_BASE[look.wallCovering ?? "paint"];
}

/** Pattern colour of a covering, or null for paint and plain tiles. */
export function wallAccent(look: WallLook): string | null {
  const c = look.wallCovering ?? "paint";
  return c === "paint" ? null : (look.wallAccent ?? DEFAULT_ACCENT[c]);
}

/**
 * The covering of one of a room's walls (polygon edge `edge`): the room's
 * own with that wall's override on top. An override that changes the
 * covering starts from the new covering's default colours rather than the
 * room's, so brick on a papered room comes out brick-coloured.
 */
export function wallLook(room: Room, edge?: number): WallLook {
  // Overrides left on edges the room no longer has (a corner was removed outside the editor) are ignored.
  const o = edge === undefined || edge >= room.polygon.length ? undefined : room.wallFinishes?.[edge];
  if (!o) return room;
  const own = o.covering !== undefined && o.covering !== (room.wallCovering ?? "paint");
  return {
    wallCovering: o.covering ?? room.wallCovering,
    wallPaint: o.paint ?? (own ? undefined : room.wallPaint),
    wallAccent: o.accent ?? (own ? undefined : room.wallAccent),
  };
}

/**
 * The finish of an inside wall face. A wall with its own colour (a free-standing
 * wall) is painted that colour; otherwise the room's covering applies, or the
 * override of the room edge the face lies along.
 */
export function interiorFinish(room: Room | undefined, wallColor: string | undefined, edge?: number): InteriorFinish {
  if (wallColor) return { covering: "paint", color: wallColor };
  if (!room) return { covering: "paint", color: WARM_WHITE };
  const look = wallLook(room, edge);
  const covering = look.wallCovering ?? "paint";
  if (covering === "paint") return { covering, color: wallBase(look) };
  return { covering, color: wallBase(look), accent: wallAccent(look) };
}

/** What an outside wall face is made of: a finish and its colour. */
export interface OutsideLook {
  finish: WallFinish;
  color: string;
}

/**
 * The outside finish of one of a room's walls (polygon edge `edge`): the
 * room's own (else the house's) with that wall's override on top. An override
 * that changes the finish starts from the house colour rather than the room's,
 * so a render panel in a brick room is not painted brick-red.
 */
export function outsideLook(room: Room | undefined, edge: number | undefined, house: OutsideLook): OutsideLook {
  const finish = room?.exteriorFinish ?? house.finish;
  const o = !room || edge === undefined || edge >= room.polygon.length ? undefined : room.wallFinishes?.[edge]?.outside;
  const own = o?.finish !== undefined && o.finish !== finish;
  return {
    finish: o?.finish ?? finish,
    color: o?.color ?? (own ? house.color : (room?.exteriorColor ?? house.color)),
  };
}
