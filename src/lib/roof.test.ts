import { describe, expect, it } from "vitest";
import {
  FLAT_OVERHANG,
  chimneyOnRidge,
  defaultChimney,
  exteriorOf,
  floorBase,
  leanToHeightAt,
  planFlat,
  planRoofs,
  roofGeometry,
  roofHeightAt,
  roofSeatY,
  downpipeSpot,
  FASCIA_DEPTH,
  roofTrim,
  setDown,
  type RoofBlock,
} from "./roof";
import { EXT_WALL_T, openingHeights, windowSill } from "./geometry";
import { SKIRT_FASCIA, SOIL_R, assignDownpipes, cutBoxes, footAt, roofParts, skirtEaves, skirtEnd, skirtParts, skirtRun, skirtedEdges, soilStack, type RoofParts } from "./roofParts";
import type { FlatRoofSkirt, HouseModel } from "../types";
import { listing91770873, listing91770873Proposed } from "./houses/listing91770873";

const base: RoofBlock = { x0: 0, z0: 0, x1: 10, z1: 6, y: 5, axis: "x", pitchDeg: 45, overhang: 0.3, start: "gable", end: "gable", wallT: 0.2 };

function normals(pos: number[]) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    const u = [bx - ax, by - ay, bz - az];
    const v = [cx - ax, cy - ay, cz - az];
    out.push([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  }
  return out;
}

describe("roofGeometry", () => {
  it("passes through the outer top edge of the walls", () => {
    const m = roofGeometry(base);
    // Span between outer faces is 6.2 m, so at 45 degrees the ridge is 3.1 m up.
    expect(m.ridgeY).toBeCloseTo(8.1);
    expect(m.eavesY).toBeCloseTo(4.7);
    expect(m.gables.length / 9).toBe(2);
  });

  it("winds every slope triangle to face up", () => {
    for (const style of ["gable", "hip"] as const) {
      const m = roofGeometry({ ...base, start: style, end: style });
      for (const n of normals(m.slopes)) expect(n[1]).toBeGreaterThan(0);
    }
  });

  it("winds gable ends to face outwards", () => {
    const m = roofGeometry(base);
    const ns = normals(m.gables);
    const xs: number[] = [];
    for (let i = 0; i < m.gables.length; i += 9) xs.push(m.gables[i]);
    ns.forEach((n, i) => expect(Math.sign(n[0])).toBe(xs[i] < 5 ? -1 : 1));
  });

  it("shortens the ridge by half the span at each hipped end", () => {
    const m = roofGeometry({ ...base, start: "hip", end: "hip" });
    expect(m.ridge[0][0]).toBeCloseTo(-0.1 + 3.1);
    expect(m.ridge[1][0]).toBeCloseTo(10.1 - 3.1);
    expect(m.gables).toHaveLength(0);
  });

  it("stops flush with no overhang at a party wall", () => {
    const m = roofGeometry({ ...base, start: "hip", end: "flush" });
    const maxX = Math.max(...m.eaves.map((p) => p[0]));
    expect(maxX).toBeCloseTo(10);
    expect(m.ridge[1][0]).toBeCloseTo(10);
  });

  it("works along z as well as x", () => {
    const m = roofGeometry({ ...base, x1: 6, z1: 10, axis: "z", start: "hip", end: "hip" });
    expect(m.ridge[0][2]).toBeCloseTo(3);
    for (const n of normals(m.slopes)) expect(n[1]).toBeGreaterThan(0);
  });

  it("collapses to a pyramid on a square hipped roof", () => {
    const m = roofGeometry({ ...base, x1: 6, start: "hip", end: "hip" });
    expect(m.ridge[0][0]).toBeCloseTo(m.ridge[1][0]);
  });
});

describe("planRoofs", () => {
  it("gives the listing a hipped roof that stops at the party wall", () => {
    const plan = planRoofs(listing91770873(""));
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].start).toBe("hip");
    expect(plan.blocks[0].end).toBe("flush");
    expect(plan.flats.length).toBeGreaterThan(0);
  });

  it("keeps the proposed extension under one hipped roof by default", () => {
    const plan = planRoofs(listing91770873Proposed(""));
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].x0).toBeLessThan(-4);
  });

  it("gives a separate extension roof its own block that meets the main roof flush", () => {
    const m = listing91770873Proposed("");
    m.exterior = { ...m.exterior!, extensionRoof: "separate" };
    const plan = planRoofs(m);
    expect(plan.blocks).toHaveLength(2);
    const ext = plan.blocks.find((b) => b.x0 < -4)!;
    expect(ext.start).toBe("hip");
    expect(ext.end).toBe("flush");
  });
});

describe("roof detail", () => {
  it("gives every slope vertex a UV, measured up the slope from the eaves", () => {
    const m = roofGeometry({ ...base, start: "hip", end: "flush" });
    expect(m.slopeUVs.length / 2).toBe(m.slopes.length / 3);
    const slopeLen = (m.ridgeY - m.eavesY) / Math.sin((45 * Math.PI) / 180);
    for (let i = 0; i < m.slopes.length / 3; i++) {
      const y = m.slopes[i * 3 + 1];
      const v = m.slopeUVs[i * 2 + 1];
      if (Math.abs(y - m.eavesY) < 1e-9) expect(v).toBeCloseTo(0);
      if (Math.abs(y - m.ridgeY) < 1e-9) expect(v).toBeCloseTo(slopeLen);
    }
  });

  it("lifts the roof clear of the walls without moving the gable base", () => {
    const m = roofGeometry({ ...base, clearance: 0.02 });
    expect(m.ridgeY).toBeCloseTo(8.12);
    const ys: number[] = [];
    for (let i = 1; i < m.gables.length; i += 3) ys.push(m.gables[i]);
    expect(Math.min(...ys)).toBeCloseTo(5);
  });

  it("returns the roof height over a point, and carries on past a flush end only when asked", () => {
    const b: RoofBlock = { ...base, start: "hip", end: "flush" };
    expect(roofHeightAt(b, 5, 3)).toBeCloseTo(8.1);
    expect(roofHeightAt(b, 5, -0.1)).toBeCloseTo(5);
    expect(roofHeightAt(b, 5, -1)).toBeNull();
    expect(roofHeightAt(b, 10.5, 3)).toBeNull();
    expect(roofHeightAt(b, 10.5, 3, true)).toBeCloseTo(8.1);
  });

  it("keeps fascias and gutters off a flush end and puts downpipes away from it", () => {
    const t = roofTrim({ ...base, x1: 8, start: "hip", end: "flush" });
    const xs: number[] = [];
    for (let i = 0; i < t.trim.length; i += 3) xs.push(t.trim[i]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(8 + 1e-9);
    for (const [a, b] of t.gutters) expect(Math.max(a[0], b[0])).toBeLessThanOrEqual(8 + 1e-9);
    // Two long runs plus the run across the hipped end.
    expect(t.gutters).toHaveLength(3);
    expect(t.downpipes).toHaveLength(2);
    for (const d of t.downpipes) expect(d.path[d.path.length - 1][0]).toBeLessThan(1);
  });

  it("gives gable ends bargeboards but no gutter, and caps the ridge and hips", () => {
    const gable = roofTrim(base);
    expect(gable.gutters).toHaveLength(2);
    const xs: number[] = [];
    for (let i = 0; i < gable.trim.length; i += 3) xs.push(gable.trim[i]);
    // Bargeboards sit out at the verge, past the gable walls.
    expect(Math.min(...xs)).toBeLessThan(-0.3);
    expect(gable.caps).toHaveLength(1);
    expect(roofTrim({ ...base, start: "hip", end: "hip" }).caps).toHaveLength(5);
  });
});

describe("eaves seated on the walls", () => {
  const soffit = (b: RoofBlock) => {
    // The lowest trim along the eaves is the soffit (hipped ends have no bargeboards to go lower).
    const { trim } = roofTrim(b);
    let lo = Infinity;
    for (let i = 1; i < trim.length; i += 3) lo = Math.min(lo, trim[i]);
    return lo;
  };

  it("puts the eaves level with the wall tops and the soffit a fascia's depth under them, whatever the pitch and overhang", () => {
    for (const pitchDeg of [22.5, 28, 35, 45, 55])
      for (const overhang of [0, 0.2, 0.35, 0.6]) {
        const b: RoofBlock = { ...base, start: "hip", end: "hip", pitchDeg, overhang, clearance: 0.02, eavesOnWalls: true };
        const m = roofGeometry(b);
        expect(m.eavesY).toBeCloseTo(b.y + 0.02);
        expect(soffit(b)).toBeCloseTo(b.y + 0.02 - FASCIA_DEPTH);
        // The roof still clears the walls' outer top edge.
        expect(roofHeightAt(b, 5, -0.1)!).toBeGreaterThanOrEqual(b.y + 0.02 - 1e-9);
      }
  });

  it("lifts the roof by the overhang's fall and leaves unseated roofs as they were", () => {
    const seated = roofGeometry({ ...base, eavesOnWalls: true });
    const plain = roofGeometry(base);
    expect(seated.ridgeY - plain.ridgeY).toBeCloseTo(base.overhang);
    expect(plain.eavesY).toBeCloseTo(4.7);
    expect(roofSeatY({ ...base, eavesOnWalls: true })).toBeCloseTo(5.3);
  });

  it("keeps the soffit just above the top-floor window heads of the listing, at any pitch", () => {
    for (const m of [listing91770873(""), listing91770873Proposed("")]) {
      for (const pitchDeg of [m.exterior!.pitchDeg, 35, 45]) {
        const plan = planRoofs({ ...m, exterior: { ...m.exterior!, pitchDeg } });
        const first = m.floors.find((f) => f.level === 1)!;
        const heads = first.openings.filter((o) => o.kind === "window").map((o) => floorBase(m, first) + openingHeights(o, m.ceilingHeight).y1);
        expect(heads.length).toBeGreaterThan(0);
        for (const b of plan.blocks) {
          const gap = soffit(b) - Math.max(...heads);
          // A band of render about 0.1 m deep between the window frames and the soffit (front-2, front-street, rear-1).
          expect(gap).toBeGreaterThan(0.05);
          expect(gap).toBeLessThan(0.15);
        }
      }
    }
  });

  it("eases a set-down extension's pitch about its eaves, which stay level with the main roof's", () => {
    const main: RoofBlock = { ...base, start: "hip", end: "flush", clearance: 0.02, eavesOnWalls: true };
    const ext: RoofBlock = { ...main, x0: 10, x1: 14, z0: 0, z1: 6, start: "flush", end: "hip" };
    const down = setDown(ext, main, 0.4);
    expect(roofGeometry(main).ridgeY - roofGeometry(down).ridgeY).toBeCloseTo(0.4);
    expect(roofGeometry(down).eavesY).toBeCloseTo(roofGeometry(main).eavesY);
  });
});

describe("extension roofs", () => {
  const separate = (drop?: number) => {
    const m = listing91770873Proposed("");
    m.exterior = { ...m.exterior!, extensionRoof: "separate", extensionDrop: drop };
    return planRoofs(m);
  };
  const ridge = (b: RoofBlock) => roofGeometry(b).ridgeY;

  it("sets a separate extension's ridge down by the drop, keeping the eaves line", () => {
    const plan = separate();
    const ext = plan.blocks.find((b) => b.x0 < -4)!;
    const main = plan.blocks.find((b) => b !== ext)!;
    expect(ridge(main) - ridge(ext)).toBeCloseTo(0.3);
    expect(ext.y).toBeCloseTo(main.y);
    expect(ext.pitchDeg).toBeLessThan(main.pitchDeg);
    expect(ridge(main) - ridge(separate(0.6).blocks.find((b) => b.x0 < -4)!)).toBeCloseTo(0.6);
  });

  it("runs in under the main roof's hipped end, which the main roof keeps", () => {
    const plan = separate();
    const ext = plan.blocks.find((b) => b.x0 < -4)!;
    const main = plan.blocks.find((b) => b !== ext)!;
    expect(plan.blocks[0]).toBe(main);
    expect(ext.axis).toBe("x");
    expect(ext.end).toBe("flush");
    expect(main.start).toBe("hip");
    expect(ext.x1).toBeCloseTo(main.x0);
    // Its slopes carry on under the main hip far enough that its ridge ends inside the main roof.
    const tan = (d: number) => Math.tan((d * Math.PI) / 180);
    const hs = (ext.z1 - ext.z0 + EXT_WALL_T) / 2;
    // Both seat their eaves on the walls, so the main roof starts higher over its wall face than the eased extension does.
    const rise = roofSeatY(ext) + hs * tan(ext.pitchDeg) - roofSeatY(main);
    expect(ext.x1 + ext.tuck![1]).toBeCloseTo(main.x0 - EXT_WALL_T / 2 + rise / tan(main.pitchDeg) + 0.05);
    expect(roofHeightAt(main, ext.x1 + ext.tuck![1], (ext.z0 + ext.z1) / 2)!).toBeGreaterThan(roofGeometry(ext).ridgeY);
  });

  it("leaves a narrower extension alone when its ridge is already low enough", () => {
    const narrow: RoofBlock = { ...base, x0: 10, x1: 13, z0: 1, z1: 5 };
    expect(setDown(narrow, base, 0.3)).toEqual(narrow);
  });
});

describe("flat roofs", () => {
  it("roofs the listing's L-shaped single-storey part right up to the two-storey walls", () => {
    const m = listing91770873("");
    const plan = planRoofs(m);
    const main = plan.blocks[0];
    const fr = plan.flatRoofs[0];
    // Nothing flat under the pitched roof (an untraced cupboard used to leave a stray roof inside the house).
    for (const r of fr.rects) {
      const inside = r.x0 > main.x0 + 0.01 && r.x1 < main.x1 - 0.01 && r.z0 > main.z0 + 0.01 && r.z1 < main.z1 - 0.01;
      expect(inside).toBe(false);
    }
    // The roof meets the main walls exactly, with no notch.
    expect(fr.rects.some((r) => Math.abs(r.x1 - main.x0) < 1e-6)).toBe(true);
    expect(fr.rects.some((r) => Math.abs(r.z0 - main.z1) < 1e-6)).toBe(true);
    const covered = (x: number, z: number) => fr.rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    for (let x = -4.5; x < -0.6; x += 0.2) for (let z = -5.5; z < 2.5; z += 0.2) expect(covered(x, z)).toBe(true);
    // Edges against the two-storey part are abutments, the rest eaves.
    expect(fr.edges.filter((e) => e.kind === "abutment")).toHaveLength(2);
    expect(fr.edges.filter((e) => e.kind === "eaves")).toHaveLength(4);
    // The membrane clears the floor slab bands carried up by the walls below the first floor.
    expect(fr.top).toBeGreaterThan(m.ceilingHeight + m.slabThickness);
  });

  it("draws the porch ceiling as its own part, horizontal and facing down", () => {
    const { ceiling } = roofParts(planRoofs(listing91770873("")), { gutters: false });
    expect(ceiling.length).toBeGreaterThan(0);
    for (let i = 0; i + 8 < ceiling.length; i += 9) {
      const [a, b, c] = [0, 3, 6].map((o) => ceiling.slice(i + o, i + o + 3));
      expect(a[1]).toBeCloseTo(b[1]);
      expect(a[1]).toBeCloseTo(c[1]);
      // Plan-view cross product: counter-clockwise seen from above means facing up, so it must not be.
      const cross = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      expect(cross).toBeLessThanOrEqual(1e-9);
    }
  });

  it("marks the porch canopy as open so it gets a ceiling", () => {
    const fr = planRoofs(listing91770873("")).flatRoofs[0];
    expect(fr.open).toHaveLength(1);
    expect(fr.open[0].x0).toBeCloseTo(-4.589, 2);
  });

  it("runs fascias out to outside corners and back from inside corners", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    const fr = planFlat([L], [], [], 2.4, 2.7)!;
    expect(fr.edges).toHaveLength(6);
    const W = EXT_WALL_T / 2 + FLAT_OVERHANG;
    // The edge along z = 2 from x = 2 to 4 has an inside corner at x = 2 and an outside one at x = 4.
    const inner = fr.edges.find((e) => e.axis === "x" && Math.abs(e.at - 2) < 1e-9)!;
    expect(inner.fascia[0]).toBeCloseTo(-W);
    expect(inner.fascia[1]).toBeCloseTo(W);
  });

  it("snaps tracing noise so a small offset between floors leaves no sliver of roof", () => {
    const rect = (h: number) => [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: h },
      { x: 0, y: h },
    ];
    expect(planFlat([rect(6.05)], [], [rect(6)], 2.4, 2.7)).toBeNull();
  });
});

describe("porch lean-to", () => {
  const leanTo = (m: HouseModel) => {
    m.exterior = { ...m.exterior!, canopyRoof: "lean-to" };
    return planRoofs(m);
  };

  it("falls away from the garage wall and takes the canopy out of the flat roof", () => {
    const plan = leanTo(listing91770873(""));
    expect(plan.leanTos).toHaveLength(1);
    const l = plan.leanTos[0];
    expect(l.axis).toBe("x");
    expect(l.dir).toBe(1);
    expect(l.endFlush).toBe(true);
    expect(l.startFlush).toBe(false);
    // Single storey behind, so the wall is built up to meet it.
    expect(l.tallWall).toBe(false);
    expect(plan.flatRoofs[0].open).toHaveLength(0);
    expect(leanToHeightAt(l, -3, 1.3)!).toBeGreaterThan(leanToHeightAt(l, -3, 2.5)!);
  });

  it("only needs a flashing against the proposed two-storey wall", () => {
    expect(leanTo(listing91770873Proposed("")).leanTos[0].tallWall).toBe(true);
  });
});

describe("chimneys and downpipes", () => {
  it("starts a new chimney on the ridge, straddling the party wall", () => {
    const m = listing91770873("");
    const c = defaultChimney(m, "c");
    const main = planRoofs(m).blocks[0];
    expect(c.x).toBeCloseTo(main.x1);
    expect(c.y).toBeCloseTo(roofGeometry(main).ridge[0][2]);
  });

  it("rises the given height above the ridge from below the slope it stands on", () => {
    const m = listing91770873("");
    m.exterior = { ...m.exterior!, chimneys: [{ id: "c", x: 4, y: -3.5, w: 0.6, d: 0.6, height: 1, pots: 2 }] };
    const plan = planRoofs(m);
    const s = plan.chimneys[0];
    const main = plan.blocks[0];
    expect(s.y1).toBeCloseTo(roofGeometry(main).ridgeY + 1);
    expect(s.y0).toBeLessThan(roofHeightAt(main, 4, -3.2)!);
    expect(s.y0).toBeGreaterThan(main.y - 0.5);
    const moved = chimneyOnRidge(m, m.exterior.chimneys![0]);
    expect(moved.y).toBeCloseTo(roofGeometry(main).ridge[0][2]);
    expect(moved.x).toBeCloseTo(4);
  });

  it("seats a shared stack centred over the neighbour's side of the party wall on the house's roof, not the ground", () => {
    const m = listing91770873("");
    const main = planRoofs(m).blocks[0];
    m.exterior = { ...m.exterior!, chimneys: [{ id: "c", x: main.x1 + 0.3, y: -3, w: 0.8, d: 1.2, height: 1, pots: 0 }] };
    const plan = planRoofs(m);
    const s = plan.chimneys[0];
    expect(s.y1).toBeCloseTo(roofGeometry(plan.blocks[0]).ridgeY + 1);
    expect(s.y0).toBeGreaterThan(main.y - 0.5);
  });

  it("drops downpipes onto a flat roof below, or to the ground", () => {
    const plan = planRoofs(listing91770873(""));
    expect(footAt(plan, -2, 0, 5)).toBeCloseTo(plan.flatRoofs[0].top);
    expect(footAt(plan, 4, 3, 5)).toBeCloseTo(plan.groundY);
  });

  it("assembles every part, with gutters only when asked", () => {
    const plan = planRoofs(listing91770873(""));
    const on = roofParts(plan, { gutters: true });
    expect(on.tiles.uv.length / 2).toBe(on.tiles.pos.length / 3);
    expect(on.membrane.uv.length / 2).toBe(on.membrane.pos.length / 3);
    expect(on.trim.length).toBeGreaterThan(0);
    expect(on.ceiling.length).toBeGreaterThan(0);
    expect(on.flashing.length).toBeGreaterThan(0);
    expect(on.gutters.length).toBeGreaterThan(0);
    expect(on.pipes.length).toBeGreaterThan(0);
    const off = roofParts(plan, { gutters: false });
    expect(off.gutters).toHaveLength(0);
    expect(off.pipes).toHaveLength(0);
  });
});

describe("downpipes where the model puts them", () => {
  // Hipped at x = 0, flush (party wall) at x = 8; walls 0.2 thick, so outer faces at x = -0.1, z = -0.1 and 6.1.
  const hip: RoofBlock = { ...base, x1: 8, start: "hip", end: "flush" };
  const feet = (t: ReturnType<typeof roofTrim>) => t.downpipes.map((d) => d.path[d.path.length - 1]);

  it("finds the nearest guttered wall: a long side, or a hipped end, but not a gable or party-wall end", () => {
    expect(downpipeSpot(hip, 3, -0.3)).toMatchObject({ side: "lo", along: 3 });
    expect(downpipeSpot(hip, 3, 6.3)).toMatchObject({ side: "hi", along: 3 });
    expect(downpipeSpot(hip, -0.3, 5.5)).toMatchObject({ side: "start", along: 5.5 });
    // Off the flush end, and off a gable end, there is no gutter to hang it from.
    expect(downpipeSpot(hip, 8.3, 3)).toBeNull();
    expect(downpipeSpot(base, -0.3, 3)).toBeNull();
    // Too far from any wall.
    expect(downpipeSpot(hip, 3, 3)).toBeNull();
    expect(downpipeSpot(hip, 3, -2)).toBeNull();
  });

  it("puts one downpipe at each given spot instead of the automatic corner ones", () => {
    const t = roofTrim(hip, [
      [3, -0.3],
      [-0.3, 5.5],
    ]);
    expect(t.downpipes).toHaveLength(2);
    const [side, end] = feet(t);
    // Against the wall face, the swan neck ending a pipe radius and a little off it.
    expect(side[0]).toBeCloseTo(3);
    expect(side[2]).toBeCloseTo(-0.1 - 0.054, 3);
    expect(end[0]).toBeCloseTo(-0.1 - 0.054, 3);
    expect(end[2]).toBeCloseTo(5.5);
    // Every outlet hangs from its gutter, out past the wall under the eaves.
    for (const d of t.downpipes) expect(d.path[0][1]).toBeGreaterThan(hip.y - 0.4);
    // Kept clear of the corner when the spot is past it.
    expect(feet(roofTrim(hip, [[-0.05, -0.3]]))[0][0]).toBeCloseTo(0.02, 6);
    // An empty list means none at all; no list keeps the automatic ones.
    expect(roofTrim(hip, []).downpipes).toHaveLength(0);
    expect(roofTrim(hip).downpipes).toHaveLength(2);
  });

  it("places the listing's: front on the west side wall, rear by the patio doors, and one off the flat roof", () => {
    const m = listing91770873("");
    const ext = exteriorOf(m);
    const plan = planRoofs(m);
    const main = plan.blocks[0];
    const placed = assignDownpipes(plan, ext.downpipes!, ext.flatRoofSkirt);
    expect(placed.blocks[0]).toHaveLength(2);
    expect(placed.flats).toHaveLength(1);
    const parts = roofParts(plan, { gutters: true, skirt: ext.flatRoofSkirt, downpipes: ext.downpipes });
    const drops = parts.pipes.filter(([a, b]) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9 && a[1] - b[1] > 0.5).map(([a, b]) => ({ x: a[0], z: a[2], foot: b[1] }));
    const west = main.x0 - EXT_WALL_T / 2;
    const rear = main.z0 - EXT_WALL_T / 2;
    // Rear: between the patio doors and the kitchen window, to the ground; nothing at the two-storey's west rear corner.
    expect(drops.some((d) => Math.abs(d.x - 1.95) < 0.01 && d.z < rear && d.foot === plan.groundY)).toBe(true);
    expect(drops.some((d) => Math.abs(d.x - west) < 0.5 && d.z < rear)).toBe(false);
    // Front: on the hipped west end by the front corner, onto the single-storey roof.
    expect(drops.some((d) => d.x < west && Math.abs(d.z - 1.05) < 0.01 && d.foot === plan.flatRoofs[0].top)).toBe(true);
    // The single-storey's west rear corner, to the ground.
    expect(drops.some((d) => d.x < -4.3 && d.z < rear && d.foot === plan.groundY)).toBe(true);
  });

  it("drops spots on a skirted flat-roof edge or far from any wall, and keeps the skirt's own downpipes", () => {
    const m = listing91770873("");
    const ext = exteriorOf(m);
    const plan = planRoofs(m);
    const front = (620 - 430) / 73 + EXT_WALL_T / 2 + 0.1;
    const placed = assignDownpipes(plan, [{ x: 0.5, y: front }, { x: 2, y: -2 }], ext.flatRoofSkirt);
    expect(placed.blocks.flat()).toHaveLength(0);
    expect(placed.flats).toHaveLength(0);
    const auto = roofParts(plan, { gutters: true, skirt: ext.flatRoofSkirt });
    const none = roofParts(plan, { gutters: true, skirt: ext.flatRoofSkirt, downpipes: [] });
    // Only the main roof's automatic pair goes; the skirt's stay.
    expect(none.pipes.length).toBeGreaterThan(0);
    expect(none.pipes.length).toBeLessThan(auto.pipes.length);
  });

  it("stands a soil stack against the nearest wall, from the roof below up through the eaves", () => {
    const m = listing91770873("");
    const plan = planRoofs(m);
    const main = plan.blocks[0];
    const s = soilStack(plan, -0.8, 0.75)!;
    const [lo, hi] = s.line;
    expect(lo[0]).toBeCloseTo(main.x0 - EXT_WALL_T / 2 - SOIL_R - 0.03, 6);
    expect(lo[2]).toBeCloseTo(0.75);
    expect(lo[1]).toBeCloseTo(plan.flatRoofs[0].top);
    // Its top clears the tiles above it, and the vent terminal sits on it.
    expect(hi[1]).toBeGreaterThan(roofHeightAt(main, hi[0], hi[2])!);
    expect(hi[1]).toBeLessThan(roofHeightAt(main, hi[0], hi[2])! + 0.5);
    expect(s.vent).toEqual(hi);
    // Not against the party wall, and nothing when no wall is near.
    expect(soilStack(plan, main.x1 + 0.3, -2)).toBeNull();
    expect(soilStack(plan, 2, -2)).toBeNull();
    const parts = roofParts(plan, { gutters: false, soilPipes: [{ x: -0.8, y: 0.75 }] });
    expect(parts.soil).toHaveLength(1);
    expect(parts.vents).toHaveLength(1);
  });
});

describe("flat roof skirt", () => {
  const W = EXT_WALL_T / 2 + FLAT_OVERHANG;
  const blank = (): RoofParts => ({
    tiles: { pos: [], uv: [] },
    gables: [],
    trim: [],
    ceiling: [],
    membrane: { pos: [], uv: [] },
    edgeTrim: [],
    flashing: [],
    brick: { pos: [], uv: [] },
    cement: [],
    caps: [],
    gutters: [],
    pipes: [],
    soil: [],
    vents: [],
    pots: [],
  });
  const verts = (pos: number[]) => Array.from({ length: pos.length / 3 }, (_, i) => pos.slice(i * 3, i * 3 + 3));
  const listing = (canopies?: { x: number; y: number }[][]) => {
    const m = listing91770873("");
    if (canopies) m.floors.find((f) => f.level === 0)!.canopies = canopies;
    const plan = planRoofs(m);
    return { m, plan, fr: plan.flatRoofs[0], skirt: exteriorOf(m).flatRoofSkirt!, main: plan.blocks[0] };
  };
  // Front wall of the porch and hall, and the left and right walls of the single-storey part, world metres.
  const FRONT = (620 - 430) / 73;
  const LEFT = (530 - 865) / 73;
  const RIGHT = (1045 - 865) / 73;

  it("runs the listing's front skirt right up to the two-storey wall over the hall, hipped at both ends", () => {
    const { fr, skirt, main } = listing();
    const run = skirtRun(fr, skirt);
    // Set deeper than there is room for, it stops at the face of the two-storey wall.
    expect(run).toBeLessThan(skirt.depth);
    expect(FRONT + W - run).toBeCloseTo(main.z1 + EXT_WALL_T / 2, 6);
    const pieces = skirtedEdges(fr, skirt);
    const front = pieces.find((e) => e.axis === "x" && Math.abs(e.at - FRONT) < 1e-6)!;
    expect([skirtEnd(front, 0, pieces), skirtEnd(front, 1, pieces)]).toEqual(["hip", "hip"]);
    // A flashing along the wall where the top of the slope meets it.
    const parts = blank();
    skirtParts(fr, skirt, parts);
    const top = skirtEaves(fr, skirt).yE + run * Math.tan((skirt.pitchDeg * Math.PI) / 180);
    expect(Math.max(...verts(parts.tiles.pos).map((v) => v[1]))).toBeCloseTo(top, 6);
    expect(verts(parts.flashing).some((v) => Math.abs(v[2] - (main.z1 + EXT_WALL_T / 2)) < 0.01 && v[1] > top)).toBe(true);
    // Hip tiles on both front corners.
    expect(parts.caps).toHaveLength(2);
  });

  it("returns the skirt round the corners and keeps it off the back of the garage", () => {
    const { plan, fr, skirt, main } = listing();
    const pieces = skirtedEdges(fr, skirt);
    const sides = pieces.filter((e) => e.axis === "z");
    expect(sides).toHaveLength(2);
    // The right return runs back to the two-storey wall; the left one stops short, open-ended.
    const right = sides.find((e) => e.out === 1)!;
    expect(skirtEnd(right, 0, pieces)).toBe("wall");
    expect(right.a).toBeCloseTo(main.z1, 6);
    const left = sides.find((e) => e.out === -1)!;
    expect(left.cut).toEqual([true, false]);
    expect(left.a).toBeCloseTo(FRONT + W - skirt.returns!, 6);
    const parts = roofParts(plan, { gutters: true, skirt });
    // Every tile below the main roof's eaves belongs to the skirt, and none reaches the rear.
    const low = verts(parts.tiles.pos).filter((v) => v[1] < main.y - 1);
    expect(low.length).toBeGreaterThan(0);
    for (const v of low) expect(v[2]).toBeGreaterThan(FRONT + W - skirt.returns! - 1e-6);
    // The tiles cover the front eaves, so the drip trim stays on the plain edges only.
    const trim = verts(parts.edgeTrim);
    expect(trim.some((v) => v[2] > FRONT)).toBe(false);
    expect(trim.some((v) => v[2] < (22 - 430) / 73)).toBe(true);
  });

  it("gutters the skirt, round the hips, with downpipes where the gutters stop", () => {
    const { plan, fr, skirt, main } = listing();
    const parts = roofParts(plan, { gutters: true, skirt });
    const yG = skirtEaves(fr, skirt).yE - 0.03;
    const front = parts.gutters.find(([a, b]) => Math.abs(a[1] - yG) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6 && a[2] > FRONT)!;
    expect(front).toBeDefined();
    // Out past both front corners, to meet the returns' gutters.
    expect(Math.min(front[0][0], front[1][0])).toBeLessThan(LEFT - W);
    expect(Math.max(front[0][0], front[1][0])).toBeGreaterThan(RIGHT + W);
    // Downpipes to the ground in the corner by the two-storey wall, and where the left return stops.
    const feet = parts.pipes.filter(([, b]) => Math.abs(b[1] - plan.groundY) < 1e-6).map(([, b]) => b);
    expect(feet.some((p) => p[0] > RIGHT && Math.abs(p[2] - (main.z1 + EXT_WALL_T / 2 + 0.15)) < 0.01)).toBe(true);
    expect(feet.some((p) => p[0] < LEFT && p[2] < FRONT - 1)).toBe(true);
  });

  it("mitres a valley into an inside corner, keeping one depth all round", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    const fr = planFlat([L], [], [], 2.4, 2.7)!;
    const skirt: FlatRoofSkirt = { sides: ["front", "rear", "left", "right"], depth: 0.8, pitchDeg: 30 };
    const pieces = skirtedEdges(fr, skirt);
    expect(pieces).toHaveLength(6);
    const inner = pieces.find((e) => e.axis === "x" && Math.abs(e.at - 2) < 1e-9)!;
    expect([skirtEnd(inner, 0, pieces), skirtEnd(inner, 1, pieces)]).toEqual(["valley", "hip"]);
    expect(skirtRun(fr, skirt)).toBeCloseTo(0.8);
    // Both slopes run up the valley to the same point, and nothing rises above the top of the slopes.
    const parts = blank();
    skirtParts(fr, skirt, parts);
    const yT = 2.7 - 0.03 + 0.8 * Math.tan(Math.PI / 6);
    const c = 2 + W - 0.8;
    const atValley = verts(parts.tiles.pos).filter((v) => Math.abs(v[0] - c) < 1e-6 && Math.abs(v[2] - c) < 1e-6 && Math.abs(v[1] - yT) < 1e-6);
    expect(atValley.length).toBeGreaterThanOrEqual(2);
    for (const v of verts(parts.tiles.pos)) expect(v[1]).toBeLessThanOrEqual(yT + 1e-9);
  });

  it("cuts the depth back so facing slopes meet in a ridge instead of crossing", () => {
    const strip = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 5 },
      { x: 0, y: 5 },
    ];
    const fr = planFlat([strip], [], [], 2.4, 2.7)!;
    expect(skirtRun(fr, { sides: ["left", "right"], depth: 2, pitchDeg: 30 })).toBeCloseTo(0.5 + W);
    // Hipped at both ends of the short edges, which close to a point: every edge still gets its slope.
    const parts = blank();
    skirtParts(fr, { sides: ["front", "rear", "left", "right"], depth: 2, pitchDeg: 30 }, parts);
    expect(parts.tiles.pos.length / 9).toBeGreaterThanOrEqual(4);
  });

  it("still roofs the porch when its canopy is narrowed, made shallower or removed", () => {
    const cases: [string, { x: number; y: number }[][]][] = [
      [
        "narrowed",
        [
          [
            { x: 530, y: 515 },
            { x: 680, y: 515 },
            { x: 680, y: 620 },
            { x: 530, y: 620 },
          ],
        ],
      ],
      [
        "shallower",
        [
          [
            { x: 530, y: 515 },
            { x: 730, y: 515 },
            { x: 730, y: 575 },
            { x: 530, y: 575 },
          ],
        ],
      ],
      ["removed", []],
    ];
    for (const [name, canopies] of cases) {
      const { plan, fr, skirt, main } = listing(canopies);
      const pieces = skirtedEdges(fr, skirt);
      const run = skirtRun(fr, skirt);
      // Where the garage front meets the porch or hall the skirt turns an inside corner.
      const ends = pieces.flatMap((e) => [skirtEnd(e, 0, pieces), skirtEnd(e, 1, pieces)]);
      expect(ends, name).toContain("valley");
      const parts = roofParts(plan, { gutters: true, skirt });
      // Every skirted stretch gets its slope, and nothing rises above the top of the slopes.
      expect(parts.tiles.pos.length / 9, name).toBeGreaterThanOrEqual(pieces.length + roofGeometry(main).slopes.length / 9);
      const yT = skirtEaves(fr, skirt).yE + run * Math.tan((skirt.pitchDeg * Math.PI) / 180);
      for (const v of verts(parts.tiles.pos).filter((p) => p[1] < main.y - 1)) expect(v[1], name).toBeLessThanOrEqual(yT + 1e-9);
    }
    // A narrowed porch limits the depth all round, so the slopes up its two sides meet in a ridge.
    const narrow = listing(cases[0][1]);
    expect(skirtRun(narrow.fr, narrow.skirt)).toBeCloseTo((680 - 530) / 73 / 2 + W, 6);
  });

  it("drops the skirt's eaves to the wall tops, with its gutter, fascia, soffit and the porch ceiling", () => {
    const { plan, fr, skirt } = listing();
    const { yE, ySoffit } = skirtEaves(fr, skirt);
    expect(yE).toBeCloseTo(fr.y, 6);
    expect(ySoffit).toBeCloseTo(fr.y - SKIRT_FASCIA, 6);
    // Never below the wall tops, and level with the deck when not dropped.
    expect(skirtEaves(fr, { ...skirt, drop: 5 }).yE).toBeCloseTo(fr.y, 6);
    expect(skirtEaves(fr, { ...skirt, drop: 0 })).toEqual({ yE: fr.top - 0.03, ySoffit: fr.y - 0.04 });
    const { drop: _, ...level } = skirt;
    expect(roofParts(plan, { gutters: true, skirt: { ...level, drop: 0 } })).toEqual(roofParts(plan, { gutters: true, skirt: level }));

    const parts = roofParts(plan, { gutters: true, skirt });
    // The front gutter hangs off the lowered fascia; the porch ceiling is level with the lowered soffit.
    expect(parts.gutters.some(([a, b]) => Math.abs(a[1] - (yE - 0.03)) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6 && a[2] > FRONT)).toBe(true);
    expect(verts(parts.trim).some((v) => Math.abs(v[1] - ySoffit) < 1e-6 && Math.abs(v[2] - (FRONT + W)) < 1e-6)).toBe(true);
    expect(parts.ceiling.length).toBeGreaterThan(0);
    for (const v of verts(parts.ceiling)) expect(v[1]).toBeCloseTo(ySoffit, 6);
    // The plain edges at the back keep their fascia up at the deck.
    expect(verts(parts.trim).some((v) => Math.abs(v[1] - (fr.top - 0.03)) < 1e-6 && v[2] < (22 - 430) / 73)).toBe(true);
    // The tiles still clear the wall tops at the walls' outer faces.
    const t = Math.tan((skirt.pitchDeg * Math.PI) / 180);
    expect(yE + FLAT_OVERHANG * t).toBeGreaterThan(fr.y);
  });

  it("keeps the deck's membrane under a dropped skirt's tiles", () => {
    const { plan, fr, skirt } = listing();
    const t = Math.tan((skirt.pitchDeg * Math.PI) / 180);
    const { yE } = skirtEaves(fr, skirt);
    const parts = roofParts(plan, { gutters: true, skirt });
    const membrane = verts(parts.membrane.pos);
    expect(membrane.length).toBeGreaterThan(0);
    // Over the hall and porch the front slope is the highest thing: no membrane above it.
    for (const v of membrane.filter((p) => p[0] > LEFT + 0.01 && p[0] < RIGHT - 0.01)) expect(v[1]).toBeLessThanOrEqual(yE + (FRONT + W - v[2]) * t + 1e-6);
    // The membrane still runs right up to the plain back edge.
    expect(Math.min(...membrane.map((v) => v[2]))).toBeLessThan((22 - 430) / 73 - EXT_WALL_T / 2);
    // Nor does the deck's flashing stand out of the tiles where they run into the two-storey wall over the hall,
    // though it stays along the wall beside the garage's flat roof.
    const deckFlashing = verts(parts.flashing).filter((v) => Math.abs(v[1] - (fr.top + 0.15)) < 1e-6);
    expect(deckFlashing.some((v) => v[0] > -0.4 && v[2] > 0)).toBe(false);
    expect(deckFlashing.some((v) => v[2] < -1)).toBe(true);
  });

  it("cuts rectangles out of rectangles", () => {
    const left = cutBoxes([{ x0: 0, z0: 0, x1: 4, z1: 3 }], [{ x0: -1, z0: 2.5, x1: 5, z1: 3 }, { x0: 3.5, z0: 0, x1: 4, z1: 1 }]);
    const area = left.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    expect(area).toBeCloseTo(12 - 4 * 0.5 - 0.5 * 1, 9);
    expect(cutBoxes([{ x0: 0, z0: 0, x1: 1, z1: 1 }], [{ x0: 2, z0: 2, x1: 3, z1: 3 }])).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
  });

  it("closes the lowered end where a dropped skirt's return stops", () => {
    const { plan, fr, skirt } = listing();
    const left = skirtedEdges(fr, skirt).find((e) => e.axis === "z" && e.out === -1)!;
    const { yE, ySoffit } = skirtEaves(fr, skirt);
    const parts = roofParts(plan, { gutters: true, skirt });
    // A face across the end of the return, from the lowered soffit up past the deck.
    const end = verts(parts.trim).filter((v) => Math.abs(v[2] - left.a) < 1e-6 && v[0] < LEFT + skirtRun(fr, skirt));
    expect(Math.min(...end.map((v) => v[1]))).toBeCloseTo(ySoffit, 6);
    expect(Math.max(...end.map((v) => v[1]))).toBeGreaterThan(fr.top);
    expect(end.some((v) => Math.abs(v[1] - yE) < 1e-6 && Math.abs(v[0] - (LEFT - W)) < 1e-6)).toBe(true);
  });

  it("keeps the slope under the first-floor front windows, as listed and with the extension", () => {
    for (const m of [listing91770873(""), listing91770873Proposed("")]) {
      const plan = planRoofs(m);
      const skirt = exteriorOf(m).flatRoofSkirt!;
      const fr = plan.flatRoofs[0];
      // Top of the slope, and of the flashing above it.
      const top = skirtEaves(fr, skirt).yE + skirtRun(fr, skirt) * Math.tan((skirt.pitchDeg * Math.PI) / 180) + 0.1;
      const first = m.floors.find((f) => f.level === 1)!;
      const front = first.openings.filter((o) => o.kind === "window" && o.orientation === "h" && o.y === 1285);
      expect(front.length).toBeGreaterThanOrEqual(m.preset?.id.includes("proposed") ? 3 : 2);
      for (const o of front) expect(floorBase(m, first) + windowSill(o)).toBeGreaterThan(top + 0.1);
    }
  });
});
