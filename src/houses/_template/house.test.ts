import { describe, expect, it } from "vitest";
import { lintHouse } from "../lint";
import { PHOTO_PLACES } from "./assets";
import house from "./index";

describe("the template house", () => {
  it("builds its layout and plot", () => {
    const model = house.presets[house.main].build("");
    expect(model.floors[0].rooms).toHaveLength(2);
    expect(house.sitePresets[house.site].build().boundary.length).toBeGreaterThanOrEqual(3);
  });

  it("passes the house lint", () => {
    expect(lintHouse(house, { photoPlaces: PHOTO_PLACES })).toEqual([]);
  });
});
