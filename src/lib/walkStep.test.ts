import { describe, expect, it } from "vitest";
import { stepAdvance, stepEnabled, stepOffset, STEP_DX, STEP_DY, STEP_FADE_OUT, STEP_FIX, STEP_LEN, STEP_REST, STEP_YAW_GATE, STEP_READY, type StepState } from "./walkStep";
import { ROUTE_SPEED } from "./walkMotion";

const DT = 1 / 30;
const run = (st: StepState, speed: number, yawRate: number, looking: boolean, seconds: number): StepState[] => {
  const out: StepState[] = [];
  for (let i = 0; i < Math.round(seconds * 30); i++) out.push((st = stepAdvance(st, speed, yawRate, looking, ROUTE_SPEED, DT)));
  return out;
};
const FULL: StepState = { phase: 0, amp: 1 };

describe("natural step", () => {
  it("is ready", () => expect(STEP_READY).toBe(true));
  it("has no amplitude at speed 0", () => {
    const r = run(STEP_REST, 0, 0, false, 1);
    expect(r.every((s) => s.amp === 0)).toBe(true);
    expect(stepOffset(r[0].phase, 0)).toEqual({ dy: -0, dx: 0, dPitch: 0 });
  });
  it("never lifts the eye more than STEP_DY", () => {
    let st = FULL;
    let peak = 0;
    for (let i = 0; i < 300; i++) {
      st = stepAdvance(st, ROUTE_SPEED, 0, false, ROUTE_SPEED, DT);
      peak = Math.max(peak, Math.abs(stepOffset(st.phase, st.amp).dy));
    }
    expect(peak).toBeLessThanOrEqual(STEP_DY + 1e-9);
    expect(peak).toBeGreaterThan(STEP_DY * 0.95);
  });
  it("holds a point 3 m ahead still on screen over a full cycle", () => {
    const ys: number[] = [];
    for (let phase = 0; phase < 4 * Math.PI; phase += 0.05) {
      const o = stepOffset(phase, 1);
      // A point STEP_FIX ahead at eye height, seen from the moved eye: the angle below the camera's axis.
      ys.push(Math.atan2(-o.dy, STEP_FIX) - o.dPitch);
    }
    const range = ((Math.max(...ys) - Math.min(...ys)) * 180) / Math.PI;
    expect(range).toBeLessThan(0.05);
  });
  it("stops stepping when turning fast or looking round", () => {
    expect(run(FULL, ROUTE_SPEED, STEP_YAW_GATE * 1.1, false, 0.5).pop()!.amp).toBe(0);
    expect(run(FULL, ROUTE_SPEED, -STEP_YAW_GATE * 1.1, false, 0.5).pop()!.amp).toBe(0);
    expect(run(FULL, ROUTE_SPEED, 0, true, 0.5).pop()!.amp).toBe(0);
    expect(run(FULL, ROUTE_SPEED, STEP_YAW_GATE * 0.9, false, 0.5).pop()!.amp).toBe(1);
  });
  it("is off under reduced motion and on a phone held upright", () => {
    expect(stepEnabled("natural", true, false)).toBe(false);
    expect(stepEnabled("natural", false, true)).toBe(false);
    expect(stepEnabled("off", false, false)).toBe(false);
    expect(stepEnabled("natural", false, false)).toBe(true);
  });
  it("fades out within STEP_FADE_OUT after stopping", () => {
    const r = run(FULL, 0, 0, false, STEP_FADE_OUT + 0.05);
    expect(r[r.length - 1].amp).toBe(0);
    expect(r[Math.round(0.2 * 30)].amp).toBeGreaterThan(0);
  });
  it("reaches full amplitude within two steps", () => {
    const r = run(STEP_REST, ROUTE_SPEED, 0, false, (2 * STEP_LEN) / ROUTE_SPEED + DT);
    expect(r[r.length - 1].amp).toBe(1);
  });
  it("keeps the sway continuous through the phase wrap", () => {
    let st: StepState = { phase: 4 * Math.PI - 0.01, amp: 1 };
    const a = stepOffset(st.phase, 1).dx;
    st = stepAdvance(st, ROUTE_SPEED, 0, false, ROUTE_SPEED, DT);
    expect(st.phase).toBeLessThan(1);
    const b = stepOffset(st.phase, 1).dx;
    expect(Math.abs(b - a)).toBeLessThan(STEP_DX * 0.25);
  });
});
