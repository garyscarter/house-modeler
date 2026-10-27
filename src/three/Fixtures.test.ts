import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Fixture, Floor } from "../types";
import { buildFixtureMeshes, softGeometry } from "./Fixtures";

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

describe("buildFixtureMeshes", () => {
  const floorOf = (over: Partial<Fixture> = {}): Floor =>
    ({
      id: "f", name: "F", level: 0, image: "", imageW: 100, imageH: 100, pxPerM: 50, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rooms: [], openings: [],
      fixtures: [
        { id: "p", type: "pendant", x: 100, y: 100, rot: 0, ...over },
        { id: "t", type: "table-lamp", x: 200, y: 100, rot: 0, ...over },
        { id: "s", type: "sofa-3", x: 300, y: 100, rot: 0 },
      ],
    }) as Floor;
  const shape = (floor: Floor) =>
    buildFixtureMeshes(floor, 2.4)
      .map((m) => `${m.key}:${m.geometry.attributes.position.count}`)
      .sort();

  it("builds the same geometry whatever is on, dimmed or warmed", () => {
    const base = shape(floorOf());
    expect(shape(floorOf({ on: false }))).toEqual(base);
    expect(shape(floorOf({ dim: 40, warmth: "warm" as never }))).toEqual(base);
  });
  it("leaves the sofa in shared groups and gives each lamp its own glow groups", () => {
    const meshes = buildFixtureMeshes(floorOf(), 2.4);
    expect(meshes.some((m) => !m.glow && m.material)).toBe(true);
    expect(meshes.filter((m) => m.glow).every((m) => m.key.startsWith("G|") && m.material === undefined)).toBe(true);
    expect(new Set(meshes.filter((m) => m.glow).map((m) => m.glow!.id))).toEqual(new Set(["p", "t"]));
  });
  it("casts no shadow from a lamp's glow meshes", () => {
    for (const m of buildFixtureMeshes(floorOf(), 2.4)) if (m.glow) expect(m.castShadow).toBe(false);
  });
});
