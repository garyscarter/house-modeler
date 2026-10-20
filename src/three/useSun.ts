import { useMemo } from "react";
import { useStore } from "../store";
import { useViewedSite } from "./viewedVariant";
import { solarPosition, sunTimes, sunVector, type SunPosition, type SunTimes } from "../lib/sun";

/** The sun study uses this year's calendar (it only shifts the BST dates). */
export const SUN_YEAR = new Date().getFullYear();

export interface SunInfo {
  /** The sun study is switched on (a site exists, or there would be no SunInfo). */
  active: boolean;
  position: SunPosition;
  times: SunTimes;
  /** Unit vector from the scene towards the sun, world [x, y, z]. */
  vector: [number, number, number];
  frontBearing: number;
}

/** Sun position for the viewed layout's site and the sun study's date and time, or null without a site. */
export function useSunInfo(): SunInfo | null {
  const site = useViewedSite();
  const lat = site?.latitude;
  const lon = site?.longitude;
  const front = site?.frontBearing;
  const { enabled, dayOfYear, hour } = useStore((s) => s.sun);
  return useMemo(() => {
    if (lat === undefined || lon === undefined || front === undefined) return null;
    const position = solarPosition(lat, lon, SUN_YEAR, dayOfYear, hour);
    return {
      active: enabled,
      position,
      times: sunTimes(lat, lon, SUN_YEAR, dayOfYear),
      vector: sunVector(front, position),
      frontBearing: front,
    };
  }, [lat, lon, front, enabled, dayOfYear, hour]);
}
