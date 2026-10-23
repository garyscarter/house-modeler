import type { HouseModel, Opening, Site } from "../types";
import { listingSite, LISTING_PRESET, LISTING_PROPOSED_PRESET } from "./houses/listing91770873";
import { dropAiSettings } from "./persist";
import { sitesFromShared, type Sites } from "./sites";

/** Version of the persisted state written by this build. */
export const PERSIST_VERSION = 5;

/** The persisted fields a migration touches; the rest pass through. */
export interface PersistedLike {
  variants?: Record<string, HouseModel>;
  /** Before version 5: the one plot both variants shared. */
  site?: Site;
  sites?: Sites;
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

/** Bring a saved state written at `version` up to PERSIST_VERSION. Mutates and returns it. */
export function migratePersisted(persisted: unknown, version: number): PersistedLike {
  const st = (persisted ?? {}) as PersistedLike;
  if (version < 2 || version < 3) {
    // Garage doors used to be door.style === "garage"; the built-in listing is a hipped semi joined to No. 26 on the right.
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
  return st;
}
