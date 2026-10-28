/**
 * The default house's tracing under neutral names, for tests that need a real house to measure against (the app
 * itself reads the active house through `currentHouse()` in src/lib/house.ts). Only tests import this.
 */
import { DEFAULT_HOUSE_ID } from "virtual:houses";
import type { HouseDef } from "./types";

const defs = import.meta.glob<{ default: HouseDef }>("./*/index.ts", { eager: true });
const house = defs[`./${DEFAULT_HOUSE_ID}/index.ts`].default;
const proposedId = house.proposed ?? house.main;

/** The default house's display name. */
export const BUILT_IN_NAME: string = house.name;
export const PRESETS = house.presets;
export const SITE_PRESETS = house.sitePresets;
/** The As listed preset, its Proposed one and its plot, as `{ id, version }` markers. */
export const LISTING_PRESET = { id: house.main, version: PRESETS[house.main].version };
export const LISTING_PROPOSED_PRESET = { id: proposedId, version: PRESETS[proposedId].version };
export const LISTING_SITE_PRESET = { id: house.site, version: SITE_PRESETS[house.site].version };

export const builtInHouse = (image: string) => PRESETS[LISTING_PRESET.id].build(image);
export const builtInProposed = (image: string) => PRESETS[LISTING_PROPOSED_PRESET.id].build(image);
export const listingSite = () => SITE_PRESETS[LISTING_SITE_PRESET.id].build();
export const placeholderImage = () => house.placeholderImage();
