import { describe, expect, it } from "vitest";
import { listingSite } from "./houses/listing91770873";
import {
  MIN_NEIGHBOUR,
  MIN_OPENING,
  defaultOpeningEnd,
  edgeLength,
  moveBoundaryCorner,
  openingWidth,
  setOpeningWidth,
  slideCorner,
  slidePoint,
} from "./boundaryOpening";
import type { Site, WPt } from "../types";

const at = (p: WPt, x: number, y: number) => Math.hypot(p.x - x, p.y - y) < 0.005;
const surfaceWith = (s: Site, kind: string) => s.surfaces.filter((x) => x.kind === kind);
const hasVertex = (poly: WPt[], x: number, y: number) => poly.some((p) => at(p, x, y));
const area = (poly: WPt[]) => Math.abs(poly.reduce((t, p, i) => t + (p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y), 0)) / 2;

describe("opening width", () => {
  it("measures the drive opening of the listing", () => {
    const s = listingSite();
    expect(openingWidth(s, 6)).toBeCloseTo(3.03, 2);
    expect(edgeLength(s, 5)).toBeCloseTo(7.52, 2);
  });

  it("moves the end whose neighbour is the longer wall by default", () => {
    expect(defaultOpeningEnd(listingSite(), 6)).toBe("start");
  });

  it("widens the listing's drive opening to 4.0 m along the front wall line", () => {
    const s = listingSite();
    const next = setOpeningWidth(s, 6, 4.0, "start");
    expect(next.boundary[6].x).toBeCloseTo(-0.88, 2);
    expect(next.boundary[6].y).toBe(5.5); // stays exactly on the wall line
    expect(openingWidth(next, 6)).toBeCloseTo(4.0, 6);
    expect(edgeLength(next, 5)).toBeCloseTo(7.52 - 0.97, 2); // the front garden wall is shorter
    expect(next.boundary[7]).toEqual(s.boundary[7]);
    expect(next.boundary[5]).toEqual(s.boundary[5]);
    // The input is not mutated.
    expect(s.boundary[6].x).toBeCloseTo(-1.85);
  });

  it("moves the drive and lawn vertices that were at the old corner", () => {
    const s = listingSite();
    const next = setOpeningWidth(s, 6, 4.0);
    const drive = surfaceWith(next, "drive")[0];
    expect(hasVertex(drive.polygon, -0.88, 5.5)).toBe(true);
    expect(hasVertex(drive.polygon, -1.85, 5.5)).toBe(false);
    expect(hasVertex(drive.polygon, -4.88, 5.5)).toBe(true);
    const lawns = surfaceWith(next, "lawn").filter((l) => hasVertex(l.polygon, -0.88, 5.5));
    expect(lawns.length).toBe(1);
    expect(hasVertex(lawns[0].polygon, -1.85, 5.5)).toBe(false);
  });

  it("keeps the drive and lawn sharing one edge, so nothing gaps or overlaps", () => {
    const s = listingSite();
    const next = setOpeningWidth(s, 6, 4.0);
    const drive = surfaceWith(next, "drive")[0].polygon;
    // The flare starts at the path's front corner (-1.85, 3.5), clear of the porch and hall.
    expect(drive.map((q) => [q.x, q.y].map((n) => +n.toFixed(2)))).toEqual([
      [-4.59, 1.16],
      [-1.85, 1.16],
      [-1.85, 3.5],
      [-0.88, 5.5],
      [-4.88, 5.5],
    ]);
    const lawnBefore = s.surfaces.find((x) => x.kind === "lawn" && hasVertex(x.polygon, -1.85, 5.5))!;
    const lawnAfter = next.surfaces.find((x) => x.id === lawnBefore.id)!;
    // The lawn's matching edge runs between the same two points.
    expect(hasVertex(lawnAfter.polygon, -1.85, 3.5)).toBe(true);
    expect(hasVertex(lawnAfter.polygon, -0.88, 5.5)).toBe(true);
    expect(hasVertex(lawnAfter.polygon, -1.85, 2.6)).toBe(true);
    // The path beside the drive is untouched.
    const path = surfaceWith(s, "path")[0];
    expect(surfaceWith(next, "path")[0].polygon).toEqual(path.polygon);
    // The lawn lost exactly the triangle the drive gained.
    const gain = area(drive) - area(surfaceWith(s, "drive")[0].polygon);
    expect(gain).toBeCloseTo(0.5 * 0.97 * 2.0, 3);
    expect(area(lawnBefore.polygon) - area(lawnAfter.polygon)).toBeCloseTo(gain, 3);
  });

  it("can move the other end instead, shortening that neighbour", () => {
    const s = listingSite();
    const next = setOpeningWidth(s, 6, 3.5, "end");
    expect(next.boundary[6]).toEqual(s.boundary[6]);
    expect(openingWidth(next, 6)).toBeCloseTo(3.5, 5);
    // The end corner stays on the line of edge 7 (the west-side wall).
    const a = s.boundary[8];
    const c = s.boundary[7];
    const m = next.boundary[7];
    expect(Math.abs((m.x - a.x) * (c.y - a.y) - (m.y - a.y) * (c.x - a.x))).toBeLessThan(1e-9);
  });

  it("shrinks the opening back and restores the original corner", () => {
    const s = listingSite();
    const back = setOpeningWidth(setOpeningWidth(s, 6, 4.0), 6, openingWidth(s, 6));
    expect(back.boundary[6].x).toBeCloseTo(-1.85, 6);
    expect(back.boundary[6].y).toBe(5.5);
    expect(hasVertex(surfaceWith(back, "drive")[0].polygon, -1.85, 5.5)).toBe(true);
  });

  it("clamps so the neighbouring wall keeps its minimum and the opening its minimum", () => {
    const s = listingSite();
    const huge = setOpeningWidth(s, 6, 50, "start");
    expect(edgeLength(huge, 5)).toBeCloseTo(MIN_NEIGHBOUR, 6);
    const tiny = setOpeningWidth(s, 6, 0.01, "start");
    expect(openingWidth(tiny, 6)).toBeCloseTo(MIN_OPENING, 6);
    expect(setOpeningWidth(s, 6, NaN)).toBe(s);
  });

  it("does not change the site it is given", () => {
    const s = listingSite();
    const copy = structuredClone(s);
    setOpeningWidth(s, 6, 4.2);
    expect(s).toEqual(copy);
  });
});

describe("sliding a corner", () => {
  it("holds the corner on the neighbouring wall's line", () => {
    const s = listingSite();
    const p = slidePoint(s, 6, "prev", { x: -0.2, y: 4.1 });
    expect(p.x).toBeCloseTo(-0.2, 6);
    expect(p.y).toBeCloseTo(5.5, 6);
    const moved = slideCorner(s, 6, "prev", { x: -0.2, y: 4.1 });
    expect(moved.boundary[6].y).toBeCloseTo(5.5, 9);
    expect(hasVertex(surfaceWith(moved, "drive")[0].polygon, -0.2, 5.5)).toBe(true);
  });

  it("keeps the minimum wall and opening lengths", () => {
    const s = listingSite();
    expect(slidePoint(s, 6, "prev", { x: 9, y: 5.5 }).x).toBeCloseTo(5.67 - MIN_NEIGHBOUR, 6);
    const near = slidePoint(s, 6, "prev", { x: -4.8, y: 5.5 });
    expect(Math.hypot(near.x - s.boundary[7].x, near.y - s.boundary[7].y)).toBeGreaterThanOrEqual(MIN_OPENING - 1e-9);
  });

  it("slides the end corner along the next edge's line", () => {
    const s = listingSite();
    const p = slidePoint(s, 7, "next", { x: -6, y: 4 });
    const a = s.boundary[8];
    const c = s.boundary[7];
    expect(Math.abs((p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x))).toBeLessThan(1e-9);
  });
});

describe("moveBoundaryCorner", () => {
  it("drags coincident surface vertices and leaves distant ones", () => {
    const s = listingSite();
    const next = moveBoundaryCorner(s, 6, { x: -1.2, y: 5.9 });
    expect(next.boundary[6]).toEqual({ x: -1.2, y: 5.9 });
    expect(surfaceWith(next, "road")[0].polygon).toEqual(surfaceWith(s, "road")[0].polygon);
    expect(hasVertex(surfaceWith(next, "drive")[0].polygon, -1.2, 5.9)).toBe(true);
  });

  it("returns the same site when nothing moves", () => {
    const s = listingSite();
    expect(moveBoundaryCorner(s, 6, { ...s.boundary[6] })).toBe(s);
  });
});
