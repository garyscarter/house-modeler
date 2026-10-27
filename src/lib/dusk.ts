import type { Site } from "../types";
import { solarPosition, sunTimes } from "./sun";

/**
 * The sun panel's "Dusk" preset: a clock time just after sunset-glow on the
 * chosen day, when the sun is low, dim and warm and the garden lights read.
 * No new state: the preset sets SunState { enabled: true, hour }.
 */

/** Sun altitude the preset aims for, degrees: just above the horizon, so it still lights the scene. */
export const DUSK_ALTITUDE = 1;

/**
 * UK clock hour (BST aware) on day `doy` of `year` when the evening sun drops to DUSK_ALTITUDE at the site:
 * bisection between solar noon and sunset (where the sun is already below it). Days the sun never sets or
 * never climbs that high fall back to sunset, or 20:00.
 */
export function duskHour(site: Pick<Site, "latitude" | "longitude">, year: number, doy: number): number {
  const { latitude: lat, longitude: lon } = site;
  const t = sunTimes(lat, lon, year, doy);
  const alt = (h: number) => solarPosition(lat, lon, year, doy, h).altitude;
  if (t.sunset === null) return 20;
  let lo = t.noon;
  let hi = t.sunset;
  if (alt(lo) <= DUSK_ALTITUDE) return t.sunset;
  if (alt(hi) > DUSK_ALTITUDE) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (alt(mid) > DUSK_ALTITUDE) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Altitudes (degrees) between which lights fade from their daytime glow up to full. */
const GLOW_FULL = 0;
const GLOW_DAY = 15;
/** Glow in full daylight (and with the sun study off). */
const GLOW_MIN = 0.15;

/**
 * How strongly lights glow at a sun altitude (degrees): 0.15 in full day,
 * rising to 1 at the horizon and below. Multiplies the emissive intensity of bulbs.
 * `null` (the sun study is off) reads as day.
 */
export function lightGlow(altitude: number | null): number {
  if (altitude === null) return GLOW_MIN;
  const t = Math.min(1, Math.max(0, (altitude - GLOW_FULL) / (GLOW_DAY - GLOW_FULL)));
  const s = t * t * (3 - 2 * t);
  return GLOW_MIN + (1 - GLOW_MIN) * (1 - s);
}

/** Sun altitude (degrees) the "Night" preset aims for: well below the horizon, past civil twilight, so the house reads by its own lights. */
export const NIGHT_PRESET_ALTITUDE = -8;
/** Latest clock hour the Night preset picks (a midsummer night that never gets that dark). */
const NIGHT_LATEST = 23.75;

/**
 * UK clock hour (BST aware) on day `doy` of `year` when the evening sun has dropped to NIGHT_PRESET_ALTITUDE at
 * the site: bisection between sunset and NIGHT_LATEST. If the sun never gets that low (or never sets), NIGHT_LATEST.
 */
export function nightHour(site: Pick<Site, "latitude" | "longitude">, year: number, doy: number): number {
  const { latitude: lat, longitude: lon } = site;
  const t = sunTimes(lat, lon, year, doy);
  const alt = (h: number) => solarPosition(lat, lon, year, doy, h).altitude;
  if (t.sunset === null || t.sunset >= NIGHT_LATEST) return NIGHT_LATEST;
  let lo = t.sunset;
  let hi = NIGHT_LATEST;
  if (alt(hi) > NIGHT_PRESET_ALTITUDE) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (alt(mid) > NIGHT_PRESET_ALTITUDE) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
