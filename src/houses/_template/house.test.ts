import { describe, expect, it } from "vitest";
import { toWorld } from "../../lib/geometry";
import { floorFlight } from "../../lib/stairs";
import type { Floor, Pt } from "../../types";
import { lintHouse } from "../lint";
import house from "./index";

const model = () => house.presets[house.main].build("");
const bounds = (f: Floor) => {
  const pts: Pt[] = f.rooms.flatMap((r) => r.polygon.map((p) => toWorld(f, p)));
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
};

describe("the template house", () => {
  it("builds its layout and plot", () => {
    const m = model();
    expect(m.floors).toHaveLength(2);
    expect(m.floors[0].rooms.length).toBeGreaterThanOrEqual(5);
    expect(m.floors[1].rooms).toHaveLength(4);
    expect(house.sitePresets[house.site].build().boundary.length).toBeGreaterThanOrEqual(3);
  });

  it("passes the house lint", () => {
    expect(lintHouse(house)).toEqual([]);
  });

  it("registers the first floor over the ground floor, in world metres", () => {
    const [g, f] = model().floors.map(bounds);
    const tol = 0.01;
    expect(f.x0).toBeGreaterThanOrEqual(g.x0 - tol);
    expect(f.x1).toBeLessThanOrEqual(g.x1 + tol);
    expect(f.y0).toBeGreaterThanOrEqual(g.y0 - tol);
    expect(f.y1).toBeLessThanOrEqual(g.y1 + tol);
    // The party wall: both floors end on the same line.
    expect(f.x1).toBeCloseTo(g.x1, 2);
  });

  it("has a winder flight that arrives at the same world point on both floors", () => {
    const m = model();
    const [a, b] = m.floors.map((f) => floorFlight(m, f));
    expect(a).not.toBeNull();
    expect(a!.turn).toBe(1);
    expect(a!.topTurn).toBe(1);
    expect(b!.centre.x).toBeCloseTo(a!.centre.x, 6);
    expect(b!.centre.y).toBeCloseTo(a!.centre.y, 6);
  });

  it("has a cupboard under the stairs with its own door, a canted bay and a party wall", () => {
    const m = model();
    const g = m.floors[0];
    const cupboard = g.rooms.find((r) => r.name === "Cupboard")!;
    expect(cupboard).toBeDefined();
    expect(g.openings.some((o) => o.style === "ledged" && o.x === cupboard.polygon[1].x)).toBe(true);
    expect(g.openings.some((o) => o.kind === "bay")).toBe(true);
    expect(m.exterior?.partyWall).toBe("right");
    expect(house.sitePresets[house.site].build().neighbours.some((n) => n.partySide === "left")).toBe(true);
  });

  it("offers a Proposed layout that knocks the kitchen through to the dining room", () => {
    expect(house.proposed).toBeDefined();
    const main = model().floors[0];
    const proposed = house.presets[house.proposed!].build("").floors[0];
    expect(proposed.rooms).toHaveLength(main.rooms.length - 1);
    expect(proposed.rooms.some((r) => r.name === "Kitchen-diner")).toBe(true);
    expect(proposed.openings.some((o) => o.kind === "archway")).toBe(false);
    expect(house.tiles.some((t) => t.variant === "proposed")).toBe(true);
  });
});
