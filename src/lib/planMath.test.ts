import { describe, expect, it } from "vitest";
import {
  areaM2,
  axisRect,
  comparePrinted,
  convexOverlap,
  doorSwing,
  edgeLengthsM,
  fitCam,
  fixtureSolids,
  formatLength,
  inwardNormals,
  formatArea,
  nearestSegment,
  overlappingIds,
  rectCorners,
  resizeRect,
  setEdgeLength,
  snapPoint,
  outsideSide,
  panCam,
  pinchCam,
  snapToWall,
  abutNeighbours,
  turn,
  viewBoxOf,
  wallLines,
  zoomCam,
  type Seg,
  type WallLine,
} from "./planMath";
import { floor, rect } from "./testing";
import type { CatalogueItem } from "./catalogue";

// 100 px per metre throughout, so coordinates read as centimetres.
const PX = 100;
const L = rect("L", 0, 0, 300, 400).polygon;

describe("measuring", () => {
  it("gives room areas in m² and ft²", () => {
    expect(areaM2(L, PX)).toBeCloseTo(12);
    expect(formatArea(12)).toBe("12.0 m² · 129 ft²");
    // An L-shaped room: 4 x 4 minus a 2 x 2 notch.
    const ell = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 200, y: 200 },
      { x: 200, y: 400 },
      { x: 0, y: 400 },
    ];
    expect(areaM2(ell, PX)).toBeCloseTo(12);
  });

  it("lists edge lengths in metres in vertex order", () => {
    expect(edgeLengthsM(L, PX)).toEqual([3, 4, 3, 4]);
  });
});

describe("numeric edits", () => {
  it("moves an edge's end point along the edge to set its length", () => {
    const out = setEdgeLength(L, 0, 350);
    expect(out[1]).toEqual({ x: 350, y: 0 });
    expect(out[0]).toEqual(L[0]);
    expect(out[2]).toEqual(L[2]);
    // The last edge wraps round to the first vertex.
    const wrap = setEdgeLength(L, 3, 300);
    expect(wrap[0]).toEqual({ x: 0, y: 100 });
  });

  it("recognises axis-aligned rectangles only", () => {
    expect(axisRect(L)).toEqual({ x0: 0, y0: 0, x1: 300, y1: 400 });
    expect(axisRect([{ x: 0, y: 0 }, { x: 300, y: 10 }, { x: 300, y: 400 }, { x: 0, y: 400 }])).toBeNull();
    expect(axisRect(L.slice(0, 3))).toBeNull();
  });

  it("resizes a rectangle about the chosen fixed corner, keeping vertex order", () => {
    expect(resizeRect(L, 500, 200, "tl")).toEqual([
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 200 },
      { x: 0, y: 200 },
    ]);
    const br = resizeRect(L, 200, 300, "br");
    expect(br[2]).toEqual({ x: 300, y: 400 });
    expect(br[0]).toEqual({ x: 100, y: 100 });
    const tr = resizeRect(L, 200, 300, "tr");
    expect(tr[1]).toEqual({ x: 300, y: 0 });
    expect(tr[3]).toEqual({ x: 100, y: 300 });
  });

  it("compares traced and printed sizes, allowing for swapped width and depth", () => {
    const c = comparePrinted(3.1, 4.0, { w: 4.0, h: 3.0 })!;
    expect(c.swapped).toBe(true);
    expect(c.w).toBeCloseTo(3.33, 1);
    expect(c.h).toBeCloseTo(0);
    expect(c.worst).toBeCloseTo(3.33, 1);
    expect(comparePrinted(3, 4, { w: 0, h: 4 })).toBeNull();
  });
});

describe("snapping", () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 300, y: 400 },
  ];
  it("prefers corners, then lines up with the nearest x and y", () => {
    expect(snapPoint({ x: 4, y: -3 }, corners, 10)).toEqual({ p: { x: 0, y: 0 }, kind: "corner" });
    expect(snapPoint({ x: 296, y: 200 }, corners, 10)).toEqual({ p: { x: 300, y: 200 }, kind: "axis" });
    expect(snapPoint({ x: 150, y: 200 }, corners, 10).kind).toBe("none");
  });

  it("finds the nearest wall segment", () => {
    const segs: Seg[] = [
      [{ x: 0, y: 0 }, { x: 300, y: 0 }],
      [{ x: 300, y: 0 }, { x: 300, y: 400 }],
    ];
    const n = nearestSegment({ x: 280, y: 200 }, segs)!;
    expect(n.seg).toBe(segs[1]);
    expect(n.q).toEqual({ x: 300, y: 200 });
  });

  it("snaps a fixture's back to a wall and turns it to face into the room", () => {
    const top: WallLine = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, halfT: 6 };
    const left: WallLine = { a: { x: 0, y: 400 }, b: { x: 0, y: 0 }, halfT: 6 };
    // 60 x 60 unit near the top wall: back on the wall face (6 px half wall + 30 px half depth).
    expect(snapToWall({ x: 150, y: 50 }, 60, 60, [top], 20)).toEqual({ x: 150, y: 36, rot: 0 });
    // Near the left wall it turns to put its back against it.
    const l = snapToWall({ x: 45, y: 200 }, 100, 60, [left], 20)!;
    expect(l.x).toBeCloseTo(36);
    expect(l.y).toBeCloseTo(200);
    expect(l.rot).toBe(270);
    // Below a wall seen from the other side it faces up the plan.
    const under = snapToWall({ x: 150, y: -40 }, 60, 60, [top], 20)!;
    expect(under.y).toBeCloseTo(-36);
    expect(under.rot).toBe(180);
    // Too far away: no snap.
    expect(snapToWall({ x: 150, y: 120 }, 60, 60, [top], 20)).toBeNull();
    // Close to the end of the wall it slides flush into the corner.
    expect(snapToWall({ x: 45, y: 40 }, 60, 60, [top], 20)!.x).toBe(36);
    // In the corner both walls are in reach: the nearer wins, unless the other keeps the current rotation.
    expect(snapToWall({ x: 40, y: 45 }, 60, 60, [top, left], 20)!.rot).toBe(270);
    const kept = snapToWall({ x: 40, y: 45 }, 60, 60, [top, left], 20, 0)!;
    expect(kept).toEqual({ x: 36, y: 36, rot: 0 });
  });

  it("slides flush against the face of a crossing wall of a different thickness", () => {
    // A thick outside wall along the top and a thin partition coming down from it.
    const top: WallLine = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, halfT: 9 };
    const left: WallLine = { a: { x: 0, y: 0 }, b: { x: 0, y: 400 }, halfT: 3 };
    const mid: WallLine = { a: { x: 200, y: 0 }, b: { x: 200, y: 400 }, halfT: 3 };
    const corner = snapToWall({ x: 40, y: 45 }, 60, 60, [top, left, mid], 20, 0)!;
    expect(corner.x).toBeCloseTo(33);
    expect(corner.y).toBeCloseTo(39);
    // Either side of a partition.
    expect(snapToWall({ x: 160, y: 45 }, 60, 60, [top, left, mid], 20, 0)!.x).toBeCloseTo(167);
    expect(snapToWall({ x: 240, y: 45 }, 60, 60, [top, left, mid], 20, 0)!.x).toBeCloseTo(233);
    // Dragged over a partition, it is pushed back to the side its centre is on, however far.
    expect(snapToWall({ x: 215, y: 45 }, 60, 60, [top, left, mid], 20, 0)!.x).toBeCloseTo(233);
    expect(snapToWall({ x: 190, y: 45 }, 120, 60, [top, left, mid], 20, 0)!.x).toBeCloseTo(137);
    // A partition that stops short of the unit is ignored.
    const stub: WallLine = { a: { x: 200, y: 0 }, b: { x: 200, y: 20 }, halfT: 3 };
    expect(snapToWall({ x: 160, y: 45 }, 60, 60, [top, stub], 20, 0)!.x).toBe(160);
  });
});

describe("lining up a run", () => {
  const base = { w: 60, d: 60, z0: 0, z1: 0.9 };
  it("slides a unit flush against its neighbour on the same wall", () => {
    const left = { x: 30, y: 36, rot: 0, ...base };
    // 4 px gap to the right of the neighbour: closes up.
    expect(abutNeighbours({ x: 94, y: 36, rot: 0 }, 60, 60, 0, 0.9, [left], 10)).toEqual({ x: 90, y: 36, rot: 0 });
    // 3 px overlap on its left side: pushed out.
    expect(abutNeighbours({ x: -27, y: 36, rot: 0 }, 60, 60, 0, 0.9, [left], 10).x).toBeCloseTo(-30);
    // Too far, a wall cabinet (different height), or a unit not on the same wall: left alone.
    expect(abutNeighbours({ x: 110, y: 36, rot: 0 }, 60, 60, 0, 0.9, [left], 10).x).toBe(110);
    expect(abutNeighbours({ x: 94, y: 22.5, rot: 0 }, 60, 33, 1.45, 2.17, [left], 10).x).toBe(94);
    expect(abutNeighbours({ x: 94, y: 40, rot: 0 }, 60, 60, 0, 0.9, [left], 10).x).toBe(94);
    // A shallower unit with its back on the same wall still lines up.
    expect(abutNeighbours({ x: 93, y: 22.5, rot: 0 }, 60, 33, 0, 0.9, [left], 10).x).toBeCloseTo(90);
  });

  it("works along a wall at any rotation", () => {
    const above = { x: 36, y: 30, rot: 270, ...base };
    const p = abutNeighbours({ x: 36, y: 95, rot: 270 }, 60, 60, 0, 0.9, [above], 10);
    expect(p.x).toBeCloseTo(36);
    expect(p.y).toBeCloseTo(90);
  });
});

describe("overlaps", () => {
  it("builds rotated rectangle corners", () => {
    const c = rectCorners({ x: 0, y: 0 }, 200, 100, 90);
    expect(c[0].x).toBeCloseTo(50);
    expect(c[0].y).toBeCloseTo(-100);
  });

  it("detects overlapping fixtures but not ones that touch or sit at different heights", () => {
    const a = rectCorners({ x: 0, y: 0 }, 60, 60, 0);
    const touching = rectCorners({ x: 60, y: 0 }, 60, 60, 0);
    const over = rectCorners({ x: 50, y: 10 }, 60, 60, 45);
    expect(convexOverlap(a, touching, 0.5)).toBe(false);
    expect(convexOverlap(a, over, 0.5)).toBe(true);
    const ids = overlappingIds([
      { id: "base", corners: a, z0: 0, z1: 0.9 },
      { id: "wall", corners: a, z0: 1.45, z1: 2.17 },
      { id: "hob", corners: a, z0: 0.9, z1: 0.95 },
      { id: "bin", corners: over, z0: 0, z1: 0.6 },
    ]);
    expect([...ids].sort()).toEqual(["base", "bin"]);
  });
});

describe("doors", () => {
  it("hinges at the start jamb and swings to +y on an internal wall unless flipped", () => {
    expect(doorSwing({ kind: "door" }, 0)).toEqual({ hinge: -1, swing: 1 });
    expect(doorSwing({ kind: "door", flipHinge: true, flipSwing: true }, 0)).toEqual({ hinge: 1, swing: -1 });
  });

  it("opens external doors inwards and French and bi-fold doors outwards, like the 3D view", () => {
    // Outside on local -y: a back door swings to +y (into the room).
    expect(doorSwing({ kind: "door" }, -1).swing).toBe(1);
    expect(doorSwing({ kind: "front" }, 1).swing).toBe(-1);
    expect(doorSwing({ kind: "french" }, 1).swing).toBe(1);
    expect(doorSwing({ kind: "bifold" }, -1).swing).toBe(-1);
    expect(doorSwing({ kind: "french", flipSwing: true }, 1).swing).toBe(-1);
  });
});

describe("walls for snapping", () => {
  it("lists room edges at their wall thickness and free walls at the internal one", () => {
    const f = floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)], [], { walls: [{ id: "w", a: { x: 0, y: 500 }, b: { x: 300, y: 500 } }] });
    const lines = wallLines(f, 0.1, 0.3);
    expect(lines).toHaveLength(9);
    // The shared edge x = 300 is internal (5 px half thickness); the outside edges are 15.
    const shared = lines.find((l) => l.a.x === 300 && l.b.x === 300)!;
    expect(shared.halfT).toBeCloseTo(5);
    expect(lines[0].halfT).toBeCloseTo(15);
    expect(lines[8].halfT).toBeCloseTo(5);
  });
});

describe("plan symbols", () => {
  it("finds the outside of an external wall", () => {
    const rooms = [rect("A", 0, 0, 300, 400)];
    // On the bottom wall the outside is below (+y, the default swing side).
    expect(outsideSide({ x: 150, y: 400, orientation: "h" }, rooms, 20)).toBe(1);
    expect(outsideSide({ x: 150, y: 0, orientation: "h" }, rooms, 20)).toBe(-1);
    // On a "v" wall local +y points left on the plan.
    expect(outsideSide({ x: 0, y: 200, orientation: "v" }, rooms, 20)).toBe(1);
    expect(outsideSide({ x: 300, y: 200, orientation: "v" }, rooms, 20)).toBe(-1);
    expect(outsideSide({ x: 150, y: 200, orientation: "h" }, rooms, 20)).toBe(0);
  });

  it("points edge normals into the room whichever way it was traced", () => {
    const n = inwardNormals(L);
    expect(n[0].y).toBeCloseTo(1);
    const rev = inwardNormals([...L].reverse());
    expect(rev[0].y).toBeCloseTo(-1); // the reversed outline starts along the bottom edge
    expect(formatLength(3.456)).toBe("3.46 m");
  });
});

describe("fixtures", () => {
  const item = (id: string, mount?: number): CatalogueItem => ({ id, name: id, category: "Kitchen", w: 0.6, d: 0.6, h: 0.9, color: "#fff", symbol: "cabinet", mount });
  const items: Record<string, CatalogueItem> = { base: item("base"), wall: { ...item("wall", 1.45), h: 0.72, d: 0.33 } };

  it("uses custom sizes and mounting heights in clash checks", () => {
    const solids = fixtureSolids(
      [
        { id: "a", type: "base", x: 0, y: 0, rot: 0 },
        { id: "b", type: "wall", x: 0, y: 0, rot: 0 },
        { id: "c", type: "base", x: 100, y: 0, rot: 0, w: 1.2 },
        { id: "d", type: "missing", x: 0, y: 0, rot: 0 },
      ],
      100,
      (id) => items[id],
    );
    expect(solids.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(solids[1].z0).toBe(1.45);
    // a spans x -30..30 and c (1.2 m wide) spans 40..160; the wall cabinet sits above a.
    expect([...overlappingIds(solids)]).toEqual([]);
    solids[2].corners = rectCorners({ x: 80, y: 0 }, 120, 60, 0);
    expect([...overlappingIds(solids)].sort()).toEqual(["a", "c"]);
  });

  it("turns in steps and wraps round", () => {
    expect(turn(270, 90)).toBe(0);
    expect(turn(0, -15)).toBe(345);
    expect(turn(10, 15)).toBe(25);
  });
});

describe("camera", () => {
  it("fits a rectangle centred at the element's aspect", () => {
    const c = fitCam({ x0: 0, y0: 0, x1: 100, y1: 100 }, { w: 400, h: 200 }, 0);
    expect(c).toEqual({ x: -50, y: 0, s: 0.5 });
    expect(viewBoxOf(c, { w: 400, h: 200 })).toEqual({ x: -50, y: 0, w: 200, h: 100 });
  });

  it("zooms about the pointer, keeping the point under it fixed, within limits", () => {
    const c = { x: 0, y: 0, s: 1 };
    const z = zoomCam(c, { x: 50, y: 50 }, 2);
    expect(z).toEqual({ x: 25, y: 25, s: 0.5 });
    expect(zoomCam(z, { x: 0, y: 0 }, 100, 0.2).s).toBe(0.2);
  });

  it("pinches: spreads zoom in and the midpoint carries the plan with it", () => {
    const c = { x: 10, y: 20, s: 2 };
    // Fingers move apart and the midpoint moves 30 px right: the image point under (100, 100) follows to (130, 100).
    const p = pinchCam(c, { x: 100, y: 100 }, { x: 130, y: 100 }, 100, 200);
    expect(p.s).toBe(1);
    expect(p.x + 130 * p.s).toBeCloseTo(c.x + 100 * c.s);
    expect(p.y + 100 * p.s).toBeCloseTo(c.y + 100 * c.s);
    expect(panCam(c, 10, -5)).toEqual({ x: -10, y: 30, s: 2 });
  });
});
