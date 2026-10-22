import { useStore } from "../store";
import type { VariantKey } from "../types";
import { LISTING_PRESET, listing91770873, listing91770873Proposed, listingSite, placeholderImage, PRESETS } from "./houses/listing91770873";
import { listingFloorplan } from "./houses/listingAssets";
import { freshSiteFor } from "./sitePreset";
import { mergeBoundaryTreatments, type BoundaryMerge } from "./siteMerge";

/**
 * Load the built-in listing into a variant, with its floorplan image and, if
 * that layout has no plot of its own yet, the listing's plot. Proposed starts
 * from a copy of As listed's plot when there is one, so edits to it carry over.
 */
export async function loadListing(variant: VariantKey): Promise<void> {
  const build = variant === "current" ? listing91770873 : listing91770873Proposed;
  // The listing's own floorplan sits behind the tracing; fall back to a placeholder offline.
  const image = await listingFloorplan().catch(() => placeholderImage());
  const st = useStore.getState();
  st.setVariant(variant, build(image));
  const sites = useStore.getState().sites;
  if (!sites[variant]) {
    const from = variant === "proposed" ? sites.current : undefined;
    st.setSite(from ? structuredClone(from) : listingSite(), variant);
  }
  st.setUi({ activeVariant: variant });
}

/** Replace a built-in variant with the registry's latest tracing (this discards edits; it is one undo step). */
export function updatePreset(variant: VariantKey): void {
  const st = useStore.getState();
  const model = st.variants[variant];
  if (!model?.preset || !PRESETS[model.preset.id]) return;
  // Never overwrite a Proposed design that is an old copy of As listed (it still carries As listed's tag).
  if (variant === "proposed" && model.preset.id === LISTING_PRESET.id) return;
  const preset = PRESETS[model.preset.id];
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
 * What bringing a layout's plot up to the latest built-in boundary treatments would do, without doing it.
 * Undefined when the layout has no plot of its own. See mergeBoundaryTreatments for the matching rules.
 */
export function planBoundaryUpdate(variant: VariantKey): BoundaryMerge | undefined {
  const site = useStore.getState().sites[variant];
  const latest = site && freshSiteFor(site);
  return site && latest ? mergeBoundaryTreatments(site, latest) : undefined;
}

/**
 * Put in the plot `planBoundaryUpdate` worked out (it already carries the latest preset marker, so the plot
 * stops being offered as out of date). One undo step; through the store, so project sync sees it like any edit.
 */
export function applyBoundaryUpdate(variant: VariantKey, merged: BoundaryMerge): void {
  useStore.getState().setSite(merged.site, variant);
}
