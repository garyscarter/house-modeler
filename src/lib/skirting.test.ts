import { describe, expect, it } from "vitest";
import { DEFAULT_SKIRTING_COLOUR, skirtingColour } from "./skirting";
import { builtInHouse } from "../houses/default";

describe("skirtingColour", () => {
  it("is white paint unless the room sets its own", () => {
    expect(skirtingColour(undefined)).toBe(DEFAULT_SKIRTING_COLOUR);
    expect(skirtingColour({})).toBe(DEFAULT_SKIRTING_COLOUR);
    expect(skirtingColour({ skirtingColor: "#3e2418" })).toBe("#3e2418");
  });

  it("is dark stained downstairs and white upstairs in the listing model", () => {
    const [ground, first] = builtInHouse("").floors;
    const dark = ["Kitchen", "Living Room (rear)", "Living Room (front)", "Hallway (stairs)"];
    for (const name of dark) {
      const room = ground.rooms.find((r) => r.name === name);
      expect(room, name).toBeDefined();
      expect(skirtingColour(room)).toBe("#3e2418");
    }
    for (const room of first.rooms) expect(skirtingColour(room)).toBe(DEFAULT_SKIRTING_COLOUR);
  });
});
