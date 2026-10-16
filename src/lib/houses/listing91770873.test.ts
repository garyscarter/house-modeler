import { describe, expect, it } from "vitest";
import { byId } from "../catalogue";
import { buildWalls, pointInPolygon, roomWorldPolygon, toWorld } from "../geometry";
import { fixtureBox, rectCorners } from "../planMath";
import { listing91770873 } from "./listing91770873";

const house = listing91770873("");
const ground = house.floors[0];
const first = house.floors[1];

describe("the built-in listing", () => {
  it("has no door between the garage and the hall, and a bi-fold between the living rooms", () => {
    expect(ground.openings.some((o) => o.x === 730 && o.y === 412)).toBe(false);
    const between = ground.openings.find((o) => o.x === 1170 && o.y === 278);
    expect(between).toMatchObject({ kind: "bifold", widthM: 2.0 });
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
