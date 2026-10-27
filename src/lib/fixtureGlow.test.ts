import { describe, expect, it } from "vitest";
import type { Fixture } from "../types";
import { GLOW, fixtureGeometryKey, glowEmissive, litLook } from "./fixtureGlow";

const fx = (over: Partial<Fixture> = {}): Fixture => ({ id: "a", type: "pendant", x: 10, y: 20, rot: 0, ...over }) as Fixture;

describe("litLook", () => {
  it("a fitting's bulb glows in the light colour, dimmed", () => {
    expect(litLook("bulb", "#999999", { color: "#ffd9a0", dim: 0.55 })).toEqual({ c: "#ffd9a0", f: "lamp", e: glowEmissive("#ffd9a0", 0.55) });
  });
  it("a fitting's fabric keeps its colour and glows in the light colour", () => {
    expect(litLook("fabric", "#abcdef", { color: "#ffd9a0", dim: 1 })).toEqual({ c: "#abcdef", f: "shade", e: glowEmissive("#ffd9a0", 1) });
  });
  it("a lamp's bulb glows warm and its shade in its own colour, with no emissive override", () => {
    expect(litLook("bulb", "#999999")).toEqual({ c: GLOW, f: "lamp" });
    expect(litLook("fabric", "#abcdef")).toEqual({ c: "#abcdef", f: "shade" });
  });
});

describe("glowEmissive", () => {
  it("steps at 10 percent", () => {
    expect(glowEmissive("#ffffff", 0.52)).toBe(glowEmissive("#ffffff", 0.5));
    expect(glowEmissive("#ffffff", 0.5)).not.toBe(glowEmissive("#ffffff", 0.6));
  });
  it("never goes below one step", () => {
    expect(glowEmissive("#ffffff", 0.01)).toBe(glowEmissive("#ffffff", 0.1));
    expect(glowEmissive("#ffffff", 1)).toBe("#ffffff");
  });
});

describe("fixtureGeometryKey", () => {
  it("ignores on, dim and warmth", () => {
    expect(fixtureGeometryKey([fx({ on: false, dim: 30, warmth: "warm" as never })])).toBe(fixtureGeometryKey([fx()]));
  });
  it("changes for x, y, rot, type, color and size", () => {
    const base = fixtureGeometryKey([fx()]);
    for (const over of [{ x: 11 }, { y: 21 }, { rot: 15 }, { type: "table-lamp" }, { color: "#123456" }, { w: 0.5 }] as Partial<Fixture>[]) {
      expect(fixtureGeometryKey([fx(over)])).not.toBe(base);
    }
  });
  it("copes with no fixtures", () => {
    expect(fixtureGeometryKey(undefined)).toBe("[]");
  });
});
