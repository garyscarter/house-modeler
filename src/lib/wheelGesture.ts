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
 * No event field says which device sent a wheel event, and on a Mac a slow
 * mouse notch is only 4 px, just like a trackpad step, so the heuristic cannot
 * always tell them apart: the "Scroll wheel" preference lets the person say
 * which they use, and `wheelClassifier` takes it as a mode.
 *
 * A gesture's events keep the intent of its first event while they follow
 * within `STICKY_MS` of each other, so a swipe that speeds up into large steps
 * doesn't turn into a zoom halfway through.
 */
export type WheelIntent = "pan" | "zoom";

/** What a plain (unmodified) wheel does: decide per event (auto), or always the one thing. */
export type WheelMode = "auto" | "zoom" | "pan";
export const WHEEL_MODES: WheelMode[] = ["auto", "zoom", "pan"];
export const isWheelMode = (v: unknown): v is WheelMode => (WHEEL_MODES as unknown[]).includes(v);

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

export const STICKY_MS = 150;

export function wheelIntent(e: WheelLike, mode: WheelMode = "auto"): WheelIntent {
  if (e.ctrlKey || e.metaKey) return "zoom";
  if (mode !== "auto") return mode;
  // deltaMode is read before the deltas: Firefox 100+ then keeps reporting a mouse wheel in lines.
  if (e.deltaMode !== 0) return "zoom";
  if (e.deltaX !== 0) return "pan";
  return Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY) ? "zoom" : "pan";
}

/** A per-element classifier that keeps one intent for the length of a gesture. `mode` is read on every event. */
export function wheelClassifier(mode: () => WheelMode = () => "auto") {
  let last: { intent: WheelIntent; at: number; pinch: boolean } | null = null;
  return (e: WheelLike, now: number): WheelIntent => {
    const pinch = e.ctrlKey || e.metaKey;
    // A pinch or a modifier change always decides afresh; otherwise a gesture in progress keeps its intent.
    const intent = last && now - last.at < STICKY_MS && last.pinch === pinch ? last.intent : wheelIntent(e, mode());
    last = { intent, at: now, pinch };
    return intent;
  };
}

/** Wheel deltas in screen px (lines and pages scaled the way browsers scroll them). */
export function wheelPixels(e: WheelLike): { dx: number; dy: number } {
  const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
  return { dx: e.deltaX * unit, dy: e.deltaY * unit };
}

/** The smallest zoom a plain wheel event makes (a slow Mac notch is 4 px; without a floor it would barely move). */
export const WHEEL_ZOOM_MIN = 0.05;
/** How much a plain wheel event zooms per px: a 100 px notch is 16 %. */
export const WHEEL_ZOOM_PER_PX = 0.0015;
/** A pinch arrives as Ctrl + small deltas, so it gets more punch per px. */
export const PINCH_ZOOM_PER_PX = 0.01;
/** The largest zoom one pinch-scaled event makes, so Ctrl + a 100 px mouse notch is a big step, not 2.7x. */
export const PINCH_ZOOM_MAX = 0.3;

/**
 * Wheel delta (px, see wheelPixels) to a zoom factor (> 1 zooms in), shared by the plan, the site and the 3D view.
 * A pinch scales with its deltas up to PINCH_ZOOM_MAX an event; a wheel notch scales with its delta but never
 * below WHEEL_ZOOM_MIN, so one slow notch is a visible step on every platform.
 */
export function wheelZoomFactor(dy: number, pinch: boolean): number {
  if (dy === 0) return 1;
  const step = pinch ? Math.min(Math.abs(dy) * PINCH_ZOOM_PER_PX, PINCH_ZOOM_MAX) : Math.max(Math.abs(dy) * WHEEL_ZOOM_PER_PX, WHEEL_ZOOM_MIN);
  return Math.exp(dy < 0 ? step : -step);
}
