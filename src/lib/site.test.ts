import { describe, expect, it } from "vitest";
import {
  slideEdge,
  snapEdgeOffset,
  areaOf,
  boundaryPrisms,
  clipSegmentOutside,
  defaultDepths,
  gardenArea,
  houseOutlines,
  insertBoundaryVertex,
  pointPolygonDistance,
  prismBlocks,
  rectPoly,
  removeBoundaryVertex,
  segmentSegmentClosest,
  sideClearances,
  sideClearancesFromFaces,
  simpleSite,
  sunHoursGrid,
} from "./site";
import { floor, rect } from "./testing";
import type { HouseModel, Site } from "../types";
import { listing91770873, listingSite } from "./houses/listing91770873";

const square = rectPoly(0, 0, 4, 4);

describe("polygon helpers", () => {
  it("measures area whatever the winding", () => {
    expect(areaOf(square)).toBeCloseTo(16);
    expect(areaOf([...square].reverse())).toBeCloseTo(16);
    expect(areaOf([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }])).toBeCloseTo(6);
  });

  it("finds the closest points between segments", () => {
    const c = segmentSegmentClosest({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 5 });
    expect(c.d).toBeCloseTo(Math.SQRT2);
    expect(c.a).toEqual({ x: 2, y: 0 });
    expect(c.b).toEqual({ x: 3, y: 1 });
    expect(segmentSegmentClosest({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }).d).toBe(0);
    // Parallel segments.
    expect(segmentSegmentClosest({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }).d).toBeCloseTo(2);
  });

  it("measures point-to-polygon distances", () => {
    expect(pointPolygonDistance({ x: 2, y: 2 }, square)).toBe(0);
    expect(pointPolygonDistance({ x: 7, y: 8 }, square)).toBeCloseTo(5);
  });
});

describe("clipSegmentOutside", () => {
  it("cuts the part of a fence that runs through a building", () => {
    const parts = clipSegmentOutside({ x: -2, y: 2 }, { x: 8, y: 2 }, [square]);
    expect(parts).toHaveLength(2);
    expect(parts[0][0]).toBe(0);
    expect(parts[0][1]).toBeCloseTo(0.2, 3);
    expect(parts[1][0]).toBeCloseTo(0.6, 3);
    expect(parts[1][1]).toBe(1);
  });

  it("treats a fence along a wall as inside it within the margin", () => {
    expect(clipSegmentOutside({ x: 4.05, y: 1 }, { x: 4.05, y: 3 }, [square], 0.1)).toEqual([]);
    expect(clipSegmentOutside({ x: 4.05, y: -2 }, { x: 4.05, y: 3 }, [square], 0.1)[0][1]).toBeCloseTo(0.38, 2);
  });

  it("keeps a segment that misses everything", () => {
    expect(clipSegmentOutside({ x: -2, y: 9 }, { x: 8, y: 9 }, [square])).toEqual([[0, 1]]);
  });
});

describe("sideClearances", () => {
  const plot = rectPoly(-2, -10, 7, 6);
  it("measures each side of a box house to a rectangular plot", () => {
    const res = sideClearances([{ level: 0, polys: [square] }], plot);
    const d = Object.fromEntries(res.map((r) => [r.side, r.distance]));
    expect(d.left).toBeCloseTo(2);
    expect(d.right).toBeCloseTo(3);
    expect(d.rear).toBeCloseTo(10);
    expect(d.front).toBeCloseTo(2);
  });

  it("uses the upper floor where it overhangs", () => {
    const upper = rectPoly(-1, 0, 4, 4);
    const res = sideClearances(
      [
        { level: 0, polys: [square] },
        { level: 1, polys: [upper] },
      ],
      plot,
    );
    const left = res.find((r) => r.side === "left")!;
    expect(left.distance).toBeCloseTo(1);
    expect(left.level).toBe(1);
  });

  it("ignores internal walls and finds the narrowest point of a slanted boundary", () => {
    const rooms = [rectPoly(0, 0, 2, 4), rectPoly(2, 0, 4, 4)];
    const slanted = [
      { x: -1, y: -10 },
      { x: 7, y: -10 },
      { x: 7, y: 6 },
      { x: -3, y: 6 },
    ];
    const left = sideClearances([{ level: 0, polys: rooms }], slanted).find((r) => r.side === "left")!;
    expect(left.from.x).toBeCloseTo(0);
    expect(left.from.y).toBeCloseTo(0);
    // Perpendicular distance from (0, 0) to the line 16x + 2y + 36 = 0 through (-1, -10) and (-3, 6).
    expect(left.distance).toBeCloseTo(36 / Math.hypot(16, 2), 3);
  });

  it("finds the listing's garage and party wall on the boundary", () => {
    const res = sideClearances(houseOutlines(listing91770873("")), listingSite().boundary);
    const d = Object.fromEntries(res.map((r) => [r.side, r.distance]));
    expect(d.right).toBeLessThan(0.1);
    expect(d.left).toBeLessThan(0.1);
    // Measured from the outer wall faces (125 mm closer than the centre lines: 2.9 and 5.65).
    expect(d.front).toBeCloseTo(2.77, 1);
    expect(d.rear).toBeCloseTo(5.53, 1);
  });
});

describe("plot helpers", () => {
  it("counts garden area as the plot less the buildings on it", () => {
    expect(gardenArea(rectPoly(0, 0, 10, 10), [rectPoly(2, 2, 6, 6)])).toBeCloseTo(84, 0);
    expect(gardenArea(rectPoly(0, 0, 10, 10), [rectPoly(20, 20, 26, 26)])).toBeCloseTo(100, 0);
  });

  const site: Site = { frontBearing: 180, latitude: 51, longitude: 0, boundary: rectPoly(0, 0, 4, 4), neighbours: [], surfaces: [], boundaryEdges: [
    { kind: "fence", height: 1.8 },
    { kind: "wall", height: 2 },
    { kind: "hedge", height: 1.2 },
    { kind: "open", height: 0 },
  ] };

  it("splits an edge in two when a vertex is added, keeping its treatment", () => {
    const s = insertBoundaryVertex(site, 1, { x: 5, y: 2 });
    expect(s.boundary).toHaveLength(5);
    expect(s.boundary[2]).toEqual({ x: 5, y: 2 });
    expect(s.boundaryEdges!.map((e) => e.kind)).toEqual(["fence", "wall", "wall", "hedge", "open"]);
  });

  it("merges edges when a vertex is removed, but keeps at least a triangle", () => {
    const s = removeBoundaryVertex(site, 2);
    expect(s.boundary).toHaveLength(3);
    expect(s.boundaryEdges!.map((e) => e.kind)).toEqual(["fence", "wall", "open"]);
    expect(removeBoundaryVertex(s, 0)).toBe(s);
  });

  it("builds a simple plot around a house, with the attached neighbour for a semi", () => {
    const model: HouseModel = {
      floors: [floor([rect("A", 0, 0, 800, 600)])],
      ceilingHeight: 2.4,
      slabThickness: 0.25,
      exterior: { ...listing91770873("").exterior!, partyWall: "right" },
    };
    const depths = defaultDepths(model);
    expect(depths.right).toBe(0);
    const s = simpleSite(model, depths);
    expect(s.boundary[0]).toEqual({ x: -1.5, y: -12 });
    expect(s.boundary[2]).toEqual({ x: 8, y: 12 });
    expect(s.boundaryEdges).toHaveLength(4);
    expect(s.neighbours).toHaveLength(1);
    expect(s.neighbours[0].partySide).toBe("left");
    // The attached half shares the roof: same pitch and overhang, so the gutter line carries on.
    expect(s.neighbours[0].pitchDeg).toBe(model.exterior!.pitchDeg);
    expect(s.neighbours[0].overhang).toBe(model.exterior!.overhang);
    expect(s.neighbours[0].polygon[0].x).toBe(8);
    expect(s.surfaces.map((x) => x.kind)).toEqual(["lawn", "lawn", "pavement", "road"]);
  });
});

describe("sun hours", () => {
  it("blocks a low sun behind a tall prism but not a high one", () => {
    const wall = { poly: rectPoly(2, -1, 3, 1), height: 3 };
    // Sun to the +x side, wall 2 m away and 3 m tall: blocked below about 56 degrees.
    expect(prismBlocks({ x: 0, y: 0 }, 1, 0, Math.tan((40 * Math.PI) / 180), wall)).toBe(true);
    expect(prismBlocks({ x: 0, y: 0 }, 1, 0, Math.tan((60 * Math.PI) / 180), wall)).toBe(false);
    expect(prismBlocks({ x: 0, y: 0 }, -1, 0, 0.1, wall)).toBe(false);
  });

  it("counts fewer hours in the shade of a building", () => {
    const grid = sunHoursGrid(
      rectPoly(0, 0, 10, 2),
      [{ poly: rectPoly(10, -5, 12, 7), height: 2 }],
      // Sun always due +x at 20 degrees for 8 hours.
      () => ({ x: 1, y: 0, altitude: 20 }),
      8,
      16,
      1,
      0.5,
    );
    // The shadow reaches 2 / tan(20) = 5.5 m from the building.
    expect(grid.nx).toBe(10);
    expect(grid.ny).toBe(2);
    expect(grid.hours[0]).toBe(8);
    expect(grid.hours[9]).toBe(0);
    expect(grid.hours[10 + 3]).toBe(8);
    expect(grid.hours[10 + 6]).toBe(0);
  });
});

describe("boundary prisms", () => {
  const boundary = rectPoly(0, 0, 10, 10);
  const site = {
    boundary,
    boundaryEdges: [
      { kind: "fence" as const, height: 1.8 },
      { kind: "open" as const, height: 1.8 },
      { kind: "wall" as const, height: 0.9 },
      { kind: "hedge" as const, height: 2 },
    ],
  };

  it("makes a thin prism per edge that is not open", () => {
    const ps = boundaryPrisms(site);
    expect(ps).toHaveLength(3);
    expect(ps.every((p) => p.kind === "boundary")).toBe(true);
    expect(ps.map((p) => p.height)).toEqual([1.8, 0.9, 2]);
    expect(areaOf(ps[0].poly)).toBeCloseTo(10 * 0.1);
  });

  it("shades the garden without blanking the cells beside it", () => {
    const sun = () => ({ x: 0, y: -1, altitude: 20 }); // from the rear fence at y = 0
    const grid = sunHoursGrid(boundary, boundaryPrisms(site), sun, 8, 12, 1, 0.5);
    expect(grid.hours.some((h) => Number.isNaN(h))).toBe(false);
    // A 1.8 m fence at 20 degrees shades 1.8 / tan(20) = 4.9 m.
    expect(grid.hours[0]).toBe(0);
    expect(grid.hours[7 * grid.nx + 5]).toBe(4);
  });
});

describe("sideClearancesFromFaces", () => {
  it("measures from the outer wall face, 0.125 m inside the centre-line distance", () => {
    const boundary = [
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5, y: 3 },
      { x: -5, y: 3 },
    ];
    // Room right edge on the centre line x = 2; boundary at x = 5 is 3.0 m away.
    const faces = [{ level: 0, segments: [{ a: { x: 2.125, y: -1.125 }, b: { x: 2.125, y: 1.125 }, n: { x: 1, y: 0 } }] }];
    const right = sideClearancesFromFaces(faces, boundary).find((c) => c.side === "right")!;
    expect(right.distance).toBeCloseTo(2.875, 9);
  });
});

describe("slideEdge", () => {
  const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
  const area = (p: { x: number; y: number }[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
  it("moves a rectangle edge along its normal and stays parallel", () => {
    const r = slideEdge(rect, 1, -2); // right edge, normal -x, so -2 moves it out
    expect(r[1]).toEqual({ x: 12, y: 0 });
    expect(r[2]).toEqual({ x: 12, y: 6 });
    expect(r[0]).toEqual(rect[0]);
    expect(r[3]).toEqual(rect[3]);
  });
  it("keeps the direction of a non-axis edge and the winding", () => {
    const tri = [{ x: 0, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 10 }, { x: -4, y: 5 }];
    const r = slideEdge(tri, 0, -1);
    const d0 = { x: 8, y: 6 };
    const d1 = { x: r[1].x - r[0].x, y: r[1].y - r[0].y };
    expect(d1.x * d0.y - d1.y * d0.x).toBeCloseTo(0);
    expect(Math.hypot(r[0].x - tri[0].x, r[0].y - tri[0].y)).toBeCloseTo(1);
    expect(Math.sign(area(r))).toBe(Math.sign(area(tri)));
  });
  it("snaps the slid line through a nearby target", () => {
    expect(snapEdgeOffset(rect, 1, -1.95, [{ x: 12, y: 3 }], 0.2)).toBeCloseTo(-2);
    expect(snapEdgeOffset(rect, 1, -1.5, [{ x: 12, y: 3 }], 0.2)).toBe(-1.5);
  });
});
