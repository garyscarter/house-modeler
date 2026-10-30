import { describe, expect, it } from "vitest";
import { builtInHouse } from "../houses/default";
import { pointInPolygon, polygonArea, roomWorldPolygon, toWorld } from "./geometry";
import { boxedIn, boxedPart, clipUnderFlight, flightAt, flightBlocks, flightFootprint, flightWinders, floorFlight, LINING, SOFFIT, stairHeight, stairTreads, treadCount, WALL_UNDER_TREAD, WINDERS, type FlightShape } from "./stairs";
import { splitConvex } from "./bulkhead";
import type { Floor } from "../types";

const flight = (turn: -1 | 0 | 1): FlightShape => ({ centre: { x: 0, y: 0 }, dir: { x: 0, y: -1 }, run: 2.3, width: 0.9, rise: 2.65, turn });
/** A flight turned at both ends, like the listing's: 3.3 m, rising up the plan (-y), so +l is +x. */
const both = (topTurn: -1 | 1 = 1, topWinders?: number): FlightShape => ({ centre: { x: 0, y: 0 }, dir: { x: 0, y: -1 }, run: 3.3, width: 0.9, rise: 2.65, turn: 1, topTurn, topWinders });
const area = (pts: { x: number; y: number }[]) => Math.abs(polygonArea(pts));

describe("stairTreads", () => {
  it("climbs evenly to the floor above", () => {
    for (const turn of [0, 1, -1] as const) {
      const t = stairTreads(flight(turn));
      expect(t).toHaveLength(treadCount(flight(turn)));
      expect(t[t.length - 1].top).toBeCloseTo(2.65);
      t.forEach((tr, i) => expect(tr.top).toBeCloseTo(((i + 1) * 2.65) / t.length));
    }
  });

  it("covers the whole flight, with three winders filling the square at a turned foot", () => {
    const f = flight(1);
    const t = stairTreads(f);
    const winders = t.slice(0, WINDERS).reduce((s, tr) => s + area(tr.pts), 0);
    expect(winders).toBeCloseTo(0.9 * 0.9);
    expect(t.reduce((s, tr) => s + area(tr.pts), 0)).toBeCloseTo(2.3 * 0.9);
  });

  it("starts the winders on the side you step on from", () => {
    // Rising up the plan (-y), +l is to the right (+x): the first winder's front edge lies along x = +0.45.
    const right = stairTreads(flight(1))[0].pts;
    const left = stairTreads(flight(-1))[0].pts;
    expect(right.filter((p) => Math.abs(p.x - 0.45) < 1e-9)).toHaveLength(2);
    expect(left.filter((p) => Math.abs(p.x + 0.45) < 1e-9)).toHaveLength(2);
  });
});

describe("a flight whose head winds onto the landing", () => {
  it("keeps every riser the same, with one riser more than treads (the step off onto the landing)", () => {
    for (const k of [2, 3]) {
      const f = both(1, k);
      const n = treadCount(f);
      const t = stairTreads(f);
      expect(t).toHaveLength(n - 1);
      t.forEach((tr, i) => expect(tr.top).toBeCloseTo(((i + 1) * 2.65) / n));
      expect(2.65 - t[t.length - 1].top).toBeCloseTo(2.65 / n);
    }
    // The listing's flight: 3 foot winders, 7 straight treads, 2 head winders and the step off: 13 risers of about 204 mm.
    expect(treadCount(both())).toBe(13);
    expect(2.65 / treadCount(both())).toBeGreaterThan(0.19);
    expect(2.65 / treadCount(both())).toBeLessThan(0.22);
  });

  it("adds the head's winders without changing a flight that arrives straight", () => {
    expect(treadCount({ ...flight(1), topTurn: 0 })).toBe(treadCount(flight(1)));
    expect(stairTreads({ ...flight(1), topTurn: 0 })).toEqual(stairTreads(flight(1)));
  });

  it("fills the run: foot square, straight goings, head square", () => {
    for (const k of [2, 3]) {
      const f = both(1, k);
      const t = stairTreads(f);
      expect(t.reduce((s, tr) => s + area(tr.pts), 0)).toBeCloseTo(3.3 * 0.9);
      const head = t.slice(-k);
      expect(head.reduce((s, tr) => s + area(tr.pts), 0)).toBeCloseTo(0.9 * 0.9);
      // Straight treads share what is left of the run between the two squares.
      const straight = t.slice(WINDERS, t.length - k);
      const going = straight.map((tr) => Math.max(...tr.pts.map((p) => p.y)) - Math.min(...tr.pts.map((p) => p.y)));
      expect(going.reduce((s, g) => s + g, 0)).toBeCloseTo(3.3 - 2 * 0.9);
      going.forEach((g) => expect(g).toBeCloseTo(going[0]));
      expect(going[0]).toBeGreaterThan(0.2);
      expect(going[0]).toBeLessThan(0.25);
    }
  });

  it("fans the head's winders from the newel on the side it turns to, the last stepped off along that side", () => {
    // Top of the run is y = -1.65; the head square is y -1.65..-0.75.
    const right = stairTreads(both(1));
    const [w1, w2] = right.slice(-2);
    const newel = { x: 0.45, y: -0.75 };
    for (const w of [w1, w2]) expect(w.pts.some((p) => Math.hypot(p.x - newel.x, p.y - newel.y) < 1e-9)).toBe(true);
    // Two winders split the square on its diagonal: the first takes the corner by the straight run, the second the step-off side.
    expect(area(w1.pts)).toBeCloseTo(0.405);
    expect(area(w2.pts)).toBeCloseTo(0.405);
    expect(w2.pts.filter((p) => Math.abs(p.x - 0.45) < 1e-9)).toHaveLength(2);
    expect(w1.pts.filter((p) => Math.abs(p.x - 0.45) < 1e-9)).toHaveLength(1);
    // Turning left mirrors it.
    const left = stairTreads(both(-1)).slice(-1)[0];
    expect(left.pts.filter((p) => Math.abs(p.x + 0.45) < 1e-9)).toHaveLength(2);
  });

  it("rises round the head without a jump, reaching the floor above where you step off", () => {
    const f = both();
    const s1 = 3.3 - 0.9;
    for (const l of [-0.3, 0, 0.3]) expect(stairHeight(f, s1 + 1e-4, l)).toBeCloseTo(stairHeight(f, s1 - 1e-4, l), 3);
    expect(stairHeight(f, 3.0, 0.45)).toBeCloseTo(2.65);
    const along = [2.5, 2.8, 3.1, 3.3].map((s) => stairHeight(f, s, -0.45));
    along.slice(1).forEach((h, i) => expect(h).toBeGreaterThan(along[i]));
    expect(stairHeight(f, 0, 0.45)).toBeCloseTo(0);
  });

  it("draws both sets of winders on the plan, in any units", () => {
    // Image px, 73 px/m: the winders depend only on the width.
    const px = flightWinders({ centre: { x: 865, y: 393.5 }, dir: { x: 0, y: -1 }, run: 3.3 * 73, width: 0.9 * 73, turn: 1, topTurn: 1 });
    expect(px).toHaveLength(WINDERS + 2);
    expect(px.reduce((s, p) => s + area(p), 0)).toBeCloseTo(2 * (0.9 * 73) ** 2);
    expect(Math.min(...px.flat().map((p) => p.y))).toBeCloseTo(393.5 - (3.3 * 73) / 2);
  });
});

describe("stairHeight", () => {
  it("rises round the winders and on up the straight run without a jump", () => {
    const f = flight(1);
    expect(stairHeight(f, 0.3, 0.45)).toBeCloseTo(0); // the side you step on from
    const atTurn = stairHeight(f, 0.9, 0);
    expect(stairHeight(f, 0.8999, -0.3)).toBeCloseTo(atTurn, 2);
    expect(stairHeight(f, 2.3, 0)).toBeCloseTo(2.65);
  });
});

describe("clipUnderFlight", () => {
  const f = both();
  const treads = stairTreads(f);
  const riser = 2.65 / treadCount(f);
  const wall = (y: number) => [{ a: { x: -2, y }, b: { x: 2, y }, y0: 0, y1: 2.4 }];

  it("tops a wall the flight passes over off under its treads, and leaves the rest of it", () => {
    // Across the run 2.3 m up from the foot (y = 1.65 - 2.3).
    const y = 1.65 - 2.3;
    const out = clipUnderFlight(wall(y), f, 0.1);
    expect(out).toHaveLength(3);
    const under = out.find((p) => Math.abs(p.a.x + 0.45 - 0.02) < 1e-6)!;
    expect(under.b.x).toBeCloseTo(0.43);
    const over = treads.filter((t) => pointInPolygon({ x: 0, y }, t.pts))[0];
    // Just under the surface of the tread over it, inside its block.
    expect(under.y1).toBeCloseTo(over.top - WALL_UNDER_TREAD);
    expect(under.y1).toBeGreaterThan(over.top - riser);
    expect(under.y1).toBeLessThan(2.4);
    expect(out.filter((p) => p.y1 === 2.4)).toHaveLength(2);
  });

  it("leaves a wall the foot stands against, or one beside the flight, alone", () => {
    expect(clipUnderFlight(wall(1.65), f, 0.1)).toEqual(wall(1.65));
    const side = [{ a: { x: 0.5, y: 2 }, b: { x: 0.5, y: -2 }, y0: 0, y1: 2.4 }];
    expect(clipUnderFlight(side, f, 0.1)).toEqual(side);
  });
});

describe("the built-in house", () => {
  const m = builtInHouse("");
  const ground = m.floors.find((x) => x.level === 0)!;
  const first = m.floors.find((x) => x.level === 1)!;
  const f = floorFlight(m, ground)!;
  const room = (name: string) => roomWorldPolygon(first, first.rooms.find((r) => r.name === name)!);

  it("has its ground-floor flight turning at the foot, stepped onto from the hall side", () => {
    expect(f.turn).toBe(1);
  });

  it("winds its head right, onto the landing, with two winders", () => {
    expect(f.topTurn).toBe(1);
    expect(stairTreads(f)).toHaveLength(treadCount(f) - 1);
    expect(stairTreads(f).slice(-2).every((t) => t.top < f.rise)).toBe(true);
    // The head fills the landing's west end, up to its north wall (inner face about plan y 1044), less the 4 cm
    // that puts the riser onto the head winders inside the kitchen/hall wall below.
    const top = flightAt(f, f.run, 0);
    const landing = room("Landing");
    expect(top.y).toBeGreaterThan(Math.min(...landing.map((p) => p.y)));
    expect(top.y - Math.min(...landing.map((p) => p.y))).toBeLessThan(0.13);
    // Stepping off the side it turns to lands on the landing, clear of the head.
    const off = flightAt(f, f.run - 0.45, 0.45 + 0.3);
    expect(pointInPolygon(off, landing)).toBe(true);
    // The straight flight below the head is in the stairs room.
    expect(pointInPolygon(flightAt(f, f.run - 1.2, 0), room("Stairs"))).toBe(true);
  });

  it("is boxed in down to the floor only over the stairs hall; its head over the kitchen has just a soffit", () => {
    const part = boxedPart(ground, f);
    const treads = stairTreads(f);
    const wallZ = (345 - 430) / 73;
    // The foot and the lower treads: whole.
    for (const t of treads.slice(0, 6)) expect(part(t.pts)).toBe(t.pts);
    // The head's winders are over the kitchen.
    for (const t of treads.slice(-2)) expect(part(t.pts)).toBeNull();
    // The tread that straddles the kitchen wall is cut at the wall line.
    const straddle = treads.find((t) => Math.min(...t.pts.map((p) => p.y)) < wallZ - 1e-6 && Math.max(...t.pts.map((p) => p.y)) > wallZ + 1e-6)!;
    const cut = part(straddle.pts)!;
    expect(Math.min(...cut.map((p) => p.y))).toBeCloseTo(wallZ);
    expect(area(cut)).toBeLessThan(area(straddle.pts));
    expect(boxedIn(ground, f)(flightAt(f, f.run - 0.45, 0))).toBe(false);
  });

  it("draws the same flight on the first floor's plan", () => {
    const up = floorFlight(m, first)!;
    expect(up.centre.x).toBeCloseTo(f.centre.x);
    expect(up.centre.y).toBeCloseTo(f.centre.y);
    expect([up.run, up.width, up.turn, up.topTurn]).toEqual([f.run, f.width, f.turn, f.topTurn]);
    expect(toWorld(first, first.stairs!).y).toBeCloseTo(toWorld(ground, ground.stairs!).y);
  });

  it("opens the stairs room onto the landing across the whole flight", () => {
    const gap = first.openings.find((o) => o.kind === "gap")!;
    expect(gap.widthM).toBeGreaterThanOrEqual(1.05);
  });
});

describe("flightBlocks", () => {
  // `both()` rises up the plan from y 1.65 to -1.65 (world metres = px / 100); a hall holds its foot, and a
  // wall at y -0.65 (s 2.3) parts it from a kitchen the top straight tread and the head run on over.
  const f = both();
  const rect = (name: string, x0: number, y0: number, x1: number, y1: number) => ({ id: name, name, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
  const floor = {
    id: "g", name: "G", level: 0, image: "", imageW: 400, imageH: 400, pxPerM: 100, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 },
    rooms: [rect("Hall", -100, -65, 100, 170), rect("Kitchen", -100, -200, 100, -65)], openings: [],
  } as unknown as Floor;
  const kitchenSide = [{ x: -1, y: -2 }, { x: 1, y: -2 }, { x: 1, y: -0.7 }, { x: -1, y: -0.7 }];
  /** A bulkhead over the kitchen side of the wall (from its face, y -0.7), its underside at `bottom`. */
  const bulkhead = (bottom: number) => [{ pts: [{ x: -1, y: -1.7 }, { x: 1, y: -1.7 }, { x: 1, y: -0.7 }, { x: -1, y: -0.7 }], bottom }];
  const over = (pts: { x: number; y: number }[], region: { x: number; y: number }[]) => !!splitConvex(pts, region).inside;

  it("hangs a soffit under the treads over the other room when nothing covers them", () => {
    const { body } = flightBlocks(floor, f);
    const soffits = body.filter((b) => over(b.pts, kitchenSide) && Math.abs(b.y1 - b.y0 - SOFFIT) < 1e-9);
    expect(soffits.length).toBeGreaterThan(0);
  });

  it("draws no soffit under a bulkhead: the flight is boxed down to its underside, and nothing of it shows below", () => {
    const B = 2.0;
    const { body, carpet } = flightBlocks(floor, f, bulkhead(B));
    // Inside the bulkhead (less a centimetre at its edges, where the riser's lining closes it down to the wall).
    const inner = [{ x: -0.99, y: -1.69 }, { x: 0.99, y: -1.69 }, { x: 0.99, y: -0.71 }, { x: -0.99, y: -0.71 }];
    for (const b of [...body, ...carpet].filter((b) => over(b.pts, inner))) expect(b.y0).toBeGreaterThanOrEqual(B - 1e-9);
    expect(body.some((b) => over(b.pts, inner) && Math.abs(b.y1 - b.y0 - SOFFIT) < 1e-9)).toBe(false);
    // The tread straddling the wall (top 2.04, its block from 1.83) is cut off at the underside under a painted lining.
    const t10 = stairTreads(f)[9];
    expect(t10.top).toBeGreaterThan(B);
    expect(body.some((b) => over(b.pts, inner) && b.y0 === B && b.y1 === B + LINING)).toBe(true);
    // The head winders above the underside are boxed down to it.
    const riser = f.rise / treadCount(f);
    const head = stairTreads(f).at(-1)!;
    expect(body.some((b) => b.y0 === B && Math.abs(b.y1 - (head.top - riser)) < 1e-9)).toBe(true);
  });

  it("lines a covered tread's riser below the underside where it rises from a tread outside the bulkhead", () => {
    // A bulkhead reaching back over the wall into the hall, so the riser onto the head (s 2.4, y -0.75) is under it.
    const B = 2.1;
    const treads = stairTreads(f);
    const first = treads[10];
    const under = first.top - f.rise / treadCount(f);
    expect(under).toBeLessThan(B);
    const { body, carpet } = flightBlocks(floor, f, [{ pts: [{ x: -1, y: -1.7 }, { x: 1, y: -1.7 }, { x: 1, y: -0.76 }, { x: -1, y: -0.76 }], bottom: B }]);
    const lining = body.find((b) => Math.abs(b.y0 - (under - 0.005)) < 1e-9 && b.y1 === B);
    const face = carpet.find((b) => Math.abs(b.y0 - under) < 1e-9 && b.y1 === B + LINING);
    expect(lining && face).toBeTruthy();
    // Both thin strips along the riser line.
    for (const b of [lining!, face!]) expect(Math.max(...b.pts.map((p) => p.y)) - Math.min(...b.pts.map((p) => p.y))).toBeLessThan(0.006);
  });

  it("draws a tread whose surface is below the bulkhead's underside as it is (it cannot be boxed in)", () => {
    const B = 2.3;
    const t10 = stairTreads(f)[9];
    expect(t10.top).toBeLessThan(B);
    const { carpet } = flightBlocks(floor, f, bulkhead(B));
    expect(carpet.some((b) => over(b.pts, kitchenSide) && b.y1 === t10.top && b.y0 < B)).toBe(true);
  });

  it("has a footprint of run by width", () => {
    expect(Math.abs(polygonArea(flightFootprint(f)))).toBeCloseTo(3.3 * 0.9);
  });
});
