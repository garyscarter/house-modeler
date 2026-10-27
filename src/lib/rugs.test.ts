import { describe, expect, it } from "vitest";
import { RUG_GROUND, RUG_PATTERNS, rugPattern } from "./rugs";

describe("rug patterns", () => {
  it("have unique ids, labels and a ground colour", () => {
    expect(new Set(RUG_PATTERNS.map((p) => p.id)).size).toBe(RUG_PATTERNS.length);
    for (const p of RUG_PATTERNS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(RUG_GROUND[p.id]).toMatch(/^#/);
    }
  });
  it("ignores unknown ids", () => {
    expect(rugPattern({ rug: "leopard" })).toBe("leopard");
    expect(rugPattern({ rug: "nope" })).toBeUndefined();
    expect(rugPattern({})).toBeUndefined();
  });
});
