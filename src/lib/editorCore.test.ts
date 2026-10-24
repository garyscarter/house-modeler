import { describe, expect, it } from "vitest";
import {
  CLICK_SLOP_PX,
  DOUBLE_PRESS_MS,
  clampScale,
  frameOf,
  isDoublePress,
  liveTransform,
  pastSlop,
  resizeCam,
  wheelZoomFactor,
} from "./editorCore";

describe("pastSlop", () => {
  it("is true at the slop distance and beyond", () => {
    expect(pastSlop({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
    expect(pastSlop({ x: 0, y: 0 }, { x: CLICK_SLOP_PX, y: 0 })).toBe(true);
    expect(pastSlop({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(true);
  });
});

describe("isDoublePress", () => {
  const a = { key: "room:1#0", at: 1000, x: 100, y: 100 };
  it("accepts the same key inside 400 ms and 6 px", () => {
    expect(isDoublePress(a, { ...a, at: 1000 + DOUBLE_PRESS_MS, x: 104, y: 104 })).toBe(true);
  });
  it("rejects another key, too late, too far, or nothing before", () => {
    expect(isDoublePress(a, { ...a, key: "room:1#1", at: 1100 })).toBe(false);
    expect(isDoublePress(a, { ...a, at: 1401 })).toBe(false);
    expect(isDoublePress(a, { ...a, at: 1100, x: 108 })).toBe(false);
    expect(isDoublePress(null, a)).toBe(false);
    expect(isDoublePress(a, { ...a, at: 900 })).toBe(false);
  });
});

describe("liveTransform", () => {
  it("is empty for equal cameras", () => {
    expect(liveTransform({ x: 5, y: 6, s: 2 }, { x: 5, y: 6, s: 2 })).toBe("");
  });
  it("maps committed-frame points to where the live camera shows them", () => {
    const c0 = { x: 100, y: 50, s: 2 };
    const c1 = { x: 60, y: 90, s: 1 };
    const m = /matrix\(([^ ]+) 0 0 ([^ ]+) ([^ ]+) ([^)]+)\)/.exec(liveTransform(c0, c1))!;
    const [k, , tx, ty] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    for (const P of [{ x: 0, y: 0 }, { x: 123, y: 45 }, { x: -20, y: 300 }]) {
      // The point sits at screen S under c1; drawn from the c0 viewBox, the transformed point must land at the same S.
      const S = { x: (P.x - c1.x) / c1.s, y: (P.y - c1.y) / c1.s };
      const Q = { x: k * P.x + tx, y: k * P.y + ty };
      const S0 = { x: (Q.x - c0.x) / c0.s, y: (Q.y - c0.y) / c0.s };
      expect(S0.x).toBeCloseTo(S.x, 4);
      expect(S0.y).toBeCloseTo(S.y, 4);
    }
  });
});

describe("resizeCam", () => {
  const c = { x: 10, y: 20, s: 2 };
  it("topLeft keeps the camera", () => {
    expect(resizeCam(c, { w: 100, h: 100 }, { w: 300, h: 50 }, "topLeft")).toEqual(c);
  });
  it("centre keeps the model point at the centre", () => {
    const r = resizeCam(c, { w: 100, h: 100 }, { w: 300, h: 50 }, "centre");
    expect(r.s).toBe(2);
    expect(r.x + (300 * r.s) / 2).toBeCloseTo(c.x + (100 * c.s) / 2);
    expect(r.y + (50 * r.s) / 2).toBeCloseTo(c.y + (100 * c.s) / 2);
  });
});

describe("clampScale", () => {
  it("leaves an in-range camera alone", () => {
    const c = { x: 1, y: 2, s: 3 };
    expect(clampScale(c, 1, 5, { x: 10, y: 10 })).toBe(c);
  });
  it("keeps the point under `about`", () => {
    const c = { x: 100, y: 200, s: 10 };
    const about = { x: 40, y: 30 };
    const r = clampScale(c, 1, 4, about);
    expect(r.s).toBe(4);
    expect(r.x + about.x * r.s).toBeCloseTo(c.x + about.x * c.s);
    expect(r.y + about.y * r.s).toBeCloseTo(c.y + about.y * c.s);
    expect(clampScale(c, 20, 30, about).s).toBe(20);
  });
});

describe("frameOf", () => {
  it("round-trips toScreen against fromClient", () => {
    const f = frameOf({ x: 100, y: 50, s: 0.5 }, { left: 30, top: 20 }, 40);
    expect(f.unitsPerPx).toBe(0.5);
    expect(f.unitsPerM).toBe(40);
    const p = { x: 133, y: 71 };
    const s = f.toScreen(p);
    const back = f.fromClient({ clientX: s.x + 30, clientY: s.y + 20 });
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on negative dy, harder for a pinch", () => {
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-10, true)).toBeGreaterThan(wheelZoomFactor(-10, false));
    expect(wheelZoomFactor(0, false)).toBe(1);
  });
});
