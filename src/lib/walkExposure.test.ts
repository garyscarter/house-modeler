import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { daylight } from "./sun";
import { builtInHouse, listingSite } from "../houses/default";
import { buildNav } from "./walkNav";
import {
  CONVERGED, EV_RANGE_PORTRAIT, EXPOSURE_START, easeExposure, exposureBusy, glazingFraction, lampTerm, meter, panesOf, roomAmbient, skyDay, skyLevel, targetEV,
  type Exposure, type Pane,
} from "./walkExposure";

const ev = (L: number, mode: "off" | "natural" | "strong" = "natural", portrait = false) => targetEV(L, mode, portrait);

describe("skyLevel", () => {
  // The expression Lighting.tsx used before it moved here, written with three's own smoothstep.
  const old = (alt: number | null) => {
    if (alt === null) return 1;
    const low = 1 - THREE.MathUtils.smoothstep(alt, 0, 6);
    const dark = 1 - THREE.MathUtils.smoothstep(alt, -4 - 2, -4 + 2);
    return THREE.MathUtils.lerp(daylight(alt).sky * (1 - 0.35 * low), 0.03, dark);
  };
  it("agrees with the lights' expression", () => {
    for (const a of [-20, -4, 0, 3, 10, 40]) expect(skyLevel(a)).toBeCloseTo(old(a), 10);
    expect(skyLevel(null)).toBe(1);
    expect(skyLevel(-20)).toBeCloseTo(0.03, 10);
  });
  it("skyDay is 0 at night and 1 at noon", () => {
    expect(skyDay(skyLevel(-20))).toBeCloseTo(0, 10);
    expect(skyDay(1)).toBe(1);
  });
});

describe("meter and target", () => {
  it("a windowless hall at noon reads dark", () => {
    const L = meter({ glazedArea: 0, floorArea: 8.2, sky: 1, lamps: 0, glazing: 0, portrait: false });
    expect(L).toBeCloseTo(0.3, 6);
    const e = ev(L);
    expect(e).toBeGreaterThanOrEqual(0.5);
    expect(e).toBeLessThanOrEqual(1.0);
  });
  it("a south room at noon is a little over-bright", () => {
    const L = meter({ glazedArea: 0.25 * 12, floorArea: 12, sky: 1, lamps: 0, glazing: 0.15, portrait: false });
    expect(L).toBeCloseTo(0.9875, 3);
    const e = ev(L);
    expect(e).toBeGreaterThanOrEqual(-0.3);
    expect(e).toBeLessThanOrEqual(0);
  });
  it("at night windows add nothing; lamps lift the room", () => {
    const sky = skyLevel(-20);
    const lamps = 0.4;
    const withGlass = meter({ glazedArea: 3, floorArea: 12, sky, lamps, glazing: 0.3, portrait: false });
    const without = meter({ glazedArea: 3, floorArea: 12, sky, lamps, glazing: 0, portrait: false });
    expect(withGlass).toBe(without);
    expect(ev(without)).toBeCloseTo(0.46, 1);
    expect(ev(without)).toBeLessThan(1.0);
    const dark = meter({ glazedArea: 3, floorArea: 12, sky, lamps: 0, glazing: 0.3, portrait: false });
    expect(dark).toBe(0.02);
    expect(ev(dark)).toBe(1.0);
  });
  it("Strong clamps the hall at +1, Off is 0", () => {
    expect(ev(0.3, "strong")).toBe(1.0);
    expect(-0.85 * Math.log2(0.3 / 0.715)).toBeCloseTo(1.065, 2);
    expect(ev(0.3, "off")).toBe(0);
    expect(ev(5, "off")).toBe(0);
  });
  it("a phone held upright clamps tighter and scales glazing", () => {
    expect(ev(0.02, "strong", true)).toBe(EV_RANGE_PORTRAIT.hi);
    expect(ev(50, "strong", true)).toBe(EV_RANGE_PORTRAIT.lo);
    const a = meter({ glazedArea: 0, floorArea: 10, sky: 1, lamps: 0, glazing: 0.2, portrait: false });
    const b = meter({ glazedArea: 0, floorArea: 10, sky: 1, lamps: 0, glazing: 0.2, portrait: true });
    expect((b - roomAmbient(0, 10, 1, 0)) / (a - roomAmbient(0, 10, 1, 0))).toBeCloseTo(0.7, 6);
  });
  it("lampTerm is lumens over the daylit-room figure, capped", () => {
    expect(lampTerm(300 * 10, 10)).toBeCloseTo(1, 6);
    expect(lampTerm(1e6, 10)).toBe(1.2);
  });
});

const run = (e: Exposure, target: number, seconds: number, dt = 1 / 30): { e: Exposure; at: (frac: number) => number } => {
  let cur = easeExposure(e, target, dt, false);
  let t = dt;
  let hit = -1;
  const from = e.ev;
  for (let i = 1, n = Math.round(seconds / dt); i < n; i++) {
    cur = easeExposure(cur, null, dt, false);
    t += dt;
    if (hit < 0 && Math.abs(cur.ev - from) >= 0.632 * Math.abs(target - from)) hit = t;
  }
  return { e: cur, at: () => hit };
};

describe("easeExposure", () => {
  it("darkening is slow, brightening is quick", () => {
    expect(run(EXPOSURE_START, 0.5, 6).at(0)).toBeGreaterThan(1.65);
    expect(run(EXPOSURE_START, 0.5, 6).at(0)).toBeLessThan(1.85);
    expect(run(EXPOSURE_START, -0.5, 3).at(0)).toBeGreaterThan(0.35);
    expect(run(EXPOSURE_START, -0.5, 3).at(0)).toBeLessThan(0.45);
  });
  it("a big step is rate limited", () => {
    const r = run(EXPOSURE_START, 2, 1);
    expect(r.e.ev).toBeLessThanOrEqual(0.7 + 1e-9);
  });
  it("ignores target moves inside the dead band", () => {
    const e = easeExposure({ ev: 0.3, target: 0.3, since: 0 }, 0.4, 1 / 30, false);
    expect(e.target).toBe(0.3);
  });
  it("snap jumps", () => {
    const e = easeExposure(EXPOSURE_START, 0.9, 1 / 30, true);
    expect(e.ev).toBe(e.target);
    expect(e.ev).toBe(0.9);
  });
  it("is idle once converged", () => {
    const r = run(EXPOSURE_START, 0.6, 12);
    expect(exposureBusy(r.e)).toBe(false);
    expect(Math.abs(r.e.ev - r.e.target)).toBeLessThan(CONVERGED);
  });
  it("a look-round jittering the target does not move it", () => {
    let e: Exposure = { ev: 0.2, target: 0.2, since: 0 };
    let changes = 0;
    for (let i = 0; i < 40; i++) {
      const next = 0.2 + (i % 2 ? 0.1 : -0.1);
      const n = easeExposure(e, next, 0.2, false);
      if (n.target !== e.target) changes++;
      e = n;
    }
    expect(changes).toBeLessThan(2);
  });
});

const windowAt = (z: number, sill: number, head: number, x0 = -1, x1 = 1): Pane => ({ a: [x0, sill, z], u: [x1 - x0, 0, 0], v: [0, head - sill, 0] });
const view = (yaw: number, pitch = 0) => ({ eye: [0, 1.6, 0] as [number, number, number], yaw, pitch, vfovDeg: 60, aspect: 1.6 });

describe("glazingFraction", () => {
  it("sees a window ahead and not one behind", () => {
    expect(glazingFraction(view(0), [windowAt(-2, 0.9, 2.1)])).toBeGreaterThan(0.15);
    expect(glazingFraction(view(0), [windowAt(2, 0.9, 2.1)])).toBe(0);
  });
  it("a high window shows less when looking down", () => {
    const high = glazingFraction(view(0, (-11 * Math.PI) / 180), [windowAt(-2, 1.9, 2.3)]);
    const low = glazingFraction(view(0, (-11 * Math.PI) / 180), [windowAt(-2, 1.1, 1.5)]);
    expect(high).toBeLessThan(low);
  });
  it("positive yaw turns left", () => {
    const left: Pane = { a: [-2, 0.9, 1], u: [0, 0, -2], v: [0, 1.2, 0] };
    expect(glazingFraction(view(Math.PI / 2), [left])).toBeGreaterThan(0);
    expect(glazingFraction(view(-Math.PI / 2), [left])).toBe(0);
  });
});

describe("panesOf the built-in house", () => {
  const nav = buildNav(builtInHouse(""), listingSite(), false);
  it("makes upright panes at the sill", () => {
    expect(nav.glazing.length).toBeGreaterThan(0);
    const level = nav.levels[0];
    const panes = panesOf(nav.glazing.filter((g) => g.level === level.level), level.baseY);
    expect(panes.length).toBeGreaterThan(0);
    for (const [i, p] of panes.entries()) {
      expect(Math.hypot(...p.v)).toBeGreaterThan(0);
      expect(p.a[1]).toBeCloseTo(level.baseY + nav.glazing.filter((g) => g.level === level.level)[i].sill, 10);
    }
  });
});
