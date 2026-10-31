import type { WalkStepMode } from "./walkTypes";

/**
 * Natural step: a gentle head motion while walking (a bounce at each step, a sway each stride), steadied so the gaze holds a
 * point 3 m ahead. Off by default; not offered on a phone held upright; off under reduced motion.
 */
export const STEP_READY = true;
export const STEP_LEN = 0.62; // m per step: f = speed / STEP_LEN steps per second (2.1 Hz at 1.3 m/s)
export const STEP_DY = 0.012; // m, vertical amplitude (2.4 cm peak to peak at full amplitude)
export const STEP_DX = 0.008; // m, side sway, once per stride (two steps)
export const STEP_FIX = 3; // m: the point steadied on screen
export const STEP_YAW_GATE = (30 * Math.PI) / 180; // rad/s: no step while turning faster
export const STEP_FADE_OUT = 0.4; // s from full to none

/** phase runs 0..4 pi (a stride is two steps); amp 0..1. */
export interface StepState { phase: number; amp: number }
export const STEP_REST: StepState = { phase: 0, amp: 0 };

/** Natural step is on: chosen, not under reduced motion, not a phone held upright. */
export function stepEnabled(mode: WalkStepMode, reducedMotion: boolean, portraitPhone: boolean): boolean {
  return mode === "natural" && !reducedMotion && !portraitPhone;
}

const TAU = Math.PI * 2;
/** Advance phase and amplitude. `cruise` is the top walking speed: amplitude follows speed / cruise while walking steadily, and fades out when stopping, turning fast or looking round. */
export function stepAdvance(st: StepState, speed: number, yawRate: number, looking: boolean, cruise: number, dt: number): StepState {
  const target = speed > 0.05 && Math.abs(yawRate) <= STEP_YAW_GATE && !looking ? Math.min(1, speed / cruise) : 0;
  const f = speed / STEP_LEN;
  const phase = (st.phase + TAU * f * dt) % (2 * TAU);
  let amp = st.amp;
  if (target > amp) amp = Math.min(target, amp + (f / 2) * dt);
  else amp = Math.max(target, amp - dt / STEP_FADE_OUT);
  if (amp < 1e-4) amp = 0;
  return { phase, amp };
}

/** Camera offset: dy up (m), dx along the camera's right (m), dPitch (rad; down when the eye rises) that keeps the point `fixDist` ahead still on screen. */
export function stepOffset(phase: number, amp: number, fixDist = STEP_FIX): { dy: number; dx: number; dPitch: number } {
  const dy = -STEP_DY * amp * Math.cos(phase);
  const dx = STEP_DX * amp * Math.sin(phase / 2);
  return { dy, dx, dPitch: -Math.atan(dy / fixDist) };
}
