import type { Room, WallCovering, WallFinish } from "../types";
import type { FaceQuad } from "./walls";

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
  panelling: WARM_WHITE,
  panellingFull: "#6f8071",
  batten: "#46556b",
  tongue: WARM_WHITE,
  metro: "#f3f2ee",
  metroSplash: "#f3f2ee",
  zellige: "#6f9a8c",
  limewash: "#dcd2c0",
  deco: "#e8e2d4",
  leaves: "#e6e9df",
  microcement: "#b9b4aa",
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
  panelling: "#8fa08a",
  panellingFull: null,
  batten: null,
  tongue: "#cfc6b4",
  metro: "#bdb9b0",
  metroSplash: "#bdb9b0",
  zellige: "#b8b0a2",
  limewash: null,
  deco: "#cdbf9d",
  leaves: "#9fb59c",
  microcement: null,
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
  panelling: "Wall colour above panelling",
  panellingFull: "Panelling colour",
  batten: "Board and batten colour",
  tongue: "Wall colour above boards",
  metro: "Tile colour",
  metroSplash: "Tile and wall colour",
  zellige: "Tile colour",
  limewash: "Limewash colour",
  deco: "Paper colour",
  leaves: "Paper colour",
  microcement: "Microcement colour",
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
  panelling: "Panelling colour",
  panellingFull: "Panelling colour",
  batten: "Batten colour",
  tongue: "Board colour",
  metro: "Grout colour",
  metroSplash: "Grout colour",
  zellige: "Grout colour",
  limewash: "Wash colour",
  deco: "Pattern colour",
  leaves: "Leaf colour",
  microcement: "Trowel colour",
};

/** Coverings whose second colour does nothing: they are one colour (full-height panelling, limewash, microcement). */
const NO_ACCENT: ReadonlySet<WallCovering> = new Set(["paint", "panellingFull", "batten", "limewash", "microcement"]);

/** Whether the covering has a pattern colour to pick (tiles have an optional one). */
export function hasAccent(c: WallCovering): boolean {
  return !NO_ACCENT.has(c);
}

export type InteriorFinish = { covering: "paint"; color: string } | { covering: Pattern; color: string; accent: string | null };

/** Base colour of a covering (paint, wallpaper ground, tile or brick). */
export function wallBase(look: WallLook): string {
  return look.wallPaint ?? DEFAULT_BASE[look.wallCovering ?? "paint"];
}

/** Pattern colour of a covering, or null for paint and plain tiles. */
export function wallAccent(look: WallLook): string | null {
  const c = look.wallCovering ?? "paint";
  return c === "paint" || !hasAccent(c) ? null : (look.wallAccent ?? DEFAULT_ACCENT[c]);
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

// ---------------------------------------------------------------------------
// Half-height and fitted coverings

/**
 * How a covering sits on the height of a wall. Most coverings simply repeat
 * over the whole face and have no entry here.
 */
export interface CoverLayout {
  /** Height (m) the covering reaches from the floor, or null for the whole wall. */
  band: number | null;
  /** The texture is one piece drawn for `nominal` metres and stretched to the band (or the ceiling), not repeated upwards. */
  fit: boolean;
  /** Height (m) the fitted texture is drawn for. */
  nominal: number;
  /** Banded coverings leave the wall above plain paint; false = the covering fills the wall. */
  paintAbove: boolean;
}

/** Height of the dado/panelling band, and of a kitchen or bathroom splashback. */
export const DADO_HEIGHT = 1.1;
const SPLASHBACK_HEIGHT = 1.2;
/** Ceiling height the full-height panelling is drawn for. */
export const FULL_HEIGHT_NOMINAL = 2.4;

export const COVER_LAYOUT: Partial<Record<Pattern, CoverLayout>> = {
  panelling: { band: DADO_HEIGHT, fit: true, nominal: DADO_HEIGHT, paintAbove: true },
  tongue: { band: DADO_HEIGHT, fit: true, nominal: DADO_HEIGHT, paintAbove: true },
  panellingFull: { band: null, fit: true, nominal: FULL_HEIGHT_NOMINAL, paintAbove: false },
  metroSplash: { band: SPLASHBACK_HEIGHT, fit: false, nominal: SPLASHBACK_HEIGHT, paintAbove: true },
};

export function coverLayout(c: WallCovering): CoverLayout | undefined {
  return c === "paint" ? undefined : COVER_LAYOUT[c];
}

/** A window sill this far (m) or less under the top of a band lowers the band to the sill. */
const SILL_SNAP = 0.2;

/**
 * Height the covering reaches on a wall: the band's top, or the ceiling for
 * full-height ones. A window whose sill lies just under the band's top
 * (a 0.95 m sill under a 1.1 m dado) pulls the band down to the sill, so
 * the panelling or tiles end at the sill instead of cutting a sliver off the
 * window's reveal. Sills lower than that, or above the band, change nothing.
 */
export function coverTop(layout: CoverLayout, ceiling: number, sills: readonly number[]): number {
  if (layout.band === null) return ceiling;
  let top = Math.min(layout.band, ceiling);
  for (const s of sills) if (s > 0.3 && s < top && top - s <= SILL_SNAP + 1e-9) top = Math.min(top, s);
  return top;
}

/** Texture height (m) of a point `y` metres above the floor, for a covering that spans the floor to `top`. */
export function coverV(layout: CoverLayout, y: number, top: number): number {
  return layout.fit ? (y * layout.nominal) / Math.max(top, 1e-6) : y;
}

/**
 * The finishes of a covering that stops part-way up the wall: what covers the
 * band and what is left above it (null when the covering fills the wall).
 * Panelling and boards are painted in the pattern colour with the wall's own
 * colour above; splashback tiles keep the tile colour on the wall above.
 */
export function splitFinish(f: InteriorFinish): { lower: InteriorFinish; upper: InteriorFinish | null } {
  if (f.covering === "paint" || !coverLayout(f.covering)?.paintAbove) return { lower: f, upper: null };
  const upper: InteriorFinish = { covering: "paint", color: f.color };
  if (f.covering === "panelling" || f.covering === "tongue") return { lower: { covering: f.covering, color: f.accent ?? f.color, accent: null }, upper };
  return { lower: f, upper };
}

const EPS = 1e-6;

/**
 * Cut a wall-face quad by the horizontal plane at `y` into the part below and
 * the part above (null where there is none). Quads lying flat (sills and
 * soffits) go whole to the side they are on; a face on the plane itself counts
 * as below, so a sill at the band's top is covered. Texture coordinates follow.
 */
export function splitQuadAtY(q: FaceQuad, y: number): [FaceQuad | null, FaceQuad | null] {
  const ys = q.v.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  if (hi <= y + EPS) return [q, null];
  if (lo >= y - EPS) return [null, q];
  type P = { p: FaceQuad["v"][number]; uv: [number, number] };
  const pts: P[] = q.v.map((p, i) => ({ p, uv: q.uv[i] }));
  const clip = (keep: (v: number) => boolean): P[] => {
    const out: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ka = keep(a.p[1]);
      if (ka) out.push(a);
      if (ka !== keep(b.p[1])) {
        const t = (y - a.p[1]) / (b.p[1] - a.p[1]);
        out.push({
          p: [a.p[0] + (b.p[0] - a.p[0]) * t, y, a.p[2] + (b.p[2] - a.p[2]) * t],
          uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
        });
      }
    }
    return out;
  };
  const make = (poly: P[]): FaceQuad | null =>
    poly.length === 4 ? { v: poly.map((x) => x.p) as FaceQuad["v"], n: q.n, uv: poly.map((x) => x.uv), slot: q.slot } : null;
  const below = make(clip((v) => v <= y));
  const above = make(clip((v) => v > y));
  // Not a rectangle cut across (should not happen for wall faces): keep it whole on the side of its middle.
  if (!below || !above) return (lo + hi) / 2 <= y ? [q, null] : [null, q];
  return [below, above];
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
