/**
 * Tells a trackpad two-finger swipe from a mouse wheel, so the plan and the 3D
 * view can pan on a swipe and zoom on a pinch or a wheel.
 *
 * - A trackpad pinch arrives as a wheel event with ctrlKey set; Ctrl/⌘ + wheel
 *   on a mouse is treated the same: zoom.
 * - A mouse wheel moves in lines (deltaMode 1, Firefox) or in whole notches of
 *   50 px or more with no sideways part: zoom.
 * - Anything else (sideways movement, small or fractional steps) is a trackpad
 *   swipe: pan.
 *
 * A gesture's events keep the intent of its first event while they follow
 * within `STICKY_MS` of each other, so a swipe that speeds up into large steps
 * doesn't turn into a zoom halfway through.
 */
export type WheelIntent = "pan" | "zoom";

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

export const STICKY_MS = 150;

export function wheelIntent(e: WheelLike): WheelIntent {
  if (e.ctrlKey || e.metaKey) return "zoom";
  if (e.deltaMode !== 0) return "zoom";
  if (e.deltaX !== 0) return "pan";
  return Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY) ? "zoom" : "pan";
}

/** A per-element classifier that keeps one intent for the length of a gesture. */
export function wheelClassifier() {
  let last: { intent: WheelIntent; at: number; pinch: boolean } | null = null;
  return (e: WheelLike, now: number): WheelIntent => {
    const pinch = e.ctrlKey || e.metaKey;
    // A pinch or a modifier change always decides afresh; otherwise a gesture in progress keeps its intent.
    const intent = last && now - last.at < STICKY_MS && last.pinch === pinch ? last.intent : wheelIntent(e);
    last = { intent, at: now, pinch };
    return intent;
  };
}

/** Wheel deltas in screen px (lines and pages scaled the way browsers scroll them). */
export function wheelPixels(e: WheelLike): { dx: number; dy: number } {
  const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
  return { dx: e.deltaX * unit, dy: e.deltaY * unit };
}
