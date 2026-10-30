import { describe, expect, it } from "vitest";
import { builtInHouse, builtInProposed, listingSite } from "../houses/default";
import type { HouseModel } from "../types";
import { floor, rect } from "./testing";
import { buildNav, routeTo, startPose } from "./walk";
import { TOUR_MIN_AREA, planTour } from "./walkTour";
import type { NavWorld, WalkPose } from "./walkTypes";

const SKIP = /cupboard|cpd|store|airing/i;

function checkTour(nav: NavWorld) {
  const all = Object.fromEntries(nav.doors.map((d) => [d.key, true]));
  const start = startPose(nav, { kind: "front" });
  const stops = planTour(nav, start, {});
  // Ground floor first, then up, the garden last.
  const levels = stops.map((s) => s.level);
  const garden = stops[stops.length - 1];
  expect(garden).toMatchObject({ roomId: null, name: "Garden", level: 0 });
  const rooms = stops.slice(0, -1);
  expect(rooms.every((s) => s.roomId !== null)).toBe(true);
  expect(levels.slice(0, -1)).toEqual([...levels.slice(0, -1)].sort((a, b) => a - b));
  // Every stop reachable from the one before, walking with the doors open.
  let from: WalkPose = start;
  for (const s of stops) {
    const r = routeTo(nav, from, { ...s.at, level: s.level, stair: null }, all);
    expect(r.ok, s.name).toBe(true);
    from = { ...from, ...s.at, level: s.level, stair: null, feetY: nav.levels.find((l) => l.level === s.level)!.baseY };
  }
  // Every proper room it can reach, and nothing else.
  for (const l of nav.levels)
    for (const r of l.rooms) {
      const visited = rooms.some((s) => s.roomId === r.id);
      if (r.area < TOUR_MIN_AREA || SKIP.test(r.name)) expect(visited, r.name).toBe(false);
      else if (!visited) expect(routeTo(nav, start, { ...r.poly[0], level: l.level, stair: null }, all).ok, r.name).toBe(false);
    }
  return stops;
}

describe("planTour", () => {
  it("covers every room of the owner's house, ground floor first, the garden last", () => {
    const nav = buildNav(builtInHouse(""), listingSite(), false);
    const stops = checkTour(nav);
    const names = stops.map((s) => s.name);
    // The garage has only its up-and-over door, so the tour passes it by; the small stairs room upstairs is under 1.8 m².
    expect(names).not.toContain("Garage");
    expect(names).not.toContain("Stairs");
    for (const n of ["Hallway (front)", "Kitchen", "Kitchen (galley)", "Living Room (front)", "Living Room (rear)", "Landing", "Bathroom", "Bedroom 1", "Bedroom 2", "Bedroom 3"]) expect(names).toContain(n);
    // Nearest first: from the front door, the front hall.
    expect(names[0]).toBe("Hallway (front)");
    // The garden stop is the lawn behind the house, looking back at it.
    const g = stops[stops.length - 1];
    expect(g.at.y).toBeLessThan(-9);
  });

  it("works on the proposed layout", () => {
    const nav = buildNav(builtInProposed(""), listingSite(), false);
    const stops = checkTour(nav);
    const names = stops.map((s) => s.name);
    for (const n of ["Hallway (front)", "Kitchen", "Living Room (rear)", "Landing", "Bathroom", "Bedroom 1", "Bedroom 2", "Bedroom 3"]) expect(names).toContain(n);
    // Known limit: the new room's door opens off the left of the top winders, which turn right onto the landing.
    // The stairs can only be left by their exit edge, so the walk cannot reach it yet (checkTour has checked it is unreachable).
    expect(names).not.toContain("New Room");
  });

  it("skips cupboards and rooms too small to visit, and has no garden without a plot", () => {
    const model: HouseModel = {
      floors: [floor([rect("Lounge", 0, 0, 400, 400), rect("Cupboard", 400, 0, 600, 200), rect("Nook", 400, 200, 500, 300)], [{ id: "d", kind: "gap", x: 400, y: 100, orientation: "v", widthM: 1.2 }])],
      ceilingHeight: 2.4,
      slabThickness: 0.2,
    };
    const nav = buildNav(model, undefined, false);
    const stops = planTour(nav, startPose(nav, { kind: "room", level: 0, roomId: "Lounge" }), {});
    expect(stops.map((s) => s.name)).toEqual(["Lounge"]);
  });
});
