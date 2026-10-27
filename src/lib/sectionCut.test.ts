import { describe, expect, it } from "vitest";
import { listing91770873 } from "./houses/listing91770873";
import { houseHeight } from "./viewFraming";
import { BOTTOM_MARGIN, CEILING_GAP, clampSection, defaultSection, describeSection, FLOOR_CUT, nearestStop, sectionRange, sectionStops, snapSection, TOP_MARGIN } from "./sectionCut";
import type { HouseModel } from "../types";

const listing = listing91770873("data:image/png;base64,");
const box = (levels: number[], over: Partial<HouseModel> = {}): HouseModel =>
  ({ floors: levels.map((l) => ({ id: `f${l}`, name: l === 0 ? "Ground floor" : `Level ${l}`, level: l, rooms: [] })), ceilingHeight: 2.5, slabThickness: 0.3, ...over }) as unknown as HouseModel;

describe("sectionRange", () => {
  it("runs from just above the ground floor to just over the listing's ridge", () => {
    const r = sectionRange(listing);
    expect(r.min).toBeCloseTo(BOTTOM_MARGIN);
    expect(r.max).toBeCloseTo(houseHeight(listing) + TOP_MARGIN);
  });

  it("starts at the basement when there is one, and covers the top floor's walls without a roof", () => {
    const r = sectionRange(box([-1, 0, 1]));
    expect(r.min).toBeCloseTo(-2.8 + BOTTOM_MARGIN);
    expect(r.max).toBeGreaterThanOrEqual(2 * 2.8 + TOP_MARGIN - 1e-9);
  });
});

describe("sectionStops", () => {
  it("gives each floor a plan-height stop and a below-the-ceiling stop, lowest first", () => {
    const stops = sectionStops(box([1, 0]));
    expect(stops.map((s) => s.id)).toEqual(["f0:floor", "f0:ceiling", "f1:floor", "f1:ceiling"]);
    expect(stops[0].height).toBeCloseTo(FLOOR_CUT);
    expect(stops[1].height).toBeCloseTo(2.5 - CEILING_GAP);
    expect(stops[2].height).toBeCloseTo(2.8 + FLOOR_CUT);
    expect(stops[3].label).toBe("Level 1, below ceiling");
  });

  it("keeps every stop of the listing inside the range", () => {
    const r = sectionRange(listing);
    for (const s of sectionStops(listing)) {
      expect(s.height).toBeGreaterThan(r.min);
      expect(s.height).toBeLessThan(r.max);
    }
  });

  it("copes with a model missing its storey heights", () => {
    const stops = sectionStops(box([0], { ceilingHeight: undefined as unknown as number, slabThickness: undefined as unknown as number }));
    expect(stops.every((s) => Number.isFinite(s.height))).toBe(true);
  });
});

describe("clamping and snapping", () => {
  const m = box([0, 1]);
  const r = sectionRange(m);
  const stops = sectionStops(m);

  it("clamps to the range, and treats nonsense as the top", () => {
    expect(clampSection(-5, r)).toBe(r.min);
    expect(clampSection(99, r)).toBe(r.max);
    expect(clampSection(NaN, r)).toBe(r.max);
  });

  it("snaps onto a nearby stop and leaves other heights alone", () => {
    expect(snapSection(1.25, stops, r)).toBeCloseTo(FLOOR_CUT);
    expect(snapSection(1.7, stops, r)).toBeCloseTo(1.7);
    expect(nearestStop(3.9, stops)?.id).toBe("f1:floor");
  });

  it("starts on the top floor's plan-height stop", () => {
    expect(defaultSection(m)).toBeCloseTo(2.8 + FLOOR_CUT);
  });

  it("describes a height by its stop or the floor it cuts", () => {
    expect(describeSection(1.2, m)).toBe("1.20 m · Ground floor");
    expect(describeSection(1.7, m)).toBe("1.70 m · Ground floor");
    expect(describeSection(3.0, m)).toBe("3.00 m · Level 1");
  });
});
