import type { HouseModel, Site, VariantKey } from "../types";
import { LISTING_PRESET, LISTING_PROPOSED_PRESET, LISTING_SITE_PRESET, SITE_PRESETS } from "./houses/listing91770873";
import { areaOf } from "./site";
import type { Sites } from "./sites";

export type SiteRegistry = Record<string, { version: number; build: () => Site }>;

/** Layout presets whose plot is the listing's. */
const LISTING_LAYOUTS = new Set([LISTING_PRESET.id, LISTING_PROPOSED_PRESET.id]);

const extent = (pts: { x: number; y: number }[]) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-9);

/**
 * True when a plot without a preset marker is, in all likelihood, a copy of the listing's plot saved by an
 * earlier release: same orientation and location, and a boundary of about the same size. A plot made from
 * scratch or by "Create a simple site" differs in size, bearing or location and fails.
 */
export function looksLikeListingSite(site: Site, reference: Site): boolean {
  if (site.boundary.length < 3 || reference.boundary.length < 3) return false;
  if (Math.abs(site.frontBearing - reference.frontBearing) > 0.01) return false;
  if (Math.abs(site.latitude - reference.latitude) > 1e-4 || Math.abs(site.longitude - reference.longitude) > 1e-4) return false;
  const a = extent(site.boundary);
  const b = extent(reference.boundary);
  return near(areaOf(site.boundary), areaOf(reference.boundary), 0.2) && near(a.w, b.w, 0.15) && near(a.d, b.d, 0.15);
}

/**
 * Is this saved plot an out-of-date copy of a built-in one?
 *
 * Yes when it carries a built-in plot's marker with an older version than the registry. A plot with no marker
 * counts only when its layout is a built-in listing layout (`model.preset`) and it looks like the listing's
 * plot (a save from before plots were versioned). Anything else, including every plot the user made, is theirs.
 */
export function isStaleSite(site: Site | null | undefined, model: Pick<HouseModel, "preset"> | undefined, registry: SiteRegistry = SITE_PRESETS): boolean {
  if (!site) return false;
  if (site.preset) {
    const latest = registry[site.preset.id]?.version;
    return latest !== undefined && latest > site.preset.version;
  }
  const entry = registry[LISTING_SITE_PRESET.id];
  if (!entry || !model?.preset || !LISTING_LAYOUTS.has(model.preset.id)) return false;
  return looksLikeListingSite(site, entry.build());
}

/** The built-in plot to put in place of a stale `site`: the one its marker names, else the listing's. */
export function freshSiteFor(site: Site, registry: SiteRegistry = SITE_PRESETS): Site | undefined {
  return (registry[site.preset?.id ?? LISTING_SITE_PRESET.id] ?? registry[LISTING_SITE_PRESET.id])?.build();
}

/** The plot update on offer at startup. */
export type SiteUpdate = {
  /** The newest version of the built-in plot involved; a remembered "not now" is for this number. */
  version: number;
  /** As listed's plot is stale. */
  current: boolean;
  /**
   * Proposed has a plot of its own that is stale. "with-current" when it is still an unchanged copy of
   * As listed's (so it goes with As listed's update); "own" when it differs, which needs its own explicit choice.
   */
  proposed?: "with-current" | "own";
};

/**
 * Work out which stale plots a browser holds. A Proposed layout borrowing As listed's plot (no plot of its
 * own) follows it automatically and is not listed. Returns null when nothing is stale.
 */
export function decideSiteUpdate(
  variants: Partial<Record<VariantKey, Pick<HouseModel, "preset">>>,
  sites: Sites,
  registry: SiteRegistry = SITE_PRESETS,
): SiteUpdate | null {
  const current = isStaleSite(sites.current, variants.current, registry);
  let proposed: SiteUpdate["proposed"];
  if (isStaleSite(sites.proposed, variants.proposed, registry)) {
    // Old releases gave each layout its own copy of the one plot; an unchanged copy holds no edits.
    proposed = current && JSON.stringify(sites.proposed) === JSON.stringify(sites.current) ? "with-current" : "own";
  }
  if (!current && !proposed) return null;
  const involved = [current ? sites.current : undefined, proposed ? sites.proposed : undefined];
  const version = Math.max(...involved.filter((s): s is Site => !!s).map((s) => registry[s.preset?.id ?? LISTING_SITE_PRESET.id]?.version ?? 0));
  return { version, current, proposed };
}
