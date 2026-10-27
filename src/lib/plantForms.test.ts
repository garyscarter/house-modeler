import { describe, expect, it } from "vitest";
import { GARDEN_ITEMS, isPlant, itemSize } from "./gardenCatalogue";
import { partBounds } from "./gardenParts";
import { PLANT_PART_BUDGET, POT_SHARE, plantParts, runParts } from "./plantForms";
import type { GardenItem } from "../types";

const plants = GARDEN_ITEMS.filter((d) => isPlant(d) && !d.run);
const runs = GARDEN_ITEMS.filter((d) => d.run && d.run !== "festoon");
const itemOf = (type: string, extra: Partial<GardenItem> = {}): GardenItem => ({ id: `p-${type}`, type, x: 0, y: 0, rot: 0, ...extra });

describe("plantParts", () => {
  it.each(plants.map((d) => [d.id, d] as const))("%s is deterministic, within its spread and height, and on budget", (_, def) => {
    for (const seed of [1, 7, 12345, 99999]) {
      const item = itemOf(def.id, { seed });
      const a = plantParts(def, item);
      expect(plantParts(def, item)).toEqual(a);
      expect(a.length).toBeGreaterThan(0);
      expect(a.length).toBeLessThanOrEqual(PLANT_PART_BUDGET);
      const { w, h } = itemSize(item);
      for (const p of a) {
        const b = partBounds(p);
        expect(Math.max(-b.min[0], b.max[0], -b.min[2], b.max[2]), `${def.id} seed ${seed}`).toBeLessThanOrEqual((w / 2) * 1.1 + 1e-6);
        // A leaning stem or blade may dip its foot a little into the ground.
        expect(b.min[1]).toBeGreaterThanOrEqual(-0.03);
        expect(b.max[1]).toBeLessThanOrEqual(h * 1.1 + 1e-6);
      }
    }
  });

  it("varies with the seed, and defaults the seed from the id", () => {
    const def = plants.find((d) => d.shape === "birch")!;
    expect(plantParts(def, itemOf(def.id, { seed: 1 }))).not.toEqual(plantParts(def, itemOf(def.id, { seed: 2 })));
    expect(plantParts(def, { ...itemOf(def.id), id: "a" })).not.toEqual(plantParts(def, { ...itemOf(def.id), id: "b" }));
  });

  it("scales with size overrides", () => {
    const def = plants.find((d) => d.shape === "apple")!;
    const parts = plantParts(def, itemOf(def.id, { w: 5, d: 5, h: 6 }));
    expect(Math.max(...parts.map((p) => partBounds(p).max[1]))).toBeGreaterThan(4.5);
  });
});

describe("runParts", () => {
  it.each(runs.map((d) => [d.id, d] as const))("%s runs from end to end, within its width and height", (_, def) => {
    const item = itemOf(def.id, { to: { x: 3, y: 4 } });
    const { w, h } = itemSize(item);
    const parts = runParts(def, item);
    expect(parts.length).toBeGreaterThan(1);
    const xs = parts.map((p) => partBounds(p));
    expect(Math.min(...xs.map((b) => b.min[0]))).toBeLessThan(0.5);
    expect(Math.max(...xs.map((b) => b.max[0]))).toBeGreaterThan(4.5);
    for (const b of xs) {
      expect(Math.max(-b.min[2], b.max[2])).toBeLessThanOrEqual((w / 2) * 1.6 + 0.05);
      expect(b.max[1]).toBeLessThanOrEqual(h * 1.1 + 1e-6);
    }
    expect(runParts(def, item)).toEqual(parts);
  });

  it("puts stepping stones along the run", () => {
    const def = runs.find((d) => d.run === "stones")!;
    const parts = runParts(def, itemOf(def.id, { to: { x: 0, y: 3 } }));
    expect(parts.length).toBe(6);
    for (const p of parts) expect(Math.abs(p.p[2])).toBeLessThan(1e-9);
  });
});

describe("potted plants", () => {
  it("stand on a pot that takes the bottom of the height, with the tree above it", () => {
    for (const def of GARDEN_ITEMS.filter((d) => d.pot)) {
      const parts = plantParts(def, itemOf(def.id, { seed: 3 }));
      const { h } = itemSize(itemOf(def.id));
      const pot = parts.filter((p) => p.mat.finish === "stone");
      expect(pot.length, def.id).toBeGreaterThanOrEqual(3);
      expect(Math.min(...pot.map((p) => partBounds(p).min[1]))).toBeCloseTo(0, 5);
      const potTop = Math.max(...pot.map((p) => partBounds(p).max[1]));
      expect(potTop).toBeCloseTo(Math.min(h * POT_SHARE, itemSize(itemOf(def.id)).w * 0.6), 5);
      // Everything that is not the pot or its soil starts at the pot's rim or above.
      for (const p of parts.filter((q) => q.mat.finish !== "stone" && q.mat.finish !== "soil")) expect(partBounds(p).min[1], def.id).toBeGreaterThanOrEqual(potTop - 0.03);
    }
  });
});
