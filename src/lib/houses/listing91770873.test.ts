import { describe, expect, it } from "vitest";
import { byId } from "../catalogue";
import { buildWalls, pointInPolygon, roomWorldPolygon, toWorld } from "../geometry";
import { fixtureBox, rectCorners } from "../planMath";
import { planRoofs } from "../roof";
import { surfaceHeightAt } from "../surfaceSlope";
import { listing91770873, listingSite } from "./listing91770873";

const house = listing91770873("");
const ground = house.floors[0];
const first = house.floors[1];

describe("the built-in listing", () => {
  it("has no door between the garage and the hall, and an archway between the living rooms", () => {
    expect(ground.openings.some((o) => o.x === 730 && o.y === 412)).toBe(false);
    const between = ground.openings.find((o) => o.x === 1170 && o.y === 278);
    expect(between).toMatchObject({ kind: "archway", widthM: 2.0 });
  });

  it("puts every opening on a wall", () => {
    for (const f of house.floors) {
      const placed = buildWalls(f).reduce((n, w) => n + w.openings.length, 0);
      expect(placed, f.name).toBe(f.openings.length);
    }
  });

  it("folds the front bedroom's cupboard into the room, door still in a wall", () => {
    expect(first.rooms.some((r) => r.name === "Cupboard")).toBe(false);
    const bedroom = first.rooms.find((r) => r.name === "Bedroom 3")!;
    expect(bedroom.polygon).toHaveLength(6);
    expect(bedroom.dims).toEqual({ w: 3.28, h: 3.36 });
    const door = first.openings.find((o) => o.x === 850 && o.y === 1075)!;
    const wall = buildWalls(first).find((w) => w.openings.some((p) => p.opening === door))!;
    expect(wall.exterior).toBeFalsy();
  });

  it("fits a wardrobe in each of the two bedrooms, backs to the walls and doors to the room", () => {
    const wardrobes = first.fixtures ?? [];
    expect(wardrobes.map((f) => f.type)).toEqual(["wardrobe-shaker", "wardrobe-fitted"]);
    for (const [fx, room, backs] of [
      [wardrobes[0], "Bedroom 2", { x: 1, y: 0 }],
      [wardrobes[1], "Bedroom 3", { x: -1, y: 0 }],
    ] as const) {
      const b = fixtureBox(fx, byId(fx.type)!);
      const poly = roomWorldPolygon(first, first.rooms.find((r) => r.name === room)!);
      for (const c of rectCorners(fx, b.w * first.pxPerM, b.d * first.pxPerM, fx.rot)) {
        expect(pointInPolygon(toWorld(first, c), poly), `${room} ${c.x},${c.y}`).toBe(true);
      }
      // At rot r the back (local -y) points along (sin r, -cos r) on the plan.
      const r = (fx.rot * Math.PI) / 180;
      expect([Math.sin(r), -Math.cos(r)].map((v) => Math.round(v) + 0)).toEqual([backs.x, backs.y]);
      expect(b.h).toBe(house.ceilingHeight);
    }
  });
});

describe("the listing's garden walls", () => {
  it("have brick-on-edge tops without piers, and the drive wall ends under the porch pillar", () => {
    const site = listingSite();
    const edges = site.boundaryEdges ?? [];
    const walls = edges.filter((e) => e.kind === "wall");
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      expect(w.top).toBe("brick");
      expect(w.piers).toBe(false);
    }
    const pillar = planRoofs(house).pillars[0];
    const i = edges.findIndex((e, k) => e.kind === "wall" && site.boundary[k + 1] && Math.abs(site.boundary[k + 1].y - pillar.z) < 0.01);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(Math.abs(site.boundary[i + 1].x - pillar.x)).toBeLessThan(0.15);
  });

  it("has a drive that rises from the pavement to just under the garage door's floor, with the path matching it", () => {
    const site = listingSite();
    const drive = site.surfaces.find((x) => x.kind === "drive")!;
    const path = site.surfaces.find((x) => x.kind === "path")!;
    const floor = 0.26; // the ground floor's finished level above the ground
    expect(surfaceHeightAt(drive, { x: -3, y: 5.5 })).toBeCloseTo(0, 6); // level with the pavement
    const atDoor = surfaceHeightAt(drive, { x: -3, y: 1.16 });
    expect(floor - atDoor).toBeGreaterThanOrEqual(0);
    expect(floor - atDoor).toBeLessThanOrEqual(0.05);
    // Where the path leaves the drive's east edge it is no more than a centimetre off the drive.
    for (const z of [2.6, 3.0, 3.5]) expect(Math.abs(surfaceHeightAt(path, { x: -1.85, y: z }) - surfaceHeightAt(drive, { x: -1.85, y: z }))).toBeLessThan(0.01);
  });
});
