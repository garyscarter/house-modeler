import type { HouseModel, Opening, Room, Site } from "../types";
import { DEFAULT_HOUSE_ID } from "../houses";
import { useHouse } from "./house";
import { dropAiSettings } from "./persist";
import { sitesFromShared, type Sites } from "./sites";

/** Version of the persisted state written by this build. */
export const PERSIST_VERSION = 7;

/** The persisted fields a migration touches; the rest pass through. */
export interface PersistedLike {
  variants?: Record<string, HouseModel>;
  /** Before version 5: the one plot both variants shared. */
  site?: Site;
  sites?: Sites;
  /** Before version 7: the project's photos (removed). */
  photos?: unknown;
  settings?: { quality?: string } & Record<string, unknown>;
  [k: string]: unknown;
}

/** The old fixed-size TV items and what they became; the 65s carry their size so they keep looking the same. */
const OLD_TVS: Record<string, { type: string; w?: number; h?: number; d?: number }> = {
  "tv-wall-55": { type: "tv-wall" },
  "tv-wall-65": { type: "tv-wall", w: 1.45, h: 0.83 },
  "tv-stand-55": { type: "tv-stand" },
  "tv-stand-65": { type: "tv-stand", w: 1.45, h: 0.88, d: 0.28 },
};

/** The default house, when it is the active one: the listing-only steps below are about its old saves. */
const defaultHouse = () => {
  const h = useHouse.getState().house;
  return h?.id === DEFAULT_HOUSE_ID ? h : undefined;
};
const isListing = (m?: HouseModel) => {
  const h = defaultHouse();
  return !!h && !!m?.preset && (m.preset.id === h.main || m.preset.id === h.proposed);
};

/**
 * Fix old shapes in one model (a saved project, an import or a server copy). Idempotent.
 * - A door with `style: "garage"` becomes `kind: "garage"` (`style` is now a valid DoorStyle, so only that case).
 * - The built-in listing with an exterior but no `roofStyle` becomes a hipped semi joined on the right.
 * - A room's `floorPhotoId` (photos as floor textures, removed) is dropped.
 * - The old TV presets (`tv-wall-55`, `tv-wall-65`, `tv-stand-55`, `tv-stand-65`) become the sized items `tv-wall` and
 *   `tv-stand`, a 65 keeping its size.
 */
export function migrateModel(m: HouseModel): HouseModel {
  let out = m;
  if (m.floors.some((f) => f.rooms.some((r) => "floorPhotoId" in r))) {
    out = {
      ...out,
      floors: out.floors.map((f) => ({
        ...f,
        rooms: f.rooms.map((r) => {
          if (!("floorPhotoId" in r)) return r;
          const { floorPhotoId: _gone, ...rest } = r as Room & { floorPhotoId?: string };
          return rest as Room;
        }),
      })),
    };
  }
  if (m.floors.some((f) => (f.fixtures ?? []).some((fx) => fx.type in OLD_TVS))) {
    out = {
      ...out,
      floors: out.floors.map((f) => ({
        ...f,
        fixtures: (f.fixtures ?? []).map((fx) => {
          const to = OLD_TVS[fx.type];
          return to ? { ...fx, type: to.type, w: fx.w ?? to.w, h: fx.h ?? to.h, ...(to.d !== undefined && fx.d === undefined ? { d: to.d } : {}) } : fx;
        }),
      })),
    };
  }
  if (m.floors.some((f) => f.openings.some((o) => (o as { style?: string }).style === "garage"))) {
    out = {
      ...out,
      floors: out.floors.map((f) => ({
        ...f,
        openings: f.openings.map((o) => {
          if ((o as { style?: string }).style !== "garage") return o;
          const { style: _style, ...rest } = o as Opening & { style?: string };
          return { ...rest, kind: "garage" } as Opening;
        }),
      })),
    };
  }
  const ext = out.exterior as Partial<NonNullable<HouseModel["exterior"]>> | undefined;
  if (isListing(out) && ext && ext.roofStyle === undefined) {
    out = { ...out, exterior: { ...(ext as NonNullable<HouseModel["exterior"]>), roofStyle: "hip", partyWall: "right" } };
  }
  return out;
}

/** The built-in plot used to name the attached neighbour's buildings by house number; they are now just "Attached neighbour". */
const OLD_NEIGHBOUR = /^No\. \d+ (\(attached\)|conservatory|side extension)$/;

/** Rename the attached neighbour's buildings in a plot, Idempotent. */
export function migrateSite(site: Site): Site {
  if (!site.neighbours.some((n) => OLD_NEIGHBOUR.test(n.name))) return site;
  const rename = (name: string) => {
    const m = OLD_NEIGHBOUR.exec(name);
    if (!m) return name;
    return m[1] === "(attached)" ? "Attached neighbour" : `Attached neighbour's ${m[1]}`;
  };
  return { ...site, neighbours: site.neighbours.map((n) => ({ ...n, name: rename(n.name) })) };
}

export function migrateSites(sites: Sites): Sites {
  const out: Sites = {};
  for (const [k, s] of Object.entries(sites) as [keyof Sites, Site | null | undefined][]) out[k] = s ? migrateSite(s) : s;
  return out;
}

/** Bring a saved state written at `version` up to PERSIST_VERSION. Mutates and returns it. */
export function migratePersisted(persisted: unknown, version: number): PersistedLike {
  const st = (persisted ?? {}) as PersistedLike;
  if (version < 2 || version < 3) {
    // Garage doors used to be door.style === "garage"; the built-in listing is a hipped semi joined to its neighbour on the right.
    const variants = st.variants ?? {};
    for (const k of Object.keys(variants)) variants[k] = migrateModel(variants[k]);
  }
  if (version < 3) {
    if (!st.site && (isListing(st.variants?.current) || isListing(st.variants?.proposed))) st.site = defaultHouse()!.sitePresets[defaultHouse()!.site].build();
    if (st.settings && !st.settings.quality) st.settings = { ...st.settings, quality: "high" };
  }
  if (version < 4) st.settings = dropAiSettings(st.settings) as PersistedLike["settings"];
  if (version < 5) {
    // Each variant gets its own copy of the plot they used to share.
    st.sites = sitesFromShared(st.site, st.variants);
    delete st.site;
  }
  if (version < 6) {
    if (st.sites) st.sites = migrateSites(st.sites);
  }
  if (version < 7) {
    // Photos were removed: drop the list and any room's photo floor. migrateModel does the rooms.
    delete st.photos;
    const variants = st.variants ?? {};
    for (const k of Object.keys(variants)) variants[k] = migrateModel(variants[k]);
  }
  return st;
}
