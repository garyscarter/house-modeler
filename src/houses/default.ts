/**
 * The default house's tracing under neutral names, for tests that need a real house to measure against (the
 * app itself reads the active house through `currentHouse()` in src/lib/house.ts). Nothing outside src/houses/
 * names the house directly.
 */
import meta from "./listing-91770873/meta.json";
export {
  listing91770873 as builtInHouse,
  listing91770873Proposed as builtInProposed,
  listingSite,
  LISTING_PRESET,
  LISTING_PROPOSED_PRESET,
  LISTING_SITE_PRESET,
  PRESETS,
  SITE_PRESETS,
  placeholderImage,
} from "./listing-91770873/house";

/** The default house's display name. */
export const BUILT_IN_NAME: string = meta.name;
