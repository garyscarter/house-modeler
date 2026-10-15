import { describe, expect, it } from "vitest";
import type { HouseModel, Opening } from "../types";
import { buildWalkWorld, collisionSegments, displayFloorId, groundY, moveWalker, settleWalker, spawnPoint, stairFlights, type WalkState } from "./walk";
import { floor, rect } from "./testing";
import { listing91770873 } from "./houses/listing91770873";

const op = (kind: Opening["kind"], x: number, y: number, orientation: "h" | "v", widthM: number): Opening => ({
  id: `${kind}${x},${y}`,
  kind,
  x,
  y,
  orientation,
  widthM,
});

/** Two 4 m x 3 m rooms with a door between them, a window and a front door on A, and patio doors out of B. */
function twoRooms(): HouseModel {
  const f = floor(
    [rect("A", 0, 0, 400, 300), rect("B", 400, 0, 800, 300)],
    [op("door", 400, 200, "v", 0.8), op("window", 0, 150, "v", 1.2), op("front", 200, 300, "h", 0.9), op("patio", 800, 150, "v", 2)],
  );
  return { floors: [f], ceilingHeight: 2.4, slabThickness: 0.2 };
}

const at = (x: number, y: number, floorId = "f0"): WalkState => ({ x, y, floorId, flight: -1 });

describe("collision", () => {
  const world = buildWalkWorld(twoRooms(), 1.6);

  it("stops at an internal wall, a body radius plus half the wall from its centre line", () => {
    const st = moveWalker(world, at(2, 1), 3, 0);
    expect(st.x).toBeCloseTo(4 - 0.05 - 0.25, 3);
    expect(st.y).toBeCloseTo(1, 3);
  });

  it("slides along a wall instead of sticking to it", () => {
    const st = moveWalker(world, at(3, 0.6), 1, 0.4);
    expect(st.x).toBeCloseTo(3.7, 3);
    expect(st.y).toBeCloseTo(1.0, 3);
  });

  it("does not tunnel through a wall in one long move", () => {
    const st = moveWalker(world, at(2, 1), 10, 0);
    expect(st.x).toBeLessThan(3.71);
  });

  it("passes through doors and patio doors", () => {
    expect(moveWalker(world, at(3, 2), 2, 0).x).toBeCloseTo(5, 3);
    expect(moveWalker(world, at(7, 1.5), 2, 0).x).toBeCloseTo(9, 3);
  });

  it("is blocked by windows and the closed front door", () => {
    expect(moveWalker(world, at(1, 1.5), -3, 0).x).toBeCloseTo(0.125 + 0.25, 3);
    expect(moveWalker(world, at(2, 2.5), 0, 2).y).toBeCloseTo(3 - 0.125 - 0.25, 3);
  });

  it("lets you step into a canted bay but not out through its glass", () => {
    const f = floor([rect("A", 0, 0, 400, 300)], [op("bay", 200, 300, "h", 2.4)]);
    const w = buildWalkWorld({ floors: [f], ceilingHeight: 2.4, slabThickness: 0.2 }, 1.6);
    // Outer face 0.125 m out, a 0.6 m deep bay, 0.05 m glazing, 0.25 m body.
    expect(moveWalker(w, at(2, 2), 0, 2).y).toBeCloseTo(3 + 0.125 + 0.6 - 0.05 - 0.25, 3);
  });

  it("blocks free-standing walls", () => {
    const f = floor([rect("A", 0, 0, 400, 300)], [], { walls: [{ id: "w", a: { x: 200, y: 0 }, b: { x: 200, y: 200 } }] });
    expect(collisionSegments(f, 2.4).length).toBe(5);
    const w = buildWalkWorld({ floors: [f], ceilingHeight: 2.4, slabThickness: 0.2 }, 1.6);
    expect(moveWalker(w, at(1, 1), 2, 0).x).toBeCloseTo(2 - 0.05 - 0.25, 3);
  });

  it("settles a walker placed inside a wall to one side of it", () => {
    const st = settleWalker(world, at(4.01, 1));
    expect(Math.abs(st.x - 4)).toBeCloseTo(0.3, 3);
  });
});

/** A 3 m x 4 m hall on each floor; a 2.4 m flight up the middle rising towards the top of the plan. */
function twoStoreys(): HouseModel {
  const ground = floor([rect("Hall", 0, 0, 300, 400)], [], { stairs: { x: 150, y: 200 }, stairsDir: "up", stairsLen: 2.4, stairsWidth: 0.9 });
  const first = floor([rect("Landing", 0, 0, 300, 400)], [], { level: 1 });
  return { floors: [ground, first], ceilingHeight: 2.4, slabThickness: 0.2 };
}

describe("stairs", () => {
  const model = twoStoreys();
  const world = buildWalkWorld(model, 1.6);

  it("finds the flight and where its stairwell opens", () => {
    const [f] = stairFlights(model, 1.6);
    expect(f.lowerId).toBe("f0");
    expect(f.upperId).toBe("f1");
    expect(f.dir).toEqual({ x: 0, y: -1 });
    expect(f.rise).toBeCloseTo(2.6);
    // The eye (1.6 m above the treads) stays 0.15 m under the 2.4 m ceiling until the opening.
    expect(f.wellStart).toBeCloseTo(((2.4 - 0.15 - 1.6) / 2.6) * 2.4);
  });

  it("climbs smoothly to the floor above and comes back down", () => {
    const st = at(1.5, 3.5);
    let last = groundY(world, st);
    for (let i = 0; i < 80; i++) {
      moveWalker(world, st, 0, -0.05);
      const g = groundY(world, st);
      expect(g).toBeGreaterThanOrEqual(last - 1e-9);
      // No step bigger than the slope allows for a 5 cm move.
      expect(g - last).toBeLessThan(0.06);
      last = g;
    }
    expect(st.floorId).toBe("f1");
    expect(st.flight).toBe(-1);
    expect(groundY(world, st)).toBeCloseTo(2.6);
    // Stopped by the landing's far wall.
    expect(st.y).toBeCloseTo(0.375, 3);

    for (let i = 0; i < 80; i++) moveWalker(world, st, 0, 0.05);
    expect(st.floorId).toBe("f0");
    expect(groundY(world, st)).toBe(0);
    expect(st.y).toBeCloseTo(4 - 0.375, 3);
  });

  it("reports the nearer end of the flight as the current floor", () => {
    const st = moveWalker(world, at(1.5, 3.5), 0, -1.3);
    expect(st.flight).toBe(0);
    expect(displayFloorId(world, st)).toBe("f0");
    moveWalker(world, st, 0, -1);
    expect(st.flight).toBe(0);
    expect(displayFloorId(world, st)).toBe("f1");
  });

  it("can step onto the bottom treads from the side but not under the rails higher up", () => {
    const low = moveWalker(world, at(0.6, 3.0), 1, 0);
    expect(low.flight).toBe(0);
    const high = moveWalker(world, at(0.6, 2.0), 1, 0);
    expect(high.flight).toBe(-1);
    expect(high.x).toBeCloseTo(1.5 - 0.45 - 0.03 - 0.25, 3);
  });

  it("keeps you out of the stairwell upstairs except from its top end", () => {
    const side = moveWalker(world, at(0.6, 2.0, "f1"), 1, 0);
    expect(side.flight).toBe(-1);
    expect(side.x).toBeLessThan(1.05);
    const foot = moveWalker(world, at(1.5, 3.7, "f1"), 0, -2);
    expect(foot.flight).toBe(-1);
    expect(foot.floorId).toBe("f1");
    expect(groundY(world, foot)).toBeCloseTo(2.6);
  });

  it("starts in the largest room facing a door", () => {
    const { at: p, look } = spawnPoint(twoRooms().floors[0], { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(2);
    expect(p.y).toBeCloseTo(1.5);
    expect(look).toEqual({ x: 4, y: 2 });
  });
});

describe("listing 91770873", () => {
  it("walks from the front hall up the stairs to the landing", () => {
    const model = listing91770873("");
    const [ground, first] = model.floors;
    const world = buildWalkWorld(model, 1.6);
    // In the front hall, below the door into the stairs hall.
    const st = settleWalker(world, at(1.3, 1.6, ground.id));
    moveWalker(world, st, 0, -0.8);
    expect(st.y).toBeLessThan(1);
    // Turn left onto the bottom treads, then climb.
    moveWalker(world, st, -1.3, 0);
    expect(st.flight).toBe(0);
    for (let i = 0; i < 60; i++) moveWalker(world, st, 0, -0.05);
    expect(st.floorId).toBe(first.id);
    expect(groundY(world, st)).toBeCloseTo(model.ceilingHeight + model.slabThickness);
    // Through the opening onto the landing.
    expect(st.y).toBeLessThan(-1.3);
  });
});
