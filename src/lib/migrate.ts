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

/** Bring a saved state written at `version` up to PERSIST_VERSION. Mutates and returns it. */
export function migratePersisted(persisted: unknown, version: number): PersistedLike {
  const st = (persisted ?? {}) as PersistedLike;
  if (version < 2) {
    // v1 stored garage doors as door.style === "garage".
    for (const m of Object.values(st.variants ?? {})) {
      for (const f of m.floors) {
        for (const o of f.openings as unknown as { kind: Opening["kind"]; style?: string }[]) {
          if (o.style === "garage") o.kind = "garage";
          delete o.style;
        }
      }
    }
  }
  if (version < 3) {
    // The built-in listing is a hipped semi joined to No. 26 on the right.
    for (const m of Object.values(st.variants ?? {})) {
      const ext = m.exterior as Partial<NonNullable<HouseModel["exterior"]>> | undefined;
      if (isListing(m) && ext && ext.roofStyle === undefined) {
        m.exterior = { ...(ext as NonNullable<HouseModel["exterior"]>), roofStyle: "hip", partyWall: "right" };
      }
    }
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
