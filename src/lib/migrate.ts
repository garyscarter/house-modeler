import type { HouseModel, Opening, Photo, Site } from "../types";
import { listingSite, LISTING_PRESET, LISTING_PROPOSED_PRESET } from "./houses/listing91770873";
import { dropAiSettings } from "./persist";
import { sitesFromShared, type Sites } from "./sites";

/** Version of the persisted state written by this build. */
export const PERSIST_VERSION = 6;

/** The persisted fields a migration touches; the rest pass through. */
export interface PersistedLike {
  variants?: Record<string, HouseModel>;
  /** Before version 5: the one plot both variants shared. */
  site?: Site;
  sites?: Sites;
  photos?: Photo[];
  settings?: { quality?: string } & Record<string, unknown>;
  [k: string]: unknown;
}

const isListing = (m?: HouseModel) => m?.preset?.id === LISTING_PRESET.id || m?.preset?.id === LISTING_PROPOSED_PRESET.id;

/**
 * Fix old shapes in one model (a saved project, an import or a server copy). Idempotent.
 * - A door with `style: "garage"` becomes `kind: "garage"` (`style` is now a valid DoorStyle, so only that case).
 * - The built-in listing with an exterior but no `roofStyle` becomes a hipped semi joined on the right.
 */
export function migrateModel(m: HouseModel): HouseModel {
  let out = m;
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
const OLD_REAR_PHOTO = /^Rear towards No\. \d+ and its conservatory\.$/;

/** Rename the attached neighbour's buildings in a plot, and the listing photo that named it. Idempotent. */
export function migrateSite(site: Site): Site {
  if (!site.neighbours.some((n) => OLD_NEIGHBOUR.test(n.name))) return site;
  const rename = (name: string) => {
    const m = OLD_NEIGHBOUR.exec(name);
    if (!m) return name;
    return m[1] === "(attached)" ? "Attached neighbour" : `Attached neighbour's ${m[1]}`;
  };
  return { ...site, neighbours: site.neighbours.map((n) => ({ ...n, name: rename(n.name) })) };
}

export function migratePhotos(photos: Photo[]): Photo[] {
  return photos.map((p) => (p.description && OLD_REAR_PHOTO.test(p.description) ? { ...p, description: "Rear towards the attached neighbour and its conservatory." } : p));
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
    if (!st.site && (isListing(st.variants?.current) || isListing(st.variants?.proposed))) st.site = listingSite();
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
    if (Array.isArray(st.photos)) st.photos = migratePhotos(st.photos);
  }
  return st;
}
