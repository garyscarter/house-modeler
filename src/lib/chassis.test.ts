import { describe, expect, it } from "vitest";
import { chassisFor, effectiveCompare, toolAllowed } from "./chassis";

describe("chassisFor", () => {
  it("phones in both orientations are the phone chassis", () => {
    expect(chassisFor({ width: 390, height: 844, coarse: true })).toBe("phone");
    expect(chassisFor({ width: 844, height: 390, coarse: true })).toBe("phone");
  });
  it("iPad portrait is the phone chassis, landscape the tablet chassis", () => {
    expect(chassisFor({ width: 820, height: 1180, coarse: true })).toBe("phone");
    expect(chassisFor({ width: 834, height: 1194, coarse: true })).toBe("phone");
    expect(chassisFor({ width: 1180, height: 820, coarse: true })).toBe("tablet");
    expect(chassisFor({ width: 1024, height: 768, coarse: true })).toBe("tablet");
  });
  it("a large touch screen keeps touch sizing", () => {
    expect(chassisFor({ width: 1366, height: 1024, coarse: true })).toBe("tablet");
  });
  it("a narrow desktop window is the tablet chassis, a wide one the desktop", () => {
    expect(chassisFor({ width: 1100, height: 800, coarse: false })).toBe("tablet");
    expect(chassisFor({ width: 1180, height: 800, coarse: false })).toBe("desktop");
    expect(chassisFor({ width: 1440, height: 900, coarse: false })).toBe("desktop");
  });
});

describe("toolAllowed", () => {
  it("phones keep select, doors, windows and measure but not the drawing tools", () => {
    for (const t of ["select", "door", "window", "measure", "place"]) expect(toolAllowed("phone", t)).toBe(true);
    for (const t of ["rect", "room", "wall", "canopy", "gap", "calibrate"]) expect(toolAllowed("phone", t)).toBe(false);
  });
  it("tablets and desktops allow every tool", () => {
    for (const c of ["tablet", "desktop"] as const) for (const t of ["rect", "room", "wall", "canopy", "gap", "calibrate"]) expect(toolAllowed(c, t)).toBe(true);
  });
});

describe("effectiveCompare", () => {
  const f = (m: string, c: "phone" | "tablet" | "desktop", both = true) => effectiveCompare(m, c, both, "single", "wipe", "side-by-side");
  it("is single with one layout", () => {
    expect(f("side-by-side", "desktop", false)).toBe("single");
  });
  it("side by side falls back to wipe off the desktop", () => {
    expect(f("side-by-side", "desktop")).toBe("side-by-side");
    expect(f("side-by-side", "tablet")).toBe("wipe");
    expect(f("side-by-side", "phone")).toBe("wipe");
    expect(f("overlay", "phone")).toBe("overlay");
  });
});
