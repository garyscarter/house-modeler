import { describe, expect, it } from "vitest";
import type { GardenItem, Site } from "../types";
import { lightGlow } from "./dusk";
import { candela } from "./lights";
import { gardenLamps, gardenPoolDemand, gardenSources, lampLevel } from "./siteLights";

const site = (items: GardenItem[], surfaces: Site["surfaces"] = []): Pick<Site, "items" | "surfaces"> => ({ items, surfaces });
const festoon = (len: number, type = "festoon"): GardenItem => ({ id: "f", type, x: 0, y: -10, rot: 0, to: { x: len, y: -10 }, h: 2.4 });

describe("siteLights", () => {
  it("gives a long festoon two lights below the wire, sharing all its bulbs' light", () => {
    const l = gardenSources(site([festoon(4)]));
    expect(l).toHaveLength(2);
    expect(l.map((x) => x.id)).toEqual(["garden:f:0", "garden:f:1"]);
    expect(l[0].pos[0]).toBeLessThan(2);
    expect(l[1].pos[0]).toBeGreaterThan(2);
    for (const x of l) {
      expect(x.pos[2]).toBeCloseTo(-10);
      expect(x.pos[1]).toBeLessThan(2.4 - 0.06);
      expect(x.pos[1]).toBeGreaterThan(2.4 - 0.3 - 0.07);
      expect(x.spot).toBeUndefined();
      expect(x.color).toBe("#ffd9a0");
    }
    // Nine bulbs at 0.5 m pitch over 4 m.
    expect(l[0].candela + l[1].candela).toBeCloseTo(9 * candela(120));
  });
  it("gives a short festoon one light at its middle", () => {
    const l = gardenSources(site([festoon(2, "festoon-warm")]));
    expect(l).toHaveLength(1);
    // The mean of its bulbs: 0, 0.6, 1.2 and 1.8 m along (pitch 0.6).
    expect(l[0].pos[0]).toBeGreaterThan(0.7);
    expect(l[0].pos[0]).toBeLessThan(1.1);
    expect(l[0].color).toBe("#ffcf8a");
  });
  it("puts a bollard's light at its head, on a raised bed, at the view's ground level", () => {
    const bed: Site["surfaces"] = [{ id: "b", kind: "bed", polygon: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }], slope: { toward: "back", rise: 0, base: 0.3 } }];
    const [l] = gardenSources(site([{ id: "b1", type: "bollard", x: 0, y: 0, rot: 0 }], bed), -0.26);
    expect(l.pos[0]).toBe(0);
    expect(l.pos[2]).toBe(0);
    expect(l.pos[1]).toBeCloseTo(-0.26 + 0.3 + 0.6 - 0.06);
  });
  it("stands a wall light's source off the wall at its mount height", () => {
    // rot 180 faces -y (into the back garden), as on the house's rear wall.
    const [l] = gardenSources(site([{ id: "w", type: "wall-light", x: 0, y: -8.06, rot: 180 }]));
    expect(l.pos[0]).toBeCloseTo(0);
    expect(l.pos[2]).toBeCloseTo(-8.06 - 0.06 - 0.12);
    expect(l.pos[1]).toBeCloseTo(1.7 + 0.08);
  });
  it("ignores items that are not lights, and counts sources for the pool lit or not", () => {
    expect(gardenSources(site([{ id: "t", type: "dining-6", x: 0, y: -10, rot: 0 }]))).toEqual([]);
    expect(gardenPoolDemand(site([festoon(4), { id: "b", type: "bollard", x: 0, y: 0, rot: 0 }]))).toBe(3);
    expect(gardenPoolDemand(null)).toBe(0);
  });
  it("lights the garden from dusk, under the Lights master", () => {
    const s = site([{ id: "b", type: "bollard", x: 0, y: 0, rot: 0 }]);
    expect(gardenLamps(s, "auto", 40)).toEqual([]);
    expect(gardenLamps(s, "auto", null)).toEqual([]);
    expect(gardenLamps(s, "off", -10)).toEqual([]);
    // Forced on by day: the garden bulbs do not glow by day, so they throw no light either.
    expect(gardenLamps(s, "on", 40)).toEqual([]);
    const [dusk] = gardenLamps(s, "auto", 1);
    expect(dusk.candela).toBeCloseTo(candela(300), 1);
    expect(gardenLamps(s, "on", -10)[0].candela).toBeCloseTo(candela(300));
    expect(gardenLamps(null, "on", -10)).toEqual([]);
  });
  it("ramps the lamp level with the glow", () => {
    expect(lampLevel(lightGlow(null))).toBe(0);
    expect(lampLevel(lightGlow(1))).toBeGreaterThan(0.99);
    expect(lampLevel(lightGlow(-10))).toBe(1);
    expect(lampLevel(lightGlow(8))).toBeGreaterThan(0);
    expect(lampLevel(lightGlow(8))).toBeLessThan(1);
  });
});

describe("garden lights in the house's pool", () => {
  it("adds the garden's point lights to poolFor's demand, still capped", async () => {
    const { POOL, poolFor } = await import("./lights");
    const empty = { floors: [], ceilingHeight: 2.4 };
    expect(poolFor(empty, POOL.high)).toEqual({ point: 0, spot: 0, casters: 0 });
    expect(poolFor(empty, POOL.high, null, 3)).toEqual({ point: 3, spot: 0, casters: 0 });
    expect(poolFor(empty, POOL.low, null, 30)).toEqual({ point: 8, spot: 0, casters: 0 });
  });
});
