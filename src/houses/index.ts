import { DEFAULT_HOUSE_ID, HOUSES as VIRTUAL_HOUSES } from "virtual:houses";
import type { HouseEntry } from "./types";

export type { HouseDef, HouseEntry, LayoutPreset, SitePreset, WelcomeTile } from "./types";

/** Every house in this build, keyed by id (the folder name under src/houses/). */
export const HOUSES: Record<string, HouseEntry> = VIRTUAL_HOUSES;
export { DEFAULT_HOUSE_ID };

/** The houses in this build, the default first, then by name. */
export function houseList(): HouseEntry[] {
  return Object.values(HOUSES).sort((a, b) => (a.id === DEFAULT_HOUSE_ID ? -1 : b.id === DEFAULT_HOUSE_ID ? 1 : a.name.localeCompare(b.name)));
}
