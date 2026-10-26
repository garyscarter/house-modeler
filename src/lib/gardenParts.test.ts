import { describe, expect, it } from "vitest";
import { GARDEN_ITEMS, isLight, isPlant, itemSize } from "./gardenCatalogue";
import { gardenParts, partBounds, PART_SHAPES } from "./gardenParts";
import type { GardenItem } from "../types";

const items = GARDEN_ITEMS.filter((d) => !isPlant(d) && !d.run);
const itemOf = (type: string, extra: Partial<GardenItem> = {}): GardenItem => ({ id: `t-${type}`, type, x: 0, y: 0, rot: 0, ...extra });

describe("gardenParts", () => {
  it("draws every non-plant, non-run shape", () => {
    for (const def of items) expect(PART_SHAPES).toContain(def.shape);
  });

  it.each(items.map((d) => [d.id, d] as const))("keeps %s inside its w × d × h box", (_, def) => {
    const item = itemOf(def.id);
    const { w, d, h } = itemSize(item);
    const parts = gardenParts(def, item);
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) {
      const b = partBounds(p);
      expect(b.min[0]).toBeGreaterThanOrEqual((-w / 2) * 1.05 - 1e-6);
      expect(b.max[0]).toBeLessThanOrEqual((w / 2) * 1.05 + 1e-6);
      expect(b.min[2]).toBeGreaterThanOrEqual((-d / 2) * 1.05 - 1e-6);
      expect(b.max[2]).toBeLessThanOrEqual((d / 2) * 1.05 + 1e-6);
      expect(b.min[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(b.max[1]).toBeLessThanOrEqual(h * 1.05 + 1e-6);
    }
  });

  it("gives lights a glowing bulb", () => {
    for (const def of items.filter(isLight)) {
      const bulbs = gardenParts(def, itemOf(def.id)).filter((p) => p.mat.finish === "bulb");
      expect(bulbs.length, def.id).toBeGreaterThan(0);
      for (const b of bulbs) expect(b.mat.glow).toBeTruthy();
    }
  });

  it("follows size overrides and seats", () => {
    const small = gardenParts(GARDEN_ITEMS.find((d) => d.id === "dining-6")!, itemOf("dining-6", { seats: 4 }));
    const big = gardenParts(GARDEN_ITEMS.find((d) => d.id === "dining-6")!, itemOf("dining-6", { seats: 8, d: 2.6 }));
    expect(big.length).toBeGreaterThan(small.length);
  });
});
