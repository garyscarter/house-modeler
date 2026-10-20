import { describe, expect, it } from "vitest";
import { CEILING_DROP, ceilingY } from "./ceiling";

describe("ceilingY", () => {
  it("hangs just below the ceiling height, where the slab above starts, so the two never share a plane", () => {
    const h = 2.4;
    expect(ceilingY(h)).toBeLessThan(h);
    expect(h - ceilingY(h)).toBeCloseTo(CEILING_DROP, 9);
    // Enough to clear depth-buffer noise, too little to see.
    expect(CEILING_DROP).toBeGreaterThanOrEqual(0.005);
    expect(CEILING_DROP).toBeLessThanOrEqual(0.02);
  });
});
