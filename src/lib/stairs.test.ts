import { describe, expect, it } from "vitest";
import { listing91770873 } from "./houses/listing91770873";
import { polygonArea } from "./geometry";
import { floorFlight, stairHeight, stairTreads, treadCount, WINDERS, type FlightShape } from "./stairs";

const flight = (turn: -1 | 0 | 1): FlightShape => ({ centre: { x: 0, y: 0 }, dir: { x: 0, y: -1 }, run: 2.3, width: 0.9, rise: 2.65, turn });
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

describe("stairHeight", () => {
  it("rises round the winders and on up the straight run without a jump", () => {
    const f = flight(1);
    expect(stairHeight(f, 0.3, 0.45)).toBeCloseTo(0); // the side you step on from
    const atTurn = stairHeight(f, 0.9, 0);
    expect(stairHeight(f, 0.8999, -0.3)).toBeCloseTo(atTurn, 2);
    expect(stairHeight(f, 2.3, 0)).toBeCloseTo(2.65);
  });
});

describe("listing 91770873", () => {
  it("has its ground-floor flight turning at the foot, stepped onto from the hall side", () => {
    const m = listing91770873("");
    const f = floorFlight(m, m.floors.find((x) => x.level === 0)!)!;
    expect(f.turn).toBe(1);
  });
});
