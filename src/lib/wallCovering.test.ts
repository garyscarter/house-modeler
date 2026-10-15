import { describe, expect, it } from "vitest";
import { WARM_WHITE, interiorFinish, wallAccent, wallBase } from "./wallCovering";
import { rect } from "./testing";

const room = (extra: Parameters<typeof rect>[5] = {}) => rect("A", 0, 0, 300, 300, extra);

describe("interiorFinish", () => {
  it("paints warm white by default", () => {
    expect(interiorFinish(room(), undefined)).toEqual({ covering: "paint", color: WARM_WHITE });
    expect(interiorFinish(undefined, undefined)).toEqual({ covering: "paint", color: WARM_WHITE });
  });

  it("uses the room's paint and ignores a pattern colour on paint", () => {
    expect(interiorFinish(room({ wallPaint: "#d9e6d3", wallAccent: "#ff0000" }), undefined)).toEqual({ covering: "paint", color: "#d9e6d3" });
  });

  it("paints a wall with its own colour plainly, whatever the room's covering", () => {
    expect(interiorFinish(room({ wallCovering: "floral", wallPaint: "#ffffff" }), "#334455")).toEqual({ covering: "paint", color: "#334455" });
  });

  it("keeps the covering, ground and pattern colour", () => {
    expect(interiorFinish(room({ wallCovering: "floral", wallPaint: "#f3efe9", wallAccent: "#c8364a" }), undefined)).toEqual({
      covering: "floral",
      color: "#f3efe9",
      accent: "#c8364a",
    });
  });

  it("fills in defaults per covering", () => {
    const brick = room({ wallCovering: "brick" });
    expect(wallBase(brick)).not.toBe(WARM_WHITE);
    expect(wallAccent(brick)).toMatch(/^#[0-9a-f]{6}$/);
    expect(wallBase(room({ wallCovering: "stripe" }))).toBe(WARM_WHITE);
    expect(wallAccent(room({ wallCovering: "sprig" }))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("leaves tiles without a feature strip unless a colour is chosen", () => {
    expect(interiorFinish(room({ wallCovering: "tiles", wallPaint: "#dccbb8" }), undefined)).toEqual({ covering: "tiles", color: "#dccbb8", accent: null });
    expect(wallAccent(room({ wallCovering: "tiles", wallAccent: "#c9b79c" }))).toBe("#c9b79c");
  });
});
