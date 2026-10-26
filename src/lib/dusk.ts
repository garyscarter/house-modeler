import type { Site } from "../types";

/**
 * The sun panel's "Dusk" preset: a clock time just after sunset-glow on the
 * chosen day, when the sun is low, dim and warm and the garden lights read.
 * No new state: the preset sets SunState { enabled: true, hour }.
 *
 * Implemented by Lorde (docs/garden-plan.md); Chunk 0 lands the signatures only.
 */

/** Sun altitude the preset aims for, degrees: just above the horizon, so it still lights the scene. */
export const DUSK_ALTITUDE = 1;

/** UK clock hour (BST aware) on day `doy` of `year` when the evening sun drops to DUSK_ALTITUDE at the site. */
export function duskHour(site: Pick<Site, "latitude" | "longitude">, year: number, doy: number): number {
  void site;
  void year;
  void doy;
  return 20;
}

/**
 * How strongly lights glow at a sun altitude (degrees): 0.15 in full day,
 * rising to 1 at the horizon and below. Multiplies the emissive intensity of bulbs.
 */
export function lightGlow(altitude: number | null): number {
  void altitude;
  return 1;
}
