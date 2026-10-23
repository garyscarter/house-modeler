import { describe, expect, it } from "vitest";
import { FLOOR_FINISH_LABEL, type FloorFinish } from "../types";
import { DEFAULT_GROUT, FLOOR_COLOUR, finishColour, floorAngle, groutColour, takesAngle, takesGrout } from "./floorFinish";
import { COST_LINES, floorChange } from "./report";

const ALL = Object.keys(FLOOR_FINISH_LABEL) as FloorFinish[];
const NEW: FloorFinish[] = ["herringbone", "chevron", "wideoak", "porcelain", "microcement", "terrazzo", "encaustic", "victorian", "hexagon"];

describe("floor finishes", () => {
  it("label every finish once, the new ones included, with plain colour first", () => {
    expect(ALL[0]).toBe("plain");
    expect(ALL).toEqual(expect.arrayContaining([...NEW, "oak", "laminate", "tile", "quarry", "stone", "carpet", "vinyl", "concrete"]));
    expect(new Set(Object.values(FLOOR_FINISH_LABEL)).size).toBe(ALL.length);
  });

  it("give every textured finish a typical colour, light natural oak for herringbone", () => {
    for (const f of ALL) if (f !== "plain") expect(FLOOR_COLOUR[f], f).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(FLOOR_COLOUR).sort()).toEqual(ALL.filter((f) => f !== "plain").sort());
    // Existing finishes keep their colours.
    expect(FLOOR_COLOUR.oak).toBe("#b88a58");
    expect(FLOOR_COLOUR.quarry).toBe("#9a4a35");
  });

  it("use the room's colour, else the finish's own", () => {
    expect(finishColour({ floorFinish: "herringbone" })).toBe(FLOOR_COLOUR.herringbone);
    expect(finishColour({ floorFinish: "herringbone", color: "#806040" })).toBe("#806040");
    expect(finishColour({})).toBeUndefined();
  });

  it("take grout only where laid in grout, the room's own if set", () => {
    expect(takesGrout("hexagon")).toBe(true);
    expect(takesGrout("herringbone")).toBe(false);
    expect(takesGrout(undefined)).toBe(false);
    expect(groutColour({ floorFinish: "tile" })).toBe(DEFAULT_GROUT.tile);
    expect(groutColour({ floorFinish: "porcelain", floorGrout: "#222222" })).toBe("#222222");
    expect(groutColour({ floorFinish: "oak", floorGrout: "#222222" })).toBeUndefined();
  });

  it("turn only finishes with a direction", () => {
    expect(takesAngle("herringbone")).toBe(true);
    expect(takesAngle("oak")).toBe(true);
    expect(takesAngle("carpet")).toBe(false);
    expect(takesAngle("microcement")).toBe(false);
    expect(floorAngle({ floorFinish: "chevron", floorAngle: 45 })).toBe(45);
    expect(floorAngle({ floorFinish: "terrazzo", floorAngle: 45 })).toBe(0);
    expect(floorAngle({ floorFinish: "herringbone" })).toBe(0);
  });
});

describe("floor finish changes in the report", () => {
  it("name what is laid and what it replaces, priced as a new floor finish", () => {
    expect(floorChange({ floorFinish: "vinyl" }, { name: "Kitchen", floorFinish: "herringbone" })).toEqual({
      description: "New floor in the Kitchen: Herringbone wood or LVT (was vinyl)",
      laid: true,
    });
    expect(floorChange({}, { name: "Hall", floorFinish: "victorian" })?.description).toBe("New floor in the Hall: Victorian geometric tiles");
    expect(floorChange({ floorFinish: "carpet" }, { name: "Bedroom 1" })).toEqual({ description: "Bedroom 1: carpet floor taken up", laid: false });
    expect(floorChange({ floorFinish: "oak" }, { name: "Kitchen", floorFinish: "oak" })).toBeUndefined();
    expect(COST_LINES.find((l) => l.id === "newFlooring")).toMatchObject({ label: "New floor finish", unit: "m²" });
  });
});
