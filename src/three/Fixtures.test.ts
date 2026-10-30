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

  describe("a bulkhead", () => {
    // 2 m by 1 m, 0.3 m deep, centred at world (2, 2); a downlight in its underside.
    const floor = {
      id: "b", name: "B", level: 0, image: "", imageW: 100, imageH: 100, pxPerM: 50, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rooms: [], openings: [],
      fixtures: [
        { id: "k", type: "bulkhead", x: 100, y: 100, rot: 0, w: 2, d: 1, h: 0.3 },
        { id: "d", type: "downlight", x: 75, y: 100, rot: 0, drop: 0.3 },
      ],
    } as unknown as Floor;
    const bounds = (cuts?: { x: number; y: number }[][]) => {
      const box = new THREE.Box3();
      for (const m of buildFixtureMeshes(floor, 2.4, cuts)) {
        if (m.glow) continue;
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!);
      }
      return box;
    };

    it("hangs flush from the ceiling, its underside its height below", () => {
      const b = bounds();
      expect(b.max.y).toBeCloseTo(2.4);
      expect(b.min.y).toBeLessThan(2.1);
    });

    it("is left out over a flight passing up through it", () => {
      const cut = [{ x: 1.8, y: 0 }, { x: 2.2, y: 0 }, { x: 2.2, y: 4 }, { x: 1.8, y: 4 }];
      const meshes = buildFixtureMeshes(floor, 2.4, [cut]).filter((m) => !m.glow && m.key.startsWith("#f3f3f0"));
      expect(meshes).toHaveLength(1);
      const pos = meshes[0].geometry.attributes.position;
      // No vertex of the box inside the cut.
      for (let i = 0; i < pos.count; i++) expect(pos.getX(i) > 1.8 + 1e-6 && pos.getX(i) < 2.2 - 1e-6).toBe(false);
    });

    it("lets a downlight with a drop into its underside: the ring's face at the underside, not the ceiling", () => {
      const ring = buildFixtureMeshes(floor, 2.4).filter((m) => m.key.startsWith("L|#f4f4f2"));
      expect(ring.length).toBeGreaterThan(0);
      for (const m of ring) {
        m.geometry.computeBoundingBox();
        expect(m.geometry.boundingBox!.max.y).toBeCloseTo(2.1, 3);
      }
    });
  });
});
