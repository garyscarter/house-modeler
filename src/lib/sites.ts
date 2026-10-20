import type { HouseModel, Site, VariantKey } from "../types";

/**
 * Each layout's own plot.
 *
 * `sites[k]` is the plot for variant k. Proposed may have none of its own
 * (undefined): it then uses As listed's, and the first edit to it makes
 * Proposed its own copy (copy-on-write). `null` means the plot was cleared
 * on purpose, so Proposed shows no plot rather than As listed's.
 */
export type Sites = Partial<Record<VariantKey, Site | null>>;

/** The variant a layout without a plot of its own borrows from. */
const FALLBACK: Partial<Record<VariantKey, VariantKey>> = { proposed: "current" };

/** The plot variant `k` shows: its own, else (for Proposed) As listed's. */
export function siteOf(sites: Sites | undefined, k: VariantKey): Site | undefined {
  const own = sites?.[k];
  if (own !== undefined) return own ?? undefined;
  const from = FALLBACK[k];
  return from ? (sites?.[from] ?? undefined) : undefined;
}

/** True when `k` has a plot of its own (or was cleared on purpose), rather than borrowing one. */
export const hasOwnSite = (sites: Sites | undefined, k: VariantKey) => sites?.[k] !== undefined;

/** Which variant's plot `k` is showing: itself, the one it borrows from, or none. */
export function siteSource(sites: Sites | undefined, k: VariantKey): VariantKey | undefined {
  if (hasOwnSite(sites, k)) return sites?.[k] ? k : undefined;
  const from = FALLBACK[k];
  return from && sites?.[from] ? from : undefined;
}

/** Replace variant k's plot. Clearing Proposed's leaves it with none rather than As listed's. */
export function setSiteOf(sites: Sites, k: VariantKey, site: Site | undefined): Sites {
  const next = { ...sites };
  if (site) next[k] = site;
  else if (FALLBACK[k] && sites[FALLBACK[k]!]) next[k] = null;
  else delete next[k];
  return next;
}

/**
 * Edit variant k's plot. A layout still borrowing another's gets its own
 * copy first, so the other keeps its plot. Returns `sites` unchanged when
 * there is no plot to edit.
 */
export function updateSiteOf(sites: Sites, k: VariantKey, patch: Partial<Site> | ((s: Site) => Site)): Sites {
  const base = siteOf(sites, k);
  if (!base) return sites;
  const own = hasOwnSite(sites, k) ? base : structuredClone(base);
  const next = typeof patch === "function" ? patch(own) : { ...own, ...patch };
  return { ...sites, [k]: next };
}

/** Copy one variant's plot onto another (Copy As listed to start, Reset to a copy of As listed). */
export function copySiteOf(sites: Sites, from: VariantKey, to: VariantKey): Sites {
  const s = siteOf(sites, from);
  const next = { ...sites };
  if (s) next[to] = structuredClone(s);
  else delete next[to];
  return next;
}

/**
 * Sites from the old shape, where one plot was shared by both layouts: a copy
 * for every layout that exists (As listed's if there are none, so the plot is
 * not lost). Used by the persisted-state migration and to import old JSON.
 */
export function sitesFromShared(site: Site | undefined | null, variants: Partial<Record<VariantKey, HouseModel | undefined>> | undefined): Sites {
  if (!site) return {};
  const keys = (["current", "proposed"] as VariantKey[]).filter((k) => variants?.[k]);
  const out: Sites = {};
  for (const k of keys.length ? keys : (["current"] as VariantKey[])) out[k] = structuredClone(site);
  return out;
}

const looksLikeSite = (s: unknown): s is Site => !!s && typeof s === "object" && Array.isArray((s as Site).boundary) && Array.isArray((s as Site).surfaces);

/**
 * The plots in an exported project: `sites` (one per layout) from current
 * exports, or the single shared `site` of older ones, given to every layout.
 */
export function sitesFromImport(data: { sites?: unknown; site?: unknown; variants?: Partial<Record<VariantKey, HouseModel | undefined>> }): Sites {
  if (data.sites && typeof data.sites === "object") {
    const out: Sites = {};
    for (const k of ["current", "proposed"] as VariantKey[]) {
      const s = (data.sites as Record<string, unknown>)[k];
      if (s === null) out[k] = null;
      else if (looksLikeSite(s)) out[k] = s;
    }
    return out;
  }
  return sitesFromShared(looksLikeSite(data.site) ? data.site : undefined, data.variants);
}
