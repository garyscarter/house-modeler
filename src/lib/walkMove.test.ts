import { describe, expect, it } from "vitest";
import { builtInHouse, listingSite } from "../houses/default";
import type { HouseModel, Opening, Site } from "../types";
import { pointInPolygon } from "./geometry";
import { GROUND_DROP } from "./site";
import { groundHeightAt } from "./siteItems";
import { floor, rect } from "./testing";
import { MAX_STEP, WALKER_R, buildNav, initialDoors, settle, startPose, stepWalker } from "./walk";
import { doorKey, type WalkPose } from "./walkTypes";

const model = (floors: ReturnType<typeof floor>[]): HouseModel => ({ floors, ceilingHeight: 2.4, slabThickness: 0.2 });
const pose = (x: number, y: number, extra: Partial<WalkPose> = {}): WalkPose => ({ x, y, level: 0, stair: null, feetY: 0, yaw: 0, pitch: 0, ...extra });
const walk = (nav: ReturnType<typeof buildNav>, p: WalkPose, dx: number, dy: number, n: number, doors = {}) => {
  for (let i = 0; i < n; i++) p = stepWalker(nav, p, dx, dy, doors);
  return p;
};

describe("startPose", () => {
  const house = builtInHouse("");
  const site = listingSite();
  const nav = buildNav(house, site, false);

  it("starts outside the front door, in the plot, on the ground, facing the door", () => {
    const s = startPose(nav, { kind: "front" });
    expect(s.level).toBe(0);
    expect(s.stair).toBeNull();
    for (const l of nav.levels) for (const r of l.rooms) expect(pointInPolygon(s, r.poly)).toBe(false);
    expect(pointInPolygon(s, site.boundary)).toBe(true);
    expect(Math.abs(s.feetY - (-GROUND_DROP + groundHeightAt(site, s)))).toBeLessThan(0.05);
    const front = nav.doors.find((d) => d.kind === "front")!;
    const want = Math.atan2(-(front.centre.x - s.x), -(front.centre.y - s.y));
    const diff = Math.abs(Math.atan2(Math.sin(s.yaw - want), Math.cos(s.yaw - want)));
    expect(diff).toBeLessThan((10 * Math.PI) / 180);
    expect(Math.hypot(front.centre.x - s.x, front.centre.y - s.y)).toBeGreaterThan(1.2);
  });

  it("starts in a room at its stand spot, or where asked when that is free", () => {
    const room = nav.levels[1].rooms.find((r) => r.name === "Bedroom 2")!;
    const s = startPose(nav, { kind: "room", level: 1, roomId: room.id });
    expect(s.level).toBe(1);
    expect(s.feetY).toBeCloseTo(nav.levels[1].baseY);
    expect(pointInPolygon(s, room.poly)).toBe(true);
    const at = { x: room.poly[0].x * 0.5 + s.x * 0.5, y: room.poly[0].y * 0.5 + s.y * 0.5 };
    const t = startPose(nav, { kind: "room", level: 1, roomId: room.id, at });
    expect(Math.hypot(t.x - at.x, t.y - at.y)).toBeLessThan(1);
  });

  it("falls back to a spot off the front of a house with no outside door", () => {
    const n = buildNav(model([floor([rect("Room", 0, 0, 400, 300)])]), undefined, false);
    const s = startPose(n, { kind: "front" });
    expect(s.y).toBeGreaterThan(3);
    expect(s.feetY).toBeCloseTo(-GROUND_DROP);
  });
});

describe("stepWalker", () => {
  const room = buildNav(model([floor([rect("Room", 0, 0, 400, 400)])]), undefined, false);

  it("stops at a wall, keeping clear of its face", () => {
    const p = walk(room, pose(2, 2), -0.05, 0, 60);
    expect(p.x).toBeGreaterThanOrEqual(WALKER_R + 0.25 / 2 - 1e-3);
    expect(p.x).toBeLessThan(WALKER_R + 0.25 / 2 + 0.05);
  });

  it("slides along a wall when walking into it at an angle", () => {
    const p = walk(room, pose(0.6, 1.5), -0.05, 0.05, 10);
    expect(p.y - 1.5).toBeGreaterThan(0.25);
    expect(p.x).toBeGreaterThanOrEqual(WALKER_R + 0.125 - 1e-3);
  });

  it("splits a long move so it cannot jump a wall", () => {
    const p = stepWalker(room, pose(2, 2), -5, 0, {});
    expect(p.x).toBeGreaterThanOrEqual(WALKER_R + 0.125 - 1e-3);
  });

  it("is stopped by a shut door and goes through an open one", () => {
    const d: Opening = { id: "d1", kind: "door", x: 300, y: 150, orientation: "v", widthM: 0.8 };
    const n = buildNav(model([floor([rect("A", 0, 0, 300, 300), rect("B", 300, 0, 600, 300)], [d])]), undefined, false);
    const key = doorKey("f0", "d1");
    expect(initialDoors(n)[key]).toBe(false);
    const shut = walk(n, pose(1.5, 1.5), 0.05, 0, 60, { [key]: false });
    expect(shut.x).toBeLessThan(3 - WALKER_R);
    const open = walk(n, pose(1.5, 1.5), 0.05, 0, 60, { [key]: true });
    expect(open.x).toBeGreaterThan(4);
    // Slightly off the doorway's centre line, the jambs steer you through.
    const off = walk(n, pose(1.5, 1.62), 0.05, 0, 60, { [key]: true });
    expect(off.x).toBeGreaterThan(4);
  });

  it("refuses a step up of more than MAX_STEP, but takes a smaller one", () => {
    const site: Site = {
      frontBearing: 180, latitude: 51.5, longitude: 0,
      boundary: [{ x: -6, y: -6 }, { x: 10, y: -6 }, { x: 10, y: 10 }, { x: -6, y: 10 }],
      neighbours: [],
      surfaces: [
        { id: "high", kind: "bed", polygon: [{ x: 6, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 1.5 }, { x: 6, y: 1.5 }], slope: { toward: "back", rise: 0, base: 0.5 } },
        { id: "low", kind: "bed", polygon: [{ x: 6, y: 2.5 }, { x: 8, y: 2.5 }, { x: 8, y: 4 }, { x: 6, y: 4 }], slope: { toward: "back", rise: 0, base: 0.2 } },
      ],
    };
    const n = buildNav(model([floor([rect("Room", 0, 0, 400, 400)])]), site, false);
    const start = (y: number) => pose(5, y, { feetY: -GROUND_DROP });
    const high = walk(n, start(0.75), 0.05, 0, 40);
    expect(high.x).toBeLessThan(6);
    expect(high.feetY).toBeCloseTo(-GROUND_DROP);
    const low = walk(n, start(3.25), 0.05, 0, 50);
    expect(low.x).toBeGreaterThan(7);
    expect(low.feetY).toBeCloseTo(-GROUND_DROP + 0.2);
    // Out of the house and into the garden is a step down of GROUND_DROP; back in is a step up under MAX_STEP.
    expect(GROUND_DROP).toBeLessThan(MAX_STEP);
  });

  it("walks out of the house's garden edge no further than the plot", () => {
    const n = buildNav(model([floor([rect("Room", 0, 0, 400, 400)])]), undefined, false);
    const p = walk(n, pose(-1, 2, { feetY: -GROUND_DROP }), -0.05, 0, 200);
    // No plot: a box 4 m round the house.
    expect(p.x).toBeGreaterThanOrEqual(-4 + WALKER_R - 1e-3);
    expect(p.feetY).toBeCloseTo(-GROUND_DROP);
  });

  it("lets a walker who starts inside a wall move out, but not further in", () => {
    const stuck = pose(0.05, 2);
    const deeper = stepWalker(room, stuck, -0.05, 0, {});
    expect(deeper.x).toBeCloseTo(0.05);
    const out = walk(room, stuck, 0.05, 0, 10);
    expect(out.x).toBeGreaterThan(0.4);
  });
});

describe("settle", () => {
  const house = builtInHouse("");
  const nav = buildNav(house, listingSite(), false);
  const doors = initialDoors(nav);

  it("moves a spot on a wall line to a free one close by", () => {
    // The wall between the two halls (y = 1.16 on the plan).
    const p = settle(nav, pose(0.9, 1.16, { yaw: 1, pitch: 0.2 }), doors);
    expect(Math.hypot(p.x - 0.9, p.y - 1.16)).toBeLessThan(1.5);
    expect(Math.abs(p.y - 1.16)).toBeGreaterThanOrEqual(WALKER_R);
    expect(p).toMatchObject({ yaw: 1, pitch: 0.2, level: 0, stair: null, feetY: 0 });
  });

  it("keeps a free spot, and takes a missing storey to the nearest", () => {
    const hall = nav.levels[0].rooms.find((r) => r.name === "Hallway (front)")!;
    const s = startPose(nav, { kind: "room", level: 0, roomId: hall.id });
    expect(settle(nav, s, doors)).toMatchObject({ x: s.x, y: s.y, level: 0 });
    const up = settle(nav, { ...s, level: 7, feetY: 30 }, doors);
    expect(up.level).toBe(1);
    expect(up.feetY).toBeCloseTo(nav.levels[1].baseY);
  });

  it("clears the stairs unless still on the flight", () => {
    const s = settle(nav, pose(3, -3, { stair: 0, feetY: 1 }), doors);
    expect(s.stair).toBeNull();
    const on = settle(nav, pose(0, -0.5, { stair: 0, feetY: 1 }), doors);
    expect(on.stair).toBe(0);
    expect(on.feetY).toBeGreaterThan(0.5);
  });
});
