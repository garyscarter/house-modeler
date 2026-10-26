import { describe, expect, it } from "vitest";
import type { HouseModel, Opening, Site } from "../types";
import { floor, rect } from "./testing";
import { prismBlocks, rectPoly, type Prism } from "./site";
import { occludersFor, compareRooms, glazingPoints, roomSunHours, sunSamples, sunlightFor, sunlightKey, type SunSample, type SunlightResult } from "./sunlight";
import { dayOfYear } from "./sun";

const win = (id: string, x: number, y: number, orientation: "h" | "v", extra: Partial<Opening> = {}): Opening => ({
  id,
  kind: "window",
  x,
  y,
  orientation,
  widthM: 1.2,
  ...extra,
});
const model = (floors: HouseModel["floors"]): HouseModel => ({ floors, ceilingHeight: 2.4, slabThickness: 0.2 });
const sample = (dx: number, dy: number, altDeg: number, t = 12): SunSample => ({ dx, dy, tan: Math.tan((altDeg * Math.PI) / 180), t });
// frontBearing 180: +z (the front of the plan) faces south.
const SOUTH = { dx: 0, dy: 1 };

const front = () => model([floor([rect("Room", 0, 0, 400, 400)], [win("w", 200, 400, "h")])]);
const block = (y0: number, y1: number, height: number): Prism => ({ poly: rectPoly(-5, y0, 9, y1), height });

describe("room sun hours", () => {
  it("lights a south window with a south sun unless a tall block is in front", () => {
    const s = [sample(SOUTH.dx, SOUTH.dy, 30)];
    expect(roomSunHours(front(), [], s)[0].hours).toBe(0.25);
    expect(roomSunHours(front(), [block(6, 6.2, 10)], s)[0].hours).toBe(0);
  });

  it("gets nothing from a sun behind the wall", () => {
    expect(roomSunHours(front(), [], [sample(0, -1, 30)])[0].hours).toBe(0);
  });

  it("lists rooms without windows", () => {
    const m = model([floor([rect("Hall", 0, 0, 400, 400)])]);
    const r = roomSunHours(m, [], [sample(0, 1, 30)]);
    expect(r).toHaveLength(1);
    expect(r[0].windows).toBe(0);
    expect(r[0].hours).toBe(0);
  });

  it("gives an east window all its sun before solar noon", () => {
    const m = model([floor([rect("Room", 0, 0, 400, 400)], [win("w", 400, 200, "v")])]);
    const site = { latitude: 51.45, longitude: -2.6, frontBearing: 180 };
    const samples = sunSamples(site, 2026, dayOfYear(2026, 3, 21));
    const r = roomSunHours(m, [], samples)[0];
    expect(r.hours).toBeGreaterThan(3);
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0][1]).toBeLessThanOrEqual(12.3);
    expect(r.spans[0][0]).toBeLessThan(8);
  });

  it("lets a high sun reach a first-floor window over a wall but not a low one", () => {
    const m = model([
      floor([rect("Lounge", 0, 0, 400, 400)], [], { level: 0, id: "g" }),
      floor([rect("Bedroom", 0, 0, 400, 400)], [win("w", 200, 400, "h")], { level: 1, id: "u" }),
    ]);
    const wall = block(7, 7.2, 8);
    const up = (alt: number) => roomSunHours(m, [wall], [sample(0, 1, alt)]).find((r) => r.name === "Bedroom")!.hours;
    expect(up(60)).toBe(0.25);
    expect(up(30)).toBe(0);
  });

  it("puts glazing points outside the wall, facing out", () => {
    const pts = glazingPoints(front());
    expect(pts).toHaveLength(6);
    for (const g of pts) {
      expect(g.ny).toBeCloseTo(1);
      expect(g.p.y).toBeGreaterThan(4.2);
    }
  });
});

describe("raised prisms", () => {
  it("does not block a ray passing under a raised base", () => {
    const roof: Prism = { poly: rectPoly(2, -1, 3, 1), height: 4, base: 3 };
    const tan = 0.5;
    expect(prismBlocks({ x: 0, y: 0 }, 1, 0, tan, roof)).toBe(false);
    expect(prismBlocks({ x: 0, y: 0 }, 1, 0, tan, { ...roof, base: 0 })).toBe(true);
    // Starting higher, the same ray meets the block.
    expect(prismBlocks({ x: 0, y: 0 }, 1, 0, tan, roof, 2.5)).toBe(true);
  });
});

describe("compareRooms", () => {
  const r = (roomId: string, name: string, hours: number, floorId = "f0"): SunlightResult["rooms"][number] => ({
    roomId,
    floorId,
    name,
    floorName: "Ground",
    windows: 1,
    hours,
    lit: [],
    spans: [],
  });
  const res = (...rooms: SunlightResult["rooms"]): SunlightResult => ({ day: 80, sunrise: 6, sunset: 18, rooms });

  it("matches by id, then name, keeping rooms in only one layout", () => {
    const a = res(r("a", "Kitchen", 2), r("b", "Lounge", 3), r("c", "Study", 1));
    const b = res(r("a", "Kitchen diner", 4), r("x", "Lounge", 5), r("z", "Utility", 1));
    const out = compareRooms(a, b);
    expect(out.map((o) => [o.name, o.current, o.proposed])).toEqual([
      ["Kitchen", 2, 4],
      ["Lounge", 3, 5],
      ["Study", 1, undefined],
      ["Utility", undefined, 1],
    ]);
  });
});

describe("sunlightKey", () => {
  const site: Site = { frontBearing: 180, latitude: 51.45, longitude: -2.6, boundary: rectPoly(-5, -5, 9, 12), neighbours: [], surfaces: [] };
  const base = () => model([floor([rect("Room", 0, 0, 400, 400)], [win("w", 200, 400, "h")])]);

  it("changes when a tree is added or moved, not when a seat colour changes", () => {
    const m = base();
    const k = sunlightKey(m, site);
    const tree = { ...site, items: [{ id: "t", type: "silver-birch", x: 2, y: -2, rot: 0 }] };
    const k1 = sunlightKey(m, tree);
    expect(k1).not.toBe(k);
    expect(sunlightKey(m, { ...tree, items: [{ ...tree.items[0], x: 3 }] })).not.toBe(k1);
    expect(sunlightKey(m, { ...tree, items: [...tree.items, { id: "d", type: "dining-6", x: 5, y: 5, rot: 0, color: "#ff0000" }] })).toBe(k1);
  });

  it("adds the garden's shade to the occluders", () => {
    const tree = { ...site, items: [{ id: "t", type: "silver-birch", x: 2, y: -2, rot: 0 }] };
    expect(occludersFor(base(), tree).length).toBe(occludersFor(base(), site).length + 1);
  });

  it("ignores colours and images, but not an opening moving", () => {
    const k = sunlightKey(base(), site);
    const m1 = base();
    m1.floors[0].rooms[0].color = "#ff0000";
    m1.floors[0].image = "data:image/png;base64,AAAA";
    expect(sunlightKey(m1, site)).toBe(k);
    const m2 = base();
    m2.floors[0].openings[0].x = 250;
    expect(sunlightKey(m2, site)).not.toBe(k);
  });
});

describe("sunlightFor", () => {
  it("returns room and garden figures for a day", () => {
    const site: Site = { frontBearing: 180, latitude: 51.45, longitude: -2.6, boundary: rectPoly(-5, -8, 9, 12), neighbours: [], surfaces: [] };
    const res = sunlightFor(front(), site, 2026, dayOfYear(2026, 3, 21));
    expect(res.rooms[0].hours).toBeGreaterThan(3);
    expect(res.garden!.share2h).toBeGreaterThan(0.3);
    expect(res.garden!.share2h).toBeLessThanOrEqual(1);
  });
});
