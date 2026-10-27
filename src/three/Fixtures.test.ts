import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { softGeometry } from "./Fixtures";

describe("softGeometry", () => {
  it("merges with a unit box (same attributes)", () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const soft = softGeometry(0.6, 0.14, 0.5);
    expect(Object.keys(soft.attributes).sort()).toEqual(Object.keys(box.attributes).sort());
    const mixed = [box, soft.clone()].map((x) => (x.index ? x.toNonIndexed() : x));
    expect(mergeGeometries(mixed)).not.toBeNull();
  });
  it("caches by centimetre", () => {
    expect(softGeometry(0.601, 0.14, 0.5)).toBe(softGeometry(0.6, 0.14, 0.5));
  });
});
