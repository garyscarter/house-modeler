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
    const wardrobes = (first.fixtures ?? []).slice(0, 2);
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

  it("closes the front garden on the east with a low brick wall from the house front to the pavement", () => {
    const site = listingSite();
    const edges = site.boundaryEdges ?? [];
    const front = (515 - 430) / 73; // the front living room's wall line
    const k = site.boundary.findIndex((p) => p.x > 5 && Math.abs(p.y - front) < 0.05);
    expect(k).toBeGreaterThan(0);
    // The stretch behind it, along the party wall, stays as it was; the stretch in front is a low wall to the pavement.
    expect(edges[k - 1].kind).toBe("fence");
    expect(edges[k]).toMatchObject({ kind: "wall", height: 0.95 });
    expect(site.boundary[k + 1].y).toBeCloseTo(5.5);
    // On the line the old edge ran along, so the plot is unchanged.
    const [a, b] = [site.boundary[k - 1], site.boundary[k + 1]];
    expect(site.boundary[k].x).toBeCloseTo(a.x + ((b.x - a.x) * (front - a.y)) / (b.y - a.y), 2);
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

describe("Bedroom 1 and bathroom fittings, rear garden beds", () => {
  const fixtures = first.fixtures ?? [];
  const inRoom = (fx: (typeof fixtures)[number], room: string) => {
    const b = fixtureBox(fx, byId(fx.type)!);
    const poly = roomWorldPolygon(first, first.rooms.find((r) => r.name === room)!);
    return rectCorners(fx, b.w * first.pxPerM, b.d * first.pxPerM, fx.rot).every((c) => pointInPolygon(toWorld(first, c), poly));
  };

  it("keeps the Bedroom 1 run and every bathroom fitting inside its room", () => {
    const by = (type: string) => fixtures.filter((f) => f.type === type);
    expect(by("wardrobe-shaker").some((f) => f.color === "#c9d0d8" && inRoom(f, "Bedroom 1"))).toBe(true);
    expect(fixtures.some((f) => f.label === "Fitted desk" && inRoom(f, "Bedroom 1"))).toBe(true);
    for (const type of ["shower", "vanity", "toilet", "towel-rail", "wall-unit"]) {
      const f = by(type);
      expect(f.length, type).toBe(1);
      expect(inRoom(f[0], "Bathroom"), type).toBe(true);
    }
  });

  it("runs the patio out to a raised brick bed with a raised curved planter in front of the doors", () => {
    const { surfaces } = listingSite();
    const patio = surfaces.find((s) => s.kind === "patio")!;
    expect(Math.min(...patio.polygon.map((p) => p.y))).toBeLessThanOrEqual(-9);
    const beds = surfaces.filter((s) => s.kind === "bed");
    expect(beds.length).toBe(2);
    for (const bed of beds) {
      const n = bed.polygon.length;
      const c = bed.polygon.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });
      expect(surfaceHeightAt(bed, c)).toBeGreaterThan(0.2);
    }
  });
});
