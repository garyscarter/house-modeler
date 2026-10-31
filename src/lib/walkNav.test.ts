import { describe, expect, it } from "vitest";
import { builtInHouse, listingSite } from "../houses/default";
import type { HouseModel, Opening } from "../types";
import { floor, rect } from "./testing";
import { groundHeightAt } from "./siteItems";
import { GROUND_DROP } from "./site";
import { ALL_OPEN, CELL, NONE_OPEN, WALKER_R, boxObs, buildNav, cellAt, crossAt, groundAt, internalOf, obsDist, passable, roomStand, segObsDist } from "./walkNav";
import { doorKey } from "./walkTypes";

const house = builtInHouse("");
const site = listingSite();
const nav = buildNav(house, site, false);
const I = internalOf(nav)!;

const model = (floors: ReturnType<typeof floor>[]): HouseModel => ({ floors, ceilingHeight: 2.4, slabThickness: 0.2 });
const door = (id: string, x: number, y: number, orientation: "h" | "v", widthM: number, kind: Opening["kind"] = "door"): Opening => ({ id, kind, x, y, orientation, widthM });

describe("obstacle maths", () => {
  it("measures a point against a box, outside and inside", () => {
    const o = boxObs({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.1);
    expect(obsDist(o, 1, 0.5)).toBeCloseTo(0.4);
    expect(obsDist(o, 3, 0)).toBeCloseTo(1);
    expect(obsDist(o, 1, 0.05)).toBeCloseTo(-0.05);
  });
  it("measures a segment against a box, and sees crossings", () => {
    const o = boxObs({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.1);
    expect(segObsDist(o, { x: -1, y: 1 }, { x: 3, y: 1 })).toBeCloseTo(0.9);
    expect(segObsDist(o, { x: 1, y: 1 }, { x: 1, y: -1 })).toBeLessThanOrEqual(0);
    expect(crossAt({ x: 1, y: 1 }, { x: 1, y: -1 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0.5);
    expect(crossAt({ x: 3, y: 1 }, { x: 3, y: -1 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });
});

describe("buildNav on the owner's house", () => {
  it("has both storeys, one flight, and its doors all drawn shut", () => {
    expect(nav.levels.map((l) => l.level)).toEqual([0, 1]);
    expect(nav.levels[1].baseY).toBeCloseTo(house.ceilingHeight + house.slabThickness);
    expect(nav.flights).toHaveLength(1);
    expect(nav.flights[0]).toMatchObject({ lowerLevel: 0, upperLevel: 1 });
    const doors = nav.doors.filter((d) => d.passage === "door");
    expect(doors.filter((d) => d.kind === "front")).toHaveLength(1);
    expect(doors.filter((d) => d.kind === "patio")).toHaveLength(1);
    expect(doors.every((d) => d.initial === false)).toBe(true);
    // Gaps and archways are always open; garages and windows are not doors at all.
    expect(nav.doors.filter((d) => d.passage === "open").every((d) => d.initial)).toBe(true);
    expect(nav.doors.some((d) => d.kind === "garage" || d.kind === "window")).toBe(false);
    expect(nav.plot).toEqual(site.boundary);
  });

  it("opens the front door's whole width and only the patio's slider", () => {
    const front = nav.doors.find((d) => d.kind === "front")!;
    expect(front.span[1] - front.span[0]).toBeCloseTo(front.width);
    const patio = nav.doors.find((d) => d.kind === "patio")!;
    expect(patio.span[0]).toBeCloseTo(0);
    expect(patio.span[1]).toBeLessThan(patio.width / 2);
  });

  it("puts the flight's stand spots on free cells beside its entry and exit", () => {
    const F = I.flights[0];
    expect(F.footCell).toBeGreaterThanOrEqual(0);
    expect(F.headCell).toBeGreaterThanOrEqual(0);
    expect(passable(I.levels[0].grid, F.footCell, NONE_OPEN)).toBe(true);
    expect(passable(I.levels[1].grid, F.headCell, NONE_OPEN)).toBe(true);
    // The owner's flight turns at both ends to the right (+x): both stands are off that side.
    expect(nav.flights[0].footStand.x).toBeGreaterThan(0.45);
    expect(nav.flights[0].headStand.x).toBeGreaterThan(0.45);
    // The walking line keeps to the middle of the 0.9 m flight, points at most 0.3 m apart.
    for (let i = 1; i < F.line.length; i++) expect(Math.hypot(F.line[i].x - F.line[i - 1].x, F.line[i].y - F.line[i - 1].y)).toBeLessThanOrEqual(0.3 + 1e-9);
  });

  it("works out the garden height as groundHeightAt does", () => {
    for (let x = -4; x <= 5; x += 0.37) for (let y = -11; y <= 5; y += 0.41) expect(groundAt(I.garden!, { x, y })).toBeCloseTo(groundHeightAt(site, { x, y }), 9);
    const g = I.levels[0].grid;
    const c = cellAt(g, 1.29, -11.1);
    expect(g.kind[c]).toBe(2);
    expect(g.h[c]).toBeCloseTo(-GROUND_DROP + groundHeightAt(site, { x: g.x0 + ((c % g.nx) + 0.5) * CELL, y: g.y0 + (Math.floor(c / g.nx) + 0.5) * CELL }));
  });

  it("blocks garden items by type", () => {
    const g = I.levels[0].grid;
    const at = (x: number, y: number) => cellAt(g, x, y);
    // The conifer's trunk (spread 1 m: r 0.25) and the bin store's footprint block.
    expect(g.blocked[at(-2.2, -10.05)]).toBe(1);
    expect(g.solid[at(-4.06, -6.4)]).toBe(1);
    // The washing line is a single post: half a metre away from it is free.
    expect(g.blocked[at(-1.9 + 0.5, -7.6 + 0.5)]).toBe(0);
  });

  it("is fast enough", () => {
    buildNav(house, site, false);
    const t = performance.now();
    buildNav(house, site, false);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe("under the head of the stairs", () => {
  // The listing's head runs on over the hall/kitchen wall, boxed into the kitchen's bulkhead (underside 2.0 m).
  const F = I.flights[0];
  const under = { x: 0, y: -1.7 };

  it("leaves the kitchen floor free under a head boxed into a bulkhead", () => {
    // Solid from the foot to the wall, where the last straight tread comes down below the bulkhead.
    expect(F.lowTo).toBeGreaterThan(2.3);
    expect(F.lowTo).toBeLessThan(2.45);
    expect(passable(I.levels[0].grid, cellAt(I.levels[0].grid, under.x, under.y), ALL_OPEN)).toBe(true);
  });

  it("keeps it solid where the head has no bulkhead and its soffit hangs low", () => {
    const m = structuredClone(house);
    const ground = m.floors.find((f) => f.level === 0)!;
    ground.fixtures = (ground.fixtures ?? []).filter((x) => x.type !== "bulkhead");
    const I2 = internalOf(buildNav(m, site, false))!;
    expect(I2.flights[0].lowTo).toBeCloseTo(I2.flights[0].f.run);
    expect(passable(I2.levels[0].grid, cellAt(I2.levels[0].grid, under.x, under.y), ALL_OPEN)).toBe(false);
  });
});

describe("buildNav on small floors", () => {
  it("blocks a table and the cells round it, and keeps the rest free", () => {
    const f = floor([rect("Room", 0, 0, 500, 500)], [], { fixtures: [{ id: "t", type: "table-4", x: 250, y: 250, rot: 0, w: 1, d: 1 }] });
    const n = buildNav(model([f]), undefined, false);
    const g = internalOf(n)!.levels[0].grid;
    expect(g.solid[cellAt(g, 2.5, 2.5)]).toBe(1);
    expect(g.blocked[cellAt(g, 2 - WALKER_R / 2, 2.5)]).toBe(1);
    expect(g.blocked[cellAt(g, 1.5, 1.5)]).toBe(0);
    // The house is walled in: the cell just inside the outer wall is blocked, the garden beyond it is free.
    expect(g.blocked[cellAt(g, 0.2, 2.5)]).toBe(1);
    expect(g.kind[cellAt(g, -1, 2.5)]).toBe(2);
  });

  it("marks the cells a shut door covers as passable only while it is open", () => {
    const f = floor([rect("A", 0, 0, 300, 300), rect("B", 300, 0, 600, 300)], [door("d1", 300, 150, "v", 0.8)]);
    const n = buildNav(model([f]), undefined, false);
    const In = internalOf(n)!;
    const g = In.levels[0].grid;
    const c = cellAt(g, 3.0, 1.5);
    expect(g.doorN[c]).toBe(1);
    expect(n.doors[g.doorA[c]].key).toBe(doorKey("f0", "d1"));
    expect(passable(g, c, NONE_OPEN)).toBe(false);
    expect(passable(g, c, ALL_OPEN)).toBe(true);
  });

  it("stands in a room near its centroid with room to move", () => {
    const f = floor([rect("Room", 0, 0, 400, 300)]);
    const In = internalOf(buildNav(model([f]), undefined, false))!;
    const s = roomStand(In, 0, 0)!;
    expect(Math.hypot(s.at.x - 2, s.at.y - 1.5)).toBeLessThan(0.15);
  });
});
