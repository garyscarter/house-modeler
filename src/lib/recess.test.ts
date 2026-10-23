import { describe, expect, it } from "vitest";
import type { Fixture } from "../types";
import { byId } from "./catalogue";
import { listing91770873 } from "./houses/listing91770873";
import { defaultFit, fitProblem, fitRecess, fitWindow, floorFaces, refitFixture } from "./recess";
import { floor, rect } from "./testing";

const listing = listing91770873("").floors[0];
const alcove = byId("built-in-alcove")!;
const seat = byId("window-seat")!;
const near = (a: number | undefined, b: number, tol: number) => expect(Math.abs((a ?? NaN) - b)).toBeLessThanOrEqual(tol);

describe("fitRecess on the listing", () => {
  it("fits the north alcove", () => {
    const f = fitRecess(listing, { x: 1270, y: 60 })!;
    expect(f.sides).toBe(2);
    expect(f.rot).toBe(90);
    near(f.w, 0.901, 0.002);
    near(f.d, 0.387, 0.002);
    near(f.depth, 0.387, 0.002);
    near(f.x, 1266.77, 0.2);
    near(f.y, 64, 0.2);
  });
  it("fits the south alcove", () => {
    const f = fitRecess(listing, { x: 1270, y: 240 })!;
    expect(f.sides).toBe(2);
    expect(f.rot).toBe(90);
    near(f.w, 0.88, 0.002);
    near(f.y, 242.24, 0.2);
  });
  it("still backs onto the party wall near the alcove's rear wall", () => {
    const f = fitRecess(listing, { x: 1262, y: 35 })!;
    expect(f.rot).toBe(90);
    expect(f.sides).toBe(2);
  });
  it("returns null in the middle of a large room", () => {
    expect(fitRecess(floor([rect("A", 0, 0, 800, 800)]), { x: 400, y: 400 })).toBeNull();
  });
});

describe("fitRecess on simple rooms", () => {
  it("fills a narrow room and keeps the default depth when it is deep", () => {
    const f = floor([rect("A", 0, 0, 250, 300)]);
    const r = fitRecess(f, { x: 125, y: 30 }, { defaultW: 0.6, defaultD: 0.4 })!;
    expect(r.sides).toBe(2);
    expect(r.rot).toBe(0);
    near(r.w, 2.25, 0.01);
    near(r.d, 0.4, 0.001);
    near(r.y, 12.5 + 20, 0.5);
  });
  it("uses only the nearer side of a wide wall", () => {
    const f = floor([rect("A", 0, 0, 400, 300)]);
    const r = fitRecess(f, { x: 100, y: 30 }, { defaultW: 0.6, defaultD: 0.4 })!;
    expect(r.sides).toBe(1);
    near(r.x, 12.5 + 30, 0.5);
    near(r.w, 0.6, 0.001);
  });
});

describe("fitWindow", () => {
  const f = floor([rect("A", 0, 0, 400, 300)], [{ id: "w", kind: "window", x: 200, y: 0, orientation: "h", widthM: 1.2 }]);
  it("sits a seat across the window", () => {
    const r = fitWindow(f, { x: 200, y: 60 }, { defaultD: 0.5 })!;
    near(r.x, 200, 0.5);
    near(r.y, 12.5 + 25, 0.5);
    expect(r.rot).toBe(0);
    near(r.w, 1.2, 0.001);
  });
  it("drops the height under a low sill", () => {
    const g = floor(f.rooms, [{ ...f.openings[0], sill: 0.4 }]);
    near(fitWindow(g, { x: 200, y: 60 }, { defaultD: 0.5, h: 0.45 })!.h, 0.37, 0.001);
  });
});

describe("refit and problems", () => {
  const fitted = (): Fixture => {
    const f = fitRecess(listing, { x: 1270, y: 60 }, { defaultW: alcove.w, defaultD: alcove.d })!;
    return { id: "f", type: alcove.id, x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, joinery: { fit: "recess" } };
  };
  it("defaultFit", () => {
    expect(defaultFit(alcove)).toBe("recess");
    expect(defaultFit(seat)).toBe("window");
  });
  it("refits a moved, widened unit to the original numbers", () => {
    const fx = fitted();
    const bad = { ...fx, y: fx.y + 3, w: (fx.w ?? 0) + 0.05 };
    const p = refitFixture(listing, bad, alcove)!;
    near(p.x, fx.x, 0.05);
    near(p.y, fx.y, 0.05);
    near(p.w, fx.w!, 0.001);
    expect(p.joinery).toEqual({ fit: "recess" });
  });
  it("reports problems", () => {
    const fx = fitted();
    expect(fitProblem(listing, fx, alcove)).toBeNull();
    expect(fitProblem(listing, { ...fx, w: fx.w! + 0.1 }, alcove)).toMatch(/^Cuts into a wall/);
    expect(fitProblem(listing, { ...fx, w: fx.w! - 0.1 }, alcove)).toMatch(/gap in its recess/);
    expect(fitProblem(listing, { ...fx, joinery: undefined, w: fx.w! + 0.1 }, alcove)).toBeNull();
  });
});

describe("floorFaces", () => {
  it("points the inner face of the top wall down the plan", () => {
    const fs = floorFaces(floor([rect("A", 0, 0, 400, 300)]));
    const top = fs.find((g) => Math.abs(g.a.y - 12.5) < 0.01 && Math.abs(g.b.y - 12.5) < 0.01)!;
    near(top.n.x, 0, 1e-9);
    near(top.n.y, 1, 1e-9);
  });
});
