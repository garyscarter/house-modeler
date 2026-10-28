import { create } from "zustand";
import { DEFAULT_HOUSE_ID, HOUSES } from "../houses";
import type { HouseDef, HouseEntry } from "../houses/types";

/** The localStorage key that remembers which house this browser last opened. */
export const HOUSE_KEY = "storey-house";
/** The meta tag the server injects into index.html to pin the house its passcode opened. */
export const HOUSE_META = "storey-house";

/** What decides the active house, as plain inputs so the rule is testable. */
export interface HouseInputs {
  /** The `storey-house` meta tag's content, if the page has one. */
  meta?: string | null;
  /** The remembered choice from localStorage. */
  stored?: string | null;
  /** The ids in this build. */
  ids: string[];
}

/**
 * The house to open: the server's meta tag wins, then the remembered choice, then the only house when the build has
 * one. Null means the picker must ask. A remembered id not in this build is ignored; a meta id not in this build
 * gives null too (see `unknownMetaHouse`: the app must not open another house in its place).
 */
export function pickHouse({ meta, stored, ids }: HouseInputs): string | null {
  if (meta) return ids.includes(meta) ? meta : null;
  if (stored && ids.includes(stored)) return stored;
  if (ids.length === 1) return ids[0];
  return null;
}

function metaHouse(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLMetaElement>(`meta[name="${HOUSE_META}"]`)?.content || null;
}

/** The id the page's meta tag pins when this build does not hold it, else null. */
export function unknownMetaHouse(): string | null {
  const m = metaHouse();
  return m && !(m in HOUSES) ? m : null;
}

function storedHouse(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(HOUSE_KEY);
  } catch {
    return null;
  }
}

let forced: string | null = null;

/** The active house, decided synchronously at startup (see `pickHouse`). */
export function activeHouseId(): string | null {
  if (forced) return forced;
  return pickHouse({ meta: metaHouse(), stored: storedHouse(), ids: Object.keys(HOUSES) });
}

/** True when the server pinned the house (its passcode opens one house), so switching is hidden. */
export function isHouseFixed(): boolean {
  const m = metaHouse();
  return !!m && m in HOUSES;
}

/** Remember the choice and reload, so every module starts again on the new house. */
export function chooseHouse(id: string): void {
  try {
    localStorage.setItem(HOUSE_KEY, id);
  } catch {
    /* private mode: the reload falls back to the picker */
  }
  location.reload();
}

/** The suffix for storage keys: "" for the default house (existing saves keep working), "/<id>" for any other. */
export function storageSuffix(id: string | null | undefined): string {
  return !id || id === DEFAULT_HOUSE_ID ? "" : `/${id}`;
}

/** The loaded house, for components. */
export const useHouse = create<{ house: HouseDef | null }>(() => ({ house: null }));

const loading = new Map<string, Promise<HouseDef>>();

/** Load a house's module (memoised) and make it the current one. */
export function loadHouse(id: string): Promise<HouseDef> {
  let p = loading.get(id);
  if (!p) {
    const entry: HouseEntry | undefined = HOUSES[id];
    if (!entry) return Promise.reject(new Error(`No house "${id}" in this build`));
    p = entry.load().then((m) => m.default);
    loading.set(id, p);
  }
  return p.then((house) => {
    forced = id;
    useHouse.setState({ house });
    return house;
  });
}

/** The current house. Throws before `loadHouse` has finished. */
export function currentHouse(): HouseDef {
  const h = useHouse.getState().house;
  if (!h) throw new Error("No house loaded yet");
  return h;
}

/** The active house's name for messages, or "the built-in house" before one is loaded. */
export function activeHouseName(): string {
  return useHouse.getState().house?.name ?? "the built-in house";
}

/** A storage key for the active house: `base` itself for the default house, `base/<id>` for any other. */
export function houseKey(base: string): string {
  return base + storageSuffix(activeHouseId());
}

/** The current house in a component (the app renders only once a house is loaded). */
export function useCurrentHouse(): HouseDef {
  const house = useHouse((s) => s.house);
  if (!house) throw new Error("No house loaded yet");
  return house;
}

/** Is this preset id one of the house's built-ins (or derived from its id)? */
export function belongsToHouse(house: HouseDef, id: string | undefined): boolean {
  return !!id && (id in house.presets || id in house.sitePresets || id.startsWith(house.id));
}
