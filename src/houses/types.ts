import type { HouseModel, Photo, Site, VariantKey } from "../types";

/** A built-in layout: bump `version` whenever `build` changes, so browsers holding an older copy are offered the update. */
export interface LayoutPreset {
  version: number;
  build: (image: string) => HouseModel;
}
/** A built-in plot, versioned the same way. */
export interface SitePreset {
  version: number;
  build: () => Site;
}
/** A picture tile on the Welcome card: loads `preset` into `variant` (Proposed also loads the main layout as As listed). */
export interface WelcomeTile {
  preset: string;
  variant: VariantKey;
  title: string;
  caption: (areaM2: number) => string;
}

/** Everything the app needs to know about one house in `src/houses/<id>/`. */
export interface HouseDef {
  id: string;
  name: string;
  presets: Record<string, LayoutPreset>;
  sitePresets: Record<string, SitePreset>;
  /** The As listed preset id. */
  main: string;
  /** The built-in Proposed preset id, if any. */
  proposed?: string;
  /** The main site preset id. */
  site: string;
  tiles: WelcomeTile[];
  /** The floorplan image as a data URL. */
  floorplan: () => Promise<string>;
  photos?: (onProgress?: (done: number, total: number) => void) => Promise<Photo[]>;
  /** A photo name that shows the built-in photos are loaded ("front-1"). */
  photoMarker?: string;
  placeholderImage: () => string;
}

/** A house the registry lists, before it is loaded. */
export interface HouseEntry {
  id: string;
  name: string;
  load: () => Promise<{ default: HouseDef }>;
}
