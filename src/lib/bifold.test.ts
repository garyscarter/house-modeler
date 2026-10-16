import { describe, expect, it } from "vitest";
import { bifoldLayout, bifoldZigzag } from "./bifold";

describe("bifold layout", () => {
  it("uses a slimmer lining inside than a frame outside", () => {
    expect(bifoldLayout(2, true).clear).toBeGreaterThan(bifoldLayout(2, false).clear);
  });

  it("folds into a stack well short of the full width", () => {
    const l = bifoldLayout(2, false);
    const pts = bifoldZigzag(l, -1, 1);
    expect(pts).toHaveLength(l.n + 1);
    expect(Math.abs(pts[l.n].x - pts[0].x)).toBeLessThan(l.clear / 2);
  });

  it("starts at the hinge jamb and folds to the swing side", () => {
    const l = bifoldLayout(3, false);
    for (const hinge of [-1, 1] as const) {
      for (const swing of [-1, 1] as const) {
        const pts = bifoldZigzag(l, hinge, swing);
        expect(pts[0]).toEqual({ x: hinge * (l.clear / 2), y: 0 });
        expect(Math.sign(pts[1].y)).toBe(swing);
        expect(Math.sign(pts[l.n].x - pts[0].x)).toBe(-hinge);
      }
    }
  });
});
