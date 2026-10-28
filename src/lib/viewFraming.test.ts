import { describe, expect, it } from "vitest";
import { elevationFraming, EYE_HEIGHT, houseHeight } from "./viewFraming";
import { builtInHouse } from "../houses/default";

describe("elevationFraming", () => {
  it("fits the height when the frame is wide", () => {
    const f = elevationFraming(7, 5, 45, 2);
    expect(f.targetY).toBeCloseTo(3.5);
    expect(f.eyeY).toBe(EYE_HEIGHT);
    expect(f.distance).toBeCloseTo((3.5 / Math.tan((22.5 * Math.PI) / 180)) * 1.15);
  });

  it("backs off further when the width would not fit a narrow frame", () => {
    const wide = elevationFraming(7, 12, 45, 2);
    const narrow = elevationFraming(7, 12, 45, 0.6);
    expect(narrow.distance).toBeGreaterThan(wide.distance);
    // The width then just fits: half-width over distance is the horizontal half-angle less the margin.
    const tanH = Math.tan((22.5 * Math.PI) / 180) * 0.6;
    expect(6 / narrow.distance).toBeCloseTo(tanH / 1.15);
  });

  it("never aims below eye level for a low building", () => {
    expect(elevationFraming(2.5, 4, 45, 1.5).targetY).toBe(EYE_HEIGHT);
  });
});

describe("houseHeight", () => {
  it("finds the listing's ridge above its two storeys", () => {
    const model = builtInHouse("data:image/png;base64,");
    const h = houseHeight(model);
    const storeys = (Math.max(...model.floors.map((f) => f.level)) + 1) * (model.ceilingHeight + model.slabThickness);
    expect(h).toBeGreaterThan(storeys);
    expect(h).toBeLessThan(12);
  });
});
