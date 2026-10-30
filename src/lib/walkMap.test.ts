import { describe, expect, it } from "vitest";
import { mapFit, mapToWorld, markerTransform, roomUnder } from "./walkMap";
import { forwardOf } from "./walkTypes";

const sq = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

describe("walkMap", () => {
  const polys = [sq(0, 0, 4), sq(4, 0, 3)];
  const fit = mapFit(polys, 180);
  it("turns the marker with the yaw, the way forwardOf points", () => {
    const left = markerTransform(fit, { x: 0, y: 0, yaw: Math.PI / 2 });
    expect(left).toContain("rotate(-90)");
    expect(forwardOf(Math.PI / 2).x).toBeLessThan(-0.99); // left on a plan with up = -z
    expect(markerTransform(fit, { x: 0, y: 0, yaw: 0 })).toContain("rotate(0)");
    expect(markerTransform(fit, { x: 0, y: 0, yaw: 0 })).toMatch(/^translate\(/);
  });
  it("finds the room under a pixel", () => {
    const rooms = [{ id: "a", poly: polys[0] }, { id: "b", poly: polys[1] }];
    const at = (x: number, y: number) => [x * fit.scale + fit.tx, y * fit.scale + fit.ty] as const;
    expect(roomUnder(fit, rooms, ...at(2, 2))).toBe("a");
    expect(roomUnder(fit, rooms, ...at(5, 1))).toBe("b");
    expect(roomUnder(fit, rooms, ...at(5, 3.9))).toBeNull();
  });
  it("round-trips through the fit and stays inside the square", () => {
    const p = { x: 2.5, y: 1.25 };
    const px = p.x * fit.scale + fit.tx, py = p.y * fit.scale + fit.ty;
    const w = mapToWorld(fit, px, py);
    expect(w.x).toBeCloseTo(p.x, 6);
    expect(w.y).toBeCloseTo(p.y, 6);
    expect(7 * fit.scale + fit.tx).toBeLessThanOrEqual(180);
  });
});
