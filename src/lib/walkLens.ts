import type { WalkLensChoice } from "./walkTypes";

/**
 * Walk-through lens: one rule for every screen. The picture spans a fixed 99 degrees corner to corner, so a wide
 * screen sees wide and a phone held upright sees tall, with a floor on each field and a ceiling on the horizontal.
 * The floor across keeps a phone held upright from looking zoomed in (owner: about 58 degrees, not 52).
 */
export const LENS_DIAG = 99; // degrees, every device
export const LENS_H_MIN = 58; // degrees: floor on the horizontal field (a phone held upright)
export const LENS_V_MIN = 46; // degrees: floor on the vertical field
export const LENS_H_MAX = 100; // degrees: ceiling on the horizontal field before the zoom
export const LENS_CAP = 104; // degrees: hard cap on either axis after the zoom
export const LENS_ZOOM: Record<WalkLensChoice, number> = { narrow: 0.77, normal: 1, wide: 1.19 };

export interface Lens {
  hfov: number;
  vfov: number;
  diag: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** The lens for a canvas of w x h CSS px, in degrees. */
export function walkLens(w: number, h: number, choice: WalkLensChoice = "normal"): Lens {
  const a = Math.max(0.05, w / Math.max(1, h));
  const t = Math.tan((LENS_DIAG * RAD) / 2);
  const s = Math.sqrt(1 + a * a);
  let tanH = (t * a) / s;
  let tanV = t / s;
  if (2 * Math.atan(tanH) * DEG < LENS_H_MIN) {
    tanH = Math.tan((LENS_H_MIN * RAD) / 2);
    tanV = tanH / a;
  }
  if (2 * Math.atan(tanV) * DEG < LENS_V_MIN) {
    tanV = Math.tan((LENS_V_MIN * RAD) / 2);
    tanH = tanV * a;
  }
  if (2 * Math.atan(tanH) * DEG > LENS_H_MAX) {
    tanH = Math.tan((LENS_H_MAX * RAD) / 2);
    tanV = tanH / a;
  }
  const k = LENS_ZOOM[choice];
  tanH *= k;
  tanV *= k;
  const cap = Math.tan((LENS_CAP * RAD) / 2);
  if (tanV > cap) {
    tanV = cap;
    tanH = tanV * a;
  }
  if (tanH > cap) {
    tanH = cap;
    tanV = tanH / a;
  }
  return { hfov: 2 * Math.atan(tanH) * DEG, vfov: 2 * Math.atan(tanV) * DEG, diag: 2 * Math.atan(Math.hypot(tanH, tanV)) * DEG };
}

/** How big the view is, which sets how fast the look-round may turn it. */
export type LensClass = "small" | "medium" | "large";
/** small if min(w, h) < 500, else medium for a coarse primary pointer, else large. */
export function lensClass(w: number, h: number, coarse: boolean): LensClass {
  if (Math.min(w, h) < 500) return "small";
  return coarse ? "medium" : "large";
}
/** Peak automatic yaw rate, degrees per second: large 75, medium 85, small 90, small with aspect < 1 (a phone held upright) 55. */
export function yawCapDeg(cls: LensClass, aspect: number): number {
  if (cls === "large") return 75;
  if (cls === "medium") return 85;
  return aspect < 1 ? 55 : 90;
}

/** Resting gaze pitch in radians for a vertical field of view in degrees: -8 deg at V >= 55, then 1/3 deg lower per degree below 55 (-11 deg at 46), never below -12 deg. */
export function restPitch(vfovDeg: number): number {
  const deg = vfovDeg >= 55 ? -8 : Math.max(-12, -8 - (55 - vfovDeg) / 3);
  return deg * RAD;
}
/** Tour stops hold the gaze this much above the resting pitch, radians. */
export const STOP_PITCH_UP = 4 * RAD;
