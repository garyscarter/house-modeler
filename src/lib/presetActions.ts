import { transact, useStore } from "../store";
import type { HouseModel, Site, VariantKey } from "../types";
import { currentHouse } from "./house";
import { freshSiteFor } from "./sitePreset";
import { gardenUpdates, mergeKeepingEdits, neighbourUpdates, type BoundaryMerge, type PlotChange } from "./siteMerge";
import { applyChanges, isBasedOnListing, listingUpdates, type LayoutChange } from "./layoutMerge";

/**
 * Load the active house's built-in layout into a variant (its main layout for As listed, its Proposed one, or
 * `preset` when given), with its floorplan image and, if that layout has no plot of its own yet, the house's plot.
 * Proposed starts from a copy of As listed's plot when there is one, so edits to it carry over.
 */
export async function loadBuiltIn(variant: VariantKey, preset?: string): Promise<void> {
  const house = currentHouse();
  const id = preset ?? (variant === "current" ? house.main : (house.proposed ?? house.main));
  const build = house.presets[id].build;
  // The house's own floorplan sits behind the tracing; fall back to a placeholder offline.
  const image = await house.floorplan().catch(() => house.placeholderImage());
  const st = useStore.getState();
  transact(() => {
    st.setVariant(variant, build(image));
    const sites = useStore.getState().sites;
    if (!sites[variant]) {
      const from = variant === "proposed" ? sites.current : undefined;
      st.setSite(from ? structuredClone(from) : house.sitePresets[house.site].build(), variant);
    }
    st.setUi({ activeVariant: variant });
  });
}

/** Replace a built-in variant with the registry's latest tracing (this discards edits; it is one undo step). */
export function updatePreset(variant: VariantKey): void {
  const st = useStore.getState();
  const model = st.variants[variant];
  const house = currentHouse();
  if (!model?.preset || !house.presets[model.preset.id]) return;
  // Never overwrite a Proposed design that is an old copy of As listed (it still carries As listed's tag).
  if (variant === "proposed" && model.preset.id === house.main) return;
  const preset = house.presets[model.preset.id];
  const placeholderImage = house.placeholderImage;
  const fresh = preset.build(model.floors[0]?.image ?? placeholderImage());
  // Keep the user's floorplan image if they set one at the same pixel size.
  const keepImage = model.floors[0] && model.floors[0].imageW === fresh.floors[0].imageW;
  st.setVariant(variant, keepImage ? fresh : preset.build(placeholderImage()));
}

/**
 * Replace a layout's own plot with the latest built-in one (this discards edits to it; it is one undo step).
 * A layout with no plot of its own, or none at all, is left alone.
 */
export function updateSitePreset(variant: VariantKey): void {
  const st = useStore.getState();
  const site = st.sites[variant];
  const fresh = site && freshSiteFor(site);
  if (fresh) st.setSite(fresh, variant);
}

/**
 * What bringing a layout's plot up to the latest built-in boundary treatments and neighbouring buildings, keeping
 * the owner's edits, would do, without doing it. Undefined when the layout has no plot of its own. See
 * mergeKeepingEdits for what is brought in.
 */
export function planBoundaryUpdate(variant: VariantKey): BoundaryMerge | undefined {
  const site = useStore.getState().sites[variant];
  const latest = site && freshSiteFor(site);
  return site && latest ? mergeKeepingEdits(site, latest) : undefined;
}

/**
 * Put in the plot `planBoundaryUpdate` worked out (it already carries the latest preset marker, so the plot
 * stops being offered as out of date). One undo step; through the store, so project sync sees it like any edit.
 */
export function applyBoundaryUpdate(variant: VariantKey, merged: BoundaryMerge): void {
  useStore.getState().setSite(merged.site, variant);
}

let latestCache: { house: string; version: number; model: HouseModel; site?: Site } | undefined;
/** The latest built-in As listed house and plot, built once per house and version (their uids are random, so the same build keeps change ids stable). */
export function latestListing(): { version: number; model: HouseModel; site?: Site } {
  const house = currentHouse();
  const version = house.presets[house.main].version;
  if (latestCache?.house !== house.id || latestCache.version !== version) {
    latestCache = { house: house.id, version, model: house.presets[house.main].build(""), site: house.sitePresets[house.site]?.build() };
  }
  return latestCache;
}

/** Everything the "Bring in updates from <house>" dialog offers for a design, worked out but not applied. */
export interface ListingReview {
  variant: VariantKey;
  /** The design as it was when the review was worked out. */
  model: HouseModel;
  version: number;
  changes: LayoutChange[];
  /** The plot whose neighbouring buildings are offered: the layout's own, or As listed's when it borrows that. */
  plot?: { variant: VariantKey; site: Site; changes: PlotChange[] };
}

/** Is this layout an owner's design based on the built-in house (so it can take its updates)? */
export const isListingDesign = (model: HouseModel | undefined): boolean =>
  !!model && model.preset?.id !== currentHouse().proposed && isBasedOnListing(model, currentHouse().main, latestListing().model);

/**
 * Work out what the latest built-in house offers the design in `variant` (Proposed by default), or undefined
 * when that layout isn't a design based on the built-in house.
 */
export function planListingReview(variant: VariantKey = "proposed"): ListingReview | undefined {
  const st = useStore.getState();
  const model = st.variants[variant];
  if (!model || (variant === "current" && model.preset) || !isListingDesign(model)) return undefined;
  const latest = latestListing();
  const plotVariant: VariantKey | undefined = st.sites[variant] ? variant : st.sites.current ? "current" : undefined;
  const site = plotVariant && st.sites[plotVariant];
  return {
    variant,
    model,
    version: latest.version,
    changes: listingUpdates(model, latest.model),
    ...(plotVariant && site && latest.site ? { plot: { variant: plotVariant, site, changes: [...neighbourUpdates(site, latest.site), ...gardenUpdates(site, latest.site)] } } : {}),
  };
}

/**
 * Put in the ticked changes of a review and record the built-in version the design has now been reviewed
 * against (`basedOn`), so the startup prompt stops offering it; it stays the owner's own design, never a
 * built-in. The layout and its plot change through the store together: one undo step, and project sync and
 * the checks see an ordinary edit.
 */
export function applyListingReview(review: ListingReview, selected: Iterable<string>): void {
  const ids = [...selected];
  const st = useStore.getState();
  const model = applyChanges(review.model, review.changes, ids);
  model.basedOn = { id: currentHouse().main, version: review.version };
  transact(() => {
    st.setVariant(review.variant, model);
    if (review.plot) {
      const chosen = review.plot.changes.filter((c) => ids.includes(c.id));
      if (chosen.length) st.setSite(applyChanges(review.plot.site, review.plot.changes, ids), review.plot.variant);
    }
  });
}
