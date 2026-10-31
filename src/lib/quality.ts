import type { Chassis } from "./chassis";

/** What the owner picks: "auto" lets the screen decide. */
export type QualitySetting = "auto" | "high" | "balanced" | "low";
/** What the renderer works with. */
export type Quality = "high" | "balanced" | "low";

export const QUALITY_SETTINGS: readonly QualitySetting[] = ["auto", "high", "balanced", "low"];

/** "auto" is high on a desktop and balanced on a tablet or phone; the other settings are taken as they are. */
export function resolveQuality(setting: QualitySetting | undefined, chassis: Chassis): Quality {
  if (setting === "high" || setting === "balanced" || setting === "low") return setting;
  return chassis === "desktop" ? "high" : "balanced";
}

/** Device pixel ratio range (min, max) per resolved quality. */
export const DPR: Record<Quality, [number, number]> = {
  high: [1, 1.5],
  balanced: [1, 1.25],
  low: [1, 1],
};

/** The pixel ratio range for a quality, capped at `maxDpr` when one is given (the phone's wipe draws two views at 1). */
export function dprFor(quality: Quality, maxDpr?: number): [number, number] {
  const [lo, hi] = DPR[quality];
  return maxDpr === undefined ? [lo, hi] : [Math.min(lo, maxDpr), Math.min(hi, maxDpr)];
}

/** The settings to offer: a phone chooses between Auto and Low only. */
export function qualityChoices(chassis: Chassis): QualitySetting[] {
  return chassis === "phone" ? ["auto", "low"] : ["auto", "high", "balanced", "low"];
}
