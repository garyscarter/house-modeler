import { describe, expect, it } from "vitest";
import { planKeyAction } from "./planKeys";

const key = (k: string, o: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...o });
const build = { mode: "build" as const, fixtureSelected: false, placing: false };
const furnish = { mode: "furnish" as const, fixtureSelected: false, placing: false };

describe("planKeyAction", () => {
  it("R picks Rectangle in Build with no furniture", () => {
    expect(planKeyAction(key("r"), build)).toEqual({ tool: "rect" });
    expect(planKeyAction(key("R"), build)).toEqual({ tool: "rect" });
  });
  it("R turns furniture when one is selected or being placed", () => {
    expect(planKeyAction(key("r"), { ...furnish, fixtureSelected: true })).toEqual({ rotate: 90 });
    expect(planKeyAction(key("r"), { ...furnish, placing: true })).toEqual({ rotate: 90 });
    expect(planKeyAction(key("R", { shiftKey: true }), { ...furnish, fixtureSelected: true })).toEqual({ rotate: 15 });
  });
  it("R in Furnish with nothing selected does nothing; Shift+R only turns furniture", () => {
    expect(planKeyAction(key("r"), furnish)).toBeNull();
    expect(planKeyAction(key("R", { shiftKey: true }), build)).toBeNull();
  });
  it("leaves Ctrl and Cmd combinations alone", () => {
    expect(planKeyAction(key("d", { ctrlKey: true }), { ...furnish, fixtureSelected: true })).toBeNull();
    expect(planKeyAction(key("c", { metaKey: true }), build)).toBeNull();
    expect(planKeyAction(key("v", { ctrlKey: true }), build)).toBeNull();
    expect(planKeyAction(key("r", { altKey: true }), build)).toBeNull();
  });
  it("tool keys need the tool in the mode", () => {
    expect(planKeyAction(key("d"), build)).toEqual({ tool: "door" });
    expect(planKeyAction(key("d"), { ...build, mode: "decorate" })).toBeNull();
    expect(planKeyAction(key("d"), furnish)).toBeNull();
    expect(planKeyAction(key("v"), furnish)).toEqual({ tool: "select" });
    expect(planKeyAction(key("m"), furnish)).toEqual({ tool: "measure" });
    expect(planKeyAction(key("n"), build)).toEqual({ tool: "window" });
    expect(planKeyAction(key("p"), build)).toEqual({ tool: "room" });
    expect(planKeyAction(key("w"), build)).toEqual({ tool: "wall" });
    expect(planKeyAction(key("c"), build)).toEqual({ tool: "canopy" });
    expect(planKeyAction(key("g"), build)).toEqual({ tool: "gap" });
  });
  it("has no key for calibrate", () => {
    expect(planKeyAction(key("k"), build)).toBeNull();
  });
  it("I, F and zoom work in every mode", () => {
    for (const mode of ["build", "decorate", "furnish", "review"] as const) {
      const c = { ...build, mode };
      expect(planKeyAction(key("i"), c)).toEqual({ image: true });
      expect(planKeyAction(key("f"), c)).toEqual({ fit: true });
      expect(planKeyAction(key("+"), c)).toEqual({ zoom: 1 });
      expect(planKeyAction(key("="), c)).toEqual({ zoom: 1 });
      expect(planKeyAction(key("-"), c)).toEqual({ zoom: -1 });
    }
  });
  it("A opens Add only in Furnish", () => {
    expect(planKeyAction(key("a"), furnish)).toEqual({ add: true });
    expect(planKeyAction(key("a"), build)).toBeNull();
  });
});
