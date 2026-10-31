import { describe, expect, it } from "vitest";
import { lensClass, restPitch, walkLens, yawCapDeg } from "./walkLens";
import type { WalkLensChoice } from "./walkTypes";

const CHOICES: WalkLensChoice[] = ["narrow", "normal", "wide"];
// [w, h, narrow [H, V], normal [H, V], wide [H, V]]
const TABLE: [number, number, [number, number], [number, number], [number, number]][] = [
  [390, 844, [46.23, 85.46], [58.0, 100.37], [61.2, 104.0]], // phone portrait, full screen while walking: the floor across fires
  [390, 732, [46.23, 77.4], [58.0, 92.27], [66.82, 102.14]], // phone portrait under the old chrome
  [844, 390, [78.59, 41.43], [93.49, 52.31], [103.34, 60.61]], // phone landscape, full screen
  [820, 1180, [54.45, 73.03], [67.5, 87.75], [76.98, 97.69]], // iPad portrait (phone chassis, full screen)
  [1180, 820, [73.03, 54.45], [87.75, 67.5], [97.69, 76.98]],
  [1180, 772, [74.06, 52.54], [88.83, 65.32], [98.76, 74.67]], // iPad landscape canvas under the 48 px top bar
  [1024, 1366, [56.81, 71.61], [70.16, 86.26], [79.77, 96.22]],
  [320, 1100, [40.85, 104.0], [40.85, 104.0], [40.85, 104.0]], // Slide Over: the floor across lifts V to the cap on every choice
  [1440, 900, [74.8, 51.08], [89.59, 63.64], [99.51, 72.89]],
  [1440, 852, [75.62, 49.32], [90.44, 61.61], [100.35, 70.71]], // laptop canvas under the top bar
  [1920, 1080, [76.32, 47.69], [91.16, 59.71], [101.06, 68.67]],
  [2560, 1080, [79.43, 38.62], [94.34, 48.94], [104.0, 56.74]],
  [600, 900, [53.14, 73.75], [66.01, 88.5], [75.4, 98.44]],
  [1400, 480, [85.08, 34.93], [100.0, 44.45], [104.0, 47.39]],
  [1600, 400, [85.08, 25.84], [100.0, 33.18], [104.0, 35.49]],
];

describe("walkLens", () => {
  it("matches the worked table on both axes, every choice", () => {
    for (const [w, h, ...want] of TABLE) {
      CHOICES.forEach((c, i) => {
        const l = walkLens(w, h, c);
        expect(l.hfov, `${w}x${h} ${c} H`).toBeCloseTo(want[i][0], 1);
        expect(l.vfov, `${w}x${h} ${c} V`).toBeCloseTo(want[i][1], 1);
      });
    }
  });
  it("is to within 0.05 degrees", () => {
    for (const [w, h, ...want] of TABLE) {
      CHOICES.forEach((c, i) => {
        const l = walkLens(w, h, c);
        expect(Math.abs(l.hfov - want[i][0])).toBeLessThanOrEqual(0.05);
        expect(Math.abs(l.vfov - want[i][1])).toBeLessThanOrEqual(0.05);
      });
    }
  });
  it("defaults to normal", () => {
    expect(walkLens(1440, 900)).toEqual(walkLens(1440, 900, "normal"));
  });
  it("spans 99 degrees corner to corner at normal when no limit fires", () => {
    expect(walkLens(844, 390).diag).toBeCloseTo(99, 2);
    expect(walkLens(1440, 852).diag).toBeCloseTo(99, 2);
  });
  it("never shows a phone held upright narrower than 58 degrees across at normal (owner: not zoomed in)", () => {
    for (const [w, h] of [[390, 844], [390, 732], [375, 667], [430, 932]]) expect(walkLens(w, h).hfov).toBeGreaterThanOrEqual(58 - 1e-9);
    // Narrow is about today's upright view; landscape and larger screens are untouched by the floor.
    expect(walkLens(390, 732, "narrow").hfov).toBeCloseTo(46.2, 1);
    expect(walkLens(844, 390).hfov).toBeCloseTo(93.49, 1);
  });
  it("never goes over 104 on either axis, and keeps the vertical floor at normal unless the horizontal ceiling holds", () => {
    for (let a = 0.25; a <= 4 + 1e-9; a += 0.05) {
      for (const c of CHOICES) {
        const l = walkLens(a * 900, 900, c);
        expect(l.vfov).toBeLessThanOrEqual(104 + 1e-9);
        expect(l.hfov).toBeLessThanOrEqual(104 + 1e-9);
      }
      const n = walkLens(a * 900, 900, "normal");
      expect(n.vfov >= 46 - 1e-9 || Math.abs(n.hfov - 100) < 1e-9).toBe(true);
    }
  });
  it("narrow < normal < wide on both axes, except where both reach the cap", () => {
    for (const [w, h] of TABLE.filter(([w, h]) => w / h > 0.3)) {
      const [n, m, x] = CHOICES.map((c) => walkLens(w, h, c));
      expect(n.hfov).toBeLessThan(m.hfov);
      expect(n.vfov).toBeLessThan(m.vfov);
      if (!(x.hfov >= 104 - 1e-9 && x.vfov >= 104 - 1e-9)) {
        expect(m.hfov).toBeLessThanOrEqual(x.hfov);
        expect(m.vfov).toBeLessThanOrEqual(x.vfov);
        expect(m.hfov < x.hfov || m.vfov < x.vfov).toBe(true);
      }
    }
  });
  it("each step of the choice changes H visibly (by 3 degrees; 2.5 going wide on a phone held upright, where the vertical cap holds it)", () => {
    for (const a of [0.46, 1.0, 1.6, 2.16, 2.37]) {
      const [n, m, x] = CHOICES.map((c) => walkLens(a * 900, 900, c).hfov);
      expect(m - n).toBeGreaterThanOrEqual(3);
      expect(x - m).toBeGreaterThanOrEqual(a < 1 ? 2.5 : 3);
    }
  });
  it("resizing a laptop canvas by 10 px changes V by under 1 degree", () => {
    let prev = walkLens(1400, 620).vfov;
    for (let h = 610; h >= 580; h -= 10) {
      const v = walkLens(1400, h).vfov;
      expect(Math.abs(v - prev)).toBeLessThan(1);
      prev = v;
    }
  });
});

describe("lensClass and yawCapDeg", () => {
  it("classes by the short side and the pointer", () => {
    expect(lensClass(390, 844, true)).toBe("small");
    expect(lensClass(1180, 820, true)).toBe("medium");
    expect(lensClass(820, 1180, true)).toBe("medium");
    expect(lensClass(1440, 852, false)).toBe("large");
    expect(lensClass(1400, 480, false)).toBe("small");
  });
  it("caps the automatic turning rate", () => {
    expect(yawCapDeg("small", 0.46)).toBe(55);
    expect(yawCapDeg("small", 2.16)).toBe(90);
    expect(yawCapDeg("medium", 1.4)).toBe(85);
    expect(yawCapDeg("large", 1.7)).toBe(75);
  });
});

describe("restPitch", () => {
  const deg = (v: number) => (restPitch(v) * 180) / Math.PI;
  it("is -8 down to 55 degrees, then 1/3 degree lower per degree, never below -12", () => {
    expect(deg(80)).toBeCloseTo(-8, 6);
    expect(deg(55)).toBeCloseTo(-8, 6);
    expect(deg(52.31)).toBeCloseTo(-8.897, 3);
    expect(deg(46)).toBeCloseTo(-11, 6);
    expect(deg(44.45)).toBeCloseTo(-11.517, 3);
    expect(deg(30)).toBeCloseTo(-12, 6);
  });
  it("never rises as the view gets shorter", () => {
    let prev = restPitch(100);
    for (let v = 99; v >= 20; v--) {
      expect(restPitch(v)).toBeLessThanOrEqual(prev + 1e-12);
      prev = restPitch(v);
    }
  });
});
