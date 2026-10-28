declare const __BUILD_DATE__: string;
declare const __BUILD_COMMIT__: string;

/** The house registry, generated at build time from the folders under src/houses/ (see vite.config.ts). */
declare module "virtual:houses" {
  import type { HouseEntry } from "./houses/types";
  export const HOUSES: Record<string, HouseEntry>;
  export const DEFAULT_HOUSE_ID: string;
}
