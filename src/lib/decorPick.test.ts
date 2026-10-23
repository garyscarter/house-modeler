import { describe, expect, it } from "vitest";
import { pickInPlan, pickWallFace, type RoomOutline } from "./decorPick";
import { floor, rect } from "./testing";

const outlines = (rooms: ReturnType<typeof rect>[]): RoomOutline[] => floor(rooms).rooms.map((r) => ({ id: r.id, poly: r.polygon }));

describe("pickInPlan", () => {
  const rooms = outlines([rect("A", 0, 0, 400, 300)]);

  it("a centre tap picks the floor", () => {
    expect(pickInPlan(rooms, { x: 200, y: 150 }, 8)).toEqual({ roomId: "A", edge: null, side: "inside" });
  });

  it("a tap 3 px inside the left edge picks that edge, inside", () => {
    // rect edges: 0 top, 1 right, 2 bottom, 3 left
    expect(pickInPlan(rooms, { x: 3, y: 150 }, 8)).toEqual({ roomId: "A", edge: 3, side: "inside" });
  });

  it("a tap just outside an exterior edge picks it, outside", () => {
    expect(pickInPlan(rooms, { x: 403, y: 150 }, 8)).toEqual({ roomId: "A", edge: 1, side: "outside" });
    expect(pickInPlan(rooms, { x: 200, y: -4 }, 8)).toEqual({ roomId: "A", edge: 0, side: "outside" });
  });

  it("a tap on the edge line itself is outside for an exterior wall", () => {
    expect(pickInPlan(rooms, { x: 400, y: 1000 }, 8)).toBeNull();
    expect(pickInPlan(rooms, { x: 0, y: -0.0001 }, 8)?.side).toBe("outside");
  });

  it("returns null far from every room", () => {
    expect(pickInPlan(rooms, { x: 900, y: 900 }, 8)).toBeNull();
  });

  it("a tap in the gap between two near rooms picks the nearer room's edge, inside", () => {
    const two = outlines([rect("L", 0, 0, 200, 300), rect("R", 204, 0, 400, 300)]);
    const left = pickInPlan(two, { x: 201, y: 150 }, 8);
    expect(left).toEqual({ roomId: "L", edge: 1, side: "inside" });
    const right = pickInPlan(two, { x: 203, y: 150 }, 8);
    expect(right).toEqual({ roomId: "R", edge: 3, side: "inside" });
  });

  it("the later room wins where rooms overlap", () => {
    const two = outlines([rect("L", 0, 0, 200, 300), rect("R", 100, 0, 400, 300)]);
    expect(pickInPlan(two, { x: 150, y: 150 }, 8)?.roomId).toBe("R");
  });
});

describe("pickWallFace", () => {
  const rooms = outlines([rect("A", 0, 0, 4, 3)]);
  const o = { probe: 0.05, through: 0.6, maxDist: 0.5 };

  it("an inward normal picks the inside face", () => {
    // Left wall (edge 3) seen from inside: normal points +x.
    expect(pickWallFace(rooms, { x: 0.1, y: 1.5 }, { x: 1, y: 0 }, o)).toEqual({ roomId: "A", edge: 3, side: "inside" });
  });

  it("an outward normal picks the room behind, outside", () => {
    expect(pickWallFace(rooms, { x: -0.1, y: 1.5 }, { x: -1, y: 0 }, o)).toEqual({ roomId: "A", edge: 3, side: "outside" });
    expect(pickWallFace(rooms, { x: 2, y: 3.1 }, { x: 0, y: 1 }, o)).toEqual({ roomId: "A", edge: 2, side: "outside" });
  });

  it("returns null when the nearest edge is beyond maxDist", () => {
    expect(pickWallFace(rooms, { x: 2, y: 1.5 }, { x: 1, y: 0 }, o)).toBeNull();
  });

  it("returns null for a face with no room on either side, or a zero normal", () => {
    expect(pickWallFace(rooms, { x: 10, y: 10 }, { x: 1, y: 0 }, o)).toBeNull();
    expect(pickWallFace(rooms, { x: 0.1, y: 1.5 }, { x: 0, y: 0 }, o)).toBeNull();
  });
});

describe("pickInPlan: taps exactly on an edge", () => {
  const rooms = outlines([rect("A", 0, 0, 400, 300)]);
  it("is outside on all four sides", () => {
    expect(pickInPlan(rooms, { x: 200, y: 0 }, 8)).toEqual({ roomId: "A", edge: 0, side: "outside" });
    expect(pickInPlan(rooms, { x: 400, y: 150 }, 8)).toEqual({ roomId: "A", edge: 1, side: "outside" });
    expect(pickInPlan(rooms, { x: 200, y: 300 }, 8)).toEqual({ roomId: "A", edge: 2, side: "outside" });
    expect(pickInPlan(rooms, { x: 0, y: 150 }, 8)).toEqual({ roomId: "A", edge: 3, side: "outside" });
  });
});

describe("pickWallFace: junctions and bays", () => {
  const A = { id: "A", poly: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] };
  const B = { id: "B", poly: [{ x: 4, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 3 }, { x: 4, y: 3 }] };
  const o = { probe: 0.05, through: 0.225, maxDist: 0.5 };

  it("picks the wall that was hit, not the nearer partition, beside a junction", () => {
    expect(pickWallFace([A, B], { x: 3.89, y: 0.125 }, { x: 0, y: 1 }, o)).toEqual({ roomId: "A", edge: 0, side: "inside" });
  });

  it("an outside face near an outside corner picks the wall behind it", () => {
    expect(pickWallFace([A], { x: 4.125, y: 0.05 }, { x: 1, y: 0 }, o)).toEqual({ roomId: "A", edge: 1, side: "outside" });
    expect(pickWallFace([A], { x: 0.05, y: -0.125 }, { x: 0, y: -1 }, o)).toEqual({ roomId: "A", edge: 0, side: "outside" });
  });

  it("bay faces resolve to the room's edge", () => {
    const bay03 = { id: "A", poly: [{ x: 1, y: 3 }, { x: 1, y: 3.3 }, { x: 3, y: 3.3 }, { x: 3, y: 3 }] };
    expect(pickWallFace([A], { x: 2, y: 3.25 }, { x: 0, y: -1 }, o)).toBeNull();
    expect(pickWallFace([A], { x: 2, y: 3.25 }, { x: 0, y: -1 }, o, [bay03])).toEqual({ roomId: "A", edge: 2, side: "inside" });
    const bay06 = { id: "A", poly: [{ x: 1, y: 3 }, { x: 1, y: 3.6 }, { x: 3, y: 3.6 }, { x: 3, y: 3 }] };
    expect(pickWallFace([A], { x: 2, y: 3.6 }, { x: 0, y: 1 }, o, [bay06])).toEqual({ roomId: "A", edge: 2, side: "outside" });
  });
});
