import { describe, expect, it } from "vitest";
import {
  GROUND_SHARE,
  gradientMeanLuminance,
  gradientRadiance,
  luminance,
  REDDEST_SUN,
  skyCalibration,
  skyMeanLuminance,
  skyParams,
  skyRadiance,
  sphereDirections,
  sunColour,
  sunDirection,
} from "./skyModel";

const WHITE: [number, number, number] = [1, 0.896, 0.761];
const rb = (c: readonly number[]) => c[0] / c[2];

describe("sun colour", () => {
  it("is the white sun at 50 degrees", () => {
    const c = sunColour(50, WHITE);
    c.forEach((v, i) => expect(v).toBeCloseTo(WHITE[i], 6));
    expect(rb(sunColour(50))).toBeCloseTo(1, 6);
  });
  it("is warmer near the horizon", () => {
    expect(rb(sunColour(2))).toBeGreaterThan(1.4);
    expect(rb(sunColour(10))).toBeGreaterThan(1.4);
  });
  it("warms steadily as the sun falls", () => {
    let prev = 0;
    for (let a = 90; a >= REDDEST_SUN; a -= 2) {
      const w = rb(sunColour(a));
      expect(w).toBeGreaterThan(prev);
      prev = w;
    }
  });
  it("holds its colour below REDDEST_SUN until the sun sets", () => {
    expect(sunColour(0.5)).toEqual(sunColour(REDDEST_SUN));
  });
  it("keeps the brightest channel at white's above the horizon", () => {
    for (const a of [5, 20, 70]) expect(Math.max(...sunColour(a, WHITE))).toBeCloseTo(1, 6);
  });
  it("is zero below the horizon", () => {
    for (const a of [-1, -5, -30]) expect(sunColour(a, WHITE)).toEqual([0, 0, 0]);
    expect(Math.max(...sunColour(-0.5))).toBeGreaterThan(0);
  });
});

describe("sky radiance", () => {
  const sun = sunDirection(50);
  const p = skyParams(50);
  it("is blue overhead and brighter towards the sun", () => {
    const zen = skyRadiance([0, 1, 0], sun, p);
    expect(zen[2]).toBeGreaterThan(zen[0]);
    const near = skyRadiance(sunDirection(45), sun, p);
    const away = skyRadiance([-Math.cos(0.785), Math.sin(0.785), 0], sun, p);
    expect(luminance(near)).toBeGreaterThan(luminance(away));
  });
  it("is the warm ground below the horizon", () => {
    const down = skyRadiance([0, -1, 0], sun, p);
    // The ground's colour, at a share of the sky's horizon level.
    down.forEach((v, i) => expect(v / GROUND_SHARE[i]).toBeCloseTo(down[0] / GROUND_SHARE[0], 6));
    const hor = luminance(skyRadiance([0, 0, 1], sun, p));
    expect(luminance(down)).toBeGreaterThan(0.15 * hor);
    expect(luminance(down)).toBeLessThan(0.4 * hor);
  });
  it("dims as the sun falls", () => {
    let prev = Infinity;
    for (const a of [60, 50, 30, 15, 5, 0]) {
      const m = skyMeanLuminance(a, 64);
      expect(m).toBeLessThan(prev);
      prev = m;
    }
  });
});

describe("calibration", () => {
  const top = [0.386, 0.503, 0.687], horizon = [0.839, 0.855, 0.871], ground = [0.235, 0.198, 0.15];
  it("matches the gradient's ambient level at 50 degrees", () => {
    const k = skyCalibration(top, horizon, ground);
    expect(k * skyMeanLuminance(50)).toBeCloseTo(gradientMeanLuminance(top, horizon, ground), 9);
    expect(k).toBeGreaterThan(0.3);
    expect(k).toBeLessThan(0.7);
  });
  it("ports the gradient shader", () => {
    const near = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    near(gradientRadiance([0, 1, 0], top, horizon, ground), top);
    near(gradientRadiance([0, -1, 0], top, horizon, ground), ground);
    near(gradientRadiance([1, 0, 0], top, horizon, ground), horizon);
  });
  it("spreads directions evenly", () => {
    const d = sphereDirections(200);
    const mean = d.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map((v) => v / 200);
    mean.forEach((v) => expect(Math.abs(v)).toBeLessThan(0.02));
    d.forEach((v) => expect(Math.hypot(...v)).toBeCloseTo(1, 9));
  });
});
