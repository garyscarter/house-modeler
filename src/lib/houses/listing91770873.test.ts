import { describe, expect, it } from "vitest";
import { byId } from "../catalogue";
import { buildWalls, pointInPolygon, roomWorldPolygon, toWorld } from "../geometry";
import { convexOverlap, fixtureBox, fixtureSolids, overlappingIds, rectCorners } from "../planMath";
import { planRoofs } from "../roof";
import { clipSegmentOutside } from "../site";
import { surfaceHeightAt } from "../surfaceSlope";
import { boundaryWallSegments } from "../wallSteps";
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
    expect(bedroom.polygon).toHaveLength(8); // six corners plus the chimney breast's notch
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

describe("the chimney breasts", () => {
  const breastFace = (f: typeof ground, x: number, y0: number, y1: number) =>
    buildWalls(f).filter((w) => Math.abs(w.a.x - w.b.x) < 1e-6 && Math.abs(w.a.x - toWorld(f, { x, y: 0 }).x) < 1e-6 && Math.abs(w.a.y - toWorld(f, { x, y: y0 }).y) < 1e-6 && Math.abs(w.b.y - toWorld(f, { x, y: y1 }).y) < 1e-6);
  const partyX = (f: typeof ground, x: number) => buildWalls(f).filter((w) => Math.abs(w.a.x - w.b.x) < 1e-6 && Math.abs(w.a.x - toWorld(f, { x, y: 0 }).x) < 1e-6);

  it("stand clear of the party wall as walls of their own, the party wall staying on its line", () => {
    // A face nearer the party wall than buildWalls' merge distance would drag the party wall off its line.
    expect(breastFace(ground, 1262, 106, 201)).toHaveLength(1);
    expect(breastFace(first, 1056, 1040, 1103)).toHaveLength(1);
    expect(partyX(ground, 1290).length).toBeGreaterThanOrEqual(2);
    expect(partyX(first, 1075).length).toBeGreaterThanOrEqual(2);
    // The party wall is closed behind each breast, so the house shows no recess from outside.
    expect(breastFace(ground, 1295.5, 106, 201)).toHaveLength(1);
    expect(breastFace(first, 1080.5, 1040, 1103)).toHaveLength(1);
  });

  it("carry the rear living room's gold paper over the breast and both alcoves, and Bedroom 3's mauve only on the party wall and breast", () => {
    const living = ground.rooms.find((r) => r.name === "Living Room (rear)")!;
    expect(Object.keys(living.wallFinishes ?? {}).map(Number)).toEqual([1, 2, 3, 4, 5]);
    // Papered: every edge on the party wall or round the breast (both ends at or east of its face).
    for (let i = 0; i < living.polygon.length; i++) {
      const a = living.polygon[i];
      const b = living.polygon[(i + 1) % living.polygon.length];
      expect(living.wallFinishes?.[i]?.covering, `edge ${i}`).toBe(Math.min(a.x, b.x) >= 1262 ? "rose" : undefined);
    }
    const bedroom = first.rooms.find((r) => r.name === "Bedroom 3")!;
    expect(bedroom.wallPaint).toBe("#e3dce0");
    for (let i = 0; i < bedroom.polygon.length; i++) {
      const a = bedroom.polygon[i];
      const b = bedroom.polygon[(i + 1) % bedroom.polygon.length];
      const east = Math.min(a.x, b.x) >= 1056;
      expect(bedroom.wallFinishes?.[i]?.paint, `edge ${i}`).toBe(east ? "#a68b97" : undefined);
    }
  });

  it("puts the fireplace against the rear living room's breast, facing into the room", () => {
    const fp = (ground.fixtures ?? []).find((f) => f.type === "fireplace")!;
    const b = fixtureBox(fp, byId("fireplace")!);
    // rot 90 turns the back to the east; the back lies on the breast's face (centre line less half a 0.25 m wall).
    expect(fp.rot).toBe(90);
    expect(fp.x + (b.d * ground.pxPerM) / 2).toBeCloseTo(1262 - 0.125 * ground.pxPerM, 0);
    expect(fp.y).toBeGreaterThan(106);
    expect(fp.y).toBeLessThan(201);
  });
});

describe("the kitchen", () => {
  const fixtures = ground.fixtures ?? [];
  const solids = fixtureSolids(fixtures, ground.pxPerM, byId);

  it("fits every unit inside the kitchen or galley without overlaps", () => {
    expect(overlappingIds(solids, 0.5).size).toBe(0);
    const kitchens = ground.rooms.filter((r) => r.name.startsWith("Kitchen")).map((r) => roomWorldPolygon(ground, r));
    for (const s of solids.filter((s) => fixtures.find((f) => f.id === s.id)!.type !== "fireplace"))
      for (const c of s.corners) expect(kitchens.some((poly) => pointInPolygon(toWorld(ground, c), poly)), `${s.id} ${c.x},${c.y}`).toBe(true);
  });

  it("keeps the floor clear in front of the back door and under the doors' swings", () => {
    const low = solids.filter((s) => s.z0 < 1);
    for (const o of ground.openings.filter((o) => o.kind === "door" || o.kind === "front")) {
      // The square the leaf sweeps, on both sides of the wall: the opening less a 50 mm frame each side.
      const half = ((o.widthM - 0.1) * ground.pxPerM) / 2;
      const sweep = o.orientation === "h" ? rectCorners({ x: o.x, y: o.y }, 2 * half, 4 * half, 0) : rectCorners({ x: o.x, y: o.y }, 4 * half, 2 * half, 0);
      for (const s of low) expect(convexOverlap(sweep, s.corners, 0.5), `${o.x},${o.y}`).toBe(false);
    }
  });

  it("runs the sink under the galley window and opens the hatch where the returned units end", () => {
    const sink = fixtures.find((f) => f.type === "sink-unit")!;
    const win = ground.openings.find((o) => o.kind === "window" && o.y === 22 && Math.abs(o.x - sink.x) < 10);
    expect(win).toBeDefined();
    const hatch = ground.openings.find((o) => o.kind === "window" && o.x === 975)!;
    expect(hatch).toMatchObject({ sill: 1.0, head: 1.45 });
    const ret = fixtures.find((f) => f.rot === 90 && f.type === "worktop-run")!;
    const retEnd = ret.y + ((ret.w ?? 0) * ground.pxPerM) / 2;
    // In kitchen-1 the hatch's glazed half starts about where the return ends, at the wall.
    const north = hatch.y - (hatch.widthM * ground.pxPerM) / 2;
    expect(Math.abs(north - retEnd)).toBeLessThan(0.3 * ground.pxPerM);
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

  it("walls the plot all round: no fences or hedges, only the drive left open", () => {
    const site = listingSite();
    const edges = site.boundaryEdges ?? [];
    expect(edges).toHaveLength(site.boundary.length);
    expect(edges.filter((e) => e.kind !== "wall").map((e) => e.kind)).toEqual(["open"]);
  });

  it("carries the drive wall on behind the porch pillar to the garage front, level with its last step", () => {
    const site = listingSite();
    const edges = site.boundaryEdges ?? [];
    const pillar = planRoofs(house).pillars[0];
    const k = site.boundary.findIndex((p) => Math.abs(p.y - pillar.z) < 0.01 && Math.abs(p.x - pillar.x) < 0.15);
    expect(k).toBeGreaterThan(0);
    const drive = boundaryWallSegments(site.boundary, edges[k - 1], k - 1, site.surfaces);
    const behind = boundaryWallSegments(site.boundary, edges[k], k, site.surfaces);
    expect(edges[k]).toMatchObject({ kind: "wall", top: "brick" });
    expect(behind).toHaveLength(1);
    expect(behind[0].top).toBeCloseTo(drive[drive.length - 1].topEnd, 6);
    expect(behind[0].topEnd).toBeCloseTo(behind[0].top, 6);
    // It runs back to the garage front, under the porch.
    expect(site.boundary[k + 1].y).toBeLessThan(pillar.z - 1);
  });

  it("keeps the east neighbour's conservatory clear of the boundary wall beside it, so the wall is drawn", () => {
    const site = listingSite();
    const k = site.boundary.findIndex((p, i) => i > 0 && p.x > 5 && p.y < -9);
    const a = site.boundary[k];
    const b = site.boundary[k + 1];
    expect(site.boundaryEdges![k]).toMatchObject({ kind: "wall", height: 1.4 });
    // Site.tsx stops a wall within 0.12 m of a building.
    expect(clipSegmentOutside(a, b, site.neighbours.map((n) => n.polygon), 0.12)).toEqual([[0, 1]]);
  });

  it("closes the front garden on the east with a low brick wall from the house front to the pavement", () => {
    const site = listingSite();
    const edges = site.boundaryEdges ?? [];
    const front = (515 - 430) / 73; // the front living room's wall line
    const k = site.boundary.findIndex((p) => p.x > 5 && Math.abs(p.y - front) < 0.05);
    expect(k).toBeGreaterThan(0);
    // The stretch behind it runs along the party wall; the stretch in front is a low wall to the pavement.
    expect(edges[k - 1].kind).toBe("wall");
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

  it("runs the patio out to a raised brick bed, with a raised curved planter in front of the doors and a shrub bed along the west wall", () => {
    const { surfaces } = listingSite();
    const patio = surfaces.find((s) => s.kind === "patio")!;
    expect(Math.min(...patio.polygon.map((p) => p.y))).toBeLessThanOrEqual(-9);
    const beds = surfaces.filter((s) => s.kind === "bed");
    expect(beds.length).toBe(3);
    // The shrubs stand in a bed against the west wall, not on the boundary.
    expect(beds.some((b) => b.polygon.every((p) => p.x < -3.5 && p.y < -6.9 && p.y > -9.7))).toBe(true);
    for (const bed of beds) {
      const n = bed.polygon.length;
      const c = bed.polygon.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });
      expect(surfaceHeightAt(bed, c)).toBeGreaterThan(0.2);
    }
  });
});
