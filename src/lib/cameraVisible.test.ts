import { describe, expect, it } from "vitest";
import { camToShow } from "./cameraVisible";

const size = { w: 390, h: 800 };
const cam = { x: 0, y: 0, s: 1 };

describe("camToShow", () => {
  it("leaves the camera alone when the rect is already clear of the bottom chrome", () => {
    expect(camToShow(cam, size, { x0: 50, y0: 100, x1: 150, y1: 300 }, 400)).toBe(cam);
  });
  it("pans up just enough that a rect under the sheet sits above it", () => {
    const c = camToShow(cam, size, { x0: 50, y0: 500, x1: 150, y1: 600 }, 400);
    expect(c.y).toBe(600 - (400 - 16));
    expect((600 - c.y) / c.s).toBe(400 - 16);
  });
  it("keeps the top of a rect taller than the free area in view", () => {
    const c = camToShow(cam, size, { x0: 0, y0: 100, x1: 10, y1: 700 }, 400);
    expect((100 - c.y) / c.s).toBe(16);
  });
  it("scales with the zoom", () => {
    const c = camToShow({ x: 0, y: 0, s: 2 }, size, { x0: 0, y0: 1000, x1: 10, y1: 1100 }, 400);
    expect((1100 - c.y) / 2).toBe(400 - 16);
  });
});
