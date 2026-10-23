import { describe, expect, it } from "vitest";
import { metricUvs } from "./neighbourUv";

describe("metricUvs", () => {
  it("measures a wall in metres along it and up it", () => {
    // Wall in the x-y plane facing +z, 3 m long and 2 m high.
    const uv = metricUvs([0, 0, 0, 3, 0, 0, 3, 2, 0]);
    expect(Math.abs(uv[2] - uv[0])).toBeCloseTo(3);
    expect(Math.abs(uv[5] - uv[1])).toBeCloseTo(2);
    expect(uv[3]).toBeCloseTo(uv[1]);
  });
  it("runs v up a roof slope by its true length", () => {
    // Slope rising 3 m over 4 m of run, eaves along x: slope length 5.
    const uv = metricUvs([0, 0, 0, 0, 3, -4, 6, 0, 0]);
    expect(Math.abs(uv[3] - uv[1])).toBeCloseTo(5);
    expect(Math.abs(uv[2] - uv[0])).toBeCloseTo(0);
  });
  it("uses x and z on a flat face", () => {
    const uv = metricUvs([0, 1, 0, 0, 1, 2, 4, 1, 0]);
    expect(Math.abs(uv[1] - uv[5])).toBeCloseTo(0);
    expect(Math.abs(uv[4] - uv[0])).toBeCloseTo(4);
  });
});
