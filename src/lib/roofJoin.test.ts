import { describe, expect, it } from "vitest";
import { joinRoofs, planRoofs, roofGeometry, roofHeightAt, roofTrim, subtractRegion, subtractSegment, type Half, type P3, type RoofBlock } from "./roof";
import { roofParts } from "./roofParts";
import { EXT_WALL_T } from "./geometry";
import type { HouseModel } from "../types";
import { listing91770873, listing91770873Proposed, listingSite } from "./houses/listing91770873";
import { planningCheck } from "./planning";

describe("cutting one roof where another covers it", () => {
  const tri: P3[] = [
    [0, 0, 0],
    [2, 0, 0],
    [0, 0, 2],
  ];
  const area = (pts: P3[]) => {
    let a = 0;
    for (let i = 1; i + 1 < pts.length; i++) a += Math.abs((pts[i][0] - pts[0][0]) * (pts[i + 1][2] - pts[0][2]) - (pts[i][2] - pts[0][2]) * (pts[i + 1][0] - pts[0][0])) / 2;
    return a;
  };
  // x < 1 and z < 1.
  const box: Half[] = [
    { n: [1, 0, 0], d: -1 },
    { n: [0, 0, 1], d: -1 },
  ];

  it("leaves the part of a polygon outside a region, in pieces that do not overlap, uvs carried along", () => {
    const pieces = subtractRegion({ pts: tri, uv: tri.map((p) => [p[0], p[2]]) }, box);
    // The triangle (area 2) less the unit square in its corner.
    expect(pieces.reduce((s, p) => s + area(p.pts), 0)).toBeCloseTo(1);
    for (const p of pieces) p.pts.forEach((q, k) => expect(p.uv![k]).toEqual([q[0], q[2]]));
  });

  it("keeps a polygon whole when it misses the region, and drops it when inside", () => {
    expect(subtractRegion({ pts: tri }, [{ n: [1, 0, 0], d: 5 }])).toHaveLength(1);
    expect(subtractRegion({ pts: tri }, [{ n: [1, 0, 0], d: -5 }])).toHaveLength(0);
  });

  it("cuts a segment where it passes through a region", () => {
    const out = subtractSegment([-1, 0, 0.5], [3, 0, 0.5], [...box, { n: [-1, 0, 0], d: 0 }]);
    expect(out.map(([a, b]) => [a[0], b[0]])).toEqual([
      [-1, 0],
      [1, 3],
    ]);
  });
});

/** The listing's Proposed, its New Room's front wall set back `s` metres, and the garage's below too if asked. */
function setBack(s: number, opts: { ground?: boolean; mode?: "continue" | "separate"; style?: "hip" | "gable" } = {}): HouseModel {
  const m = listing91770873Proposed("");
  const px = s * 73;
  const first = m.floors.find((f) => f.level === 1)!;
  const room = first.rooms.find((r) => r.name === "New Room")!;
  room.polygon = room.polygon.map((p) => (p.y > 1200 ? { ...p, y: p.y - px } : p));
  if (opts.ground) {
    const g = m.floors.find((f) => f.level === 0)!;
    const garage = g.rooms.find((r) => r.name === "Garage")!;
    garage.polygon = garage.polygon.map((p) => (p.y > 500 ? { ...p, y: p.y - px } : p));
    g.canopies = g.canopies!.map((c) => c.map((p) => (p.y < 520 ? { ...p, y: p.y - px } : p)));
  }
  m.exterior = { ...m.exterior!, extensionRoof: opts.mode ?? "continue", roofStyle: opts.style ?? "hip" };
  return m;
}

/** Triangles from a flat soup. */
function tris(pos: number[]): P3[][] {
  const out: P3[][] = [];
  for (let i = 0; i + 8 < pos.length; i += 9) out.push([0, 3, 6].map((k) => [pos[i + k], pos[i + k + 1], pos[i + k + 2]] as P3));
  return out;
}

/** Height of a triangle over plan point (x, z), or null when the point is outside it. */
function triHeight(t: P3[], x: number, z: number): number | null {
  const [a, b, c] = t;
  const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
  if (Math.abs(det) < 1e-12) return null;
  const l1 = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det;
  const l2 = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det;
  if (l1 < 0 || l2 < 0 || l1 + l2 > 1) return null;
  return a[1] + l1 * (b[1] - a[1]) + l2 * (c[1] - a[1]);
}

/**
 * Sample the joined pitched roofs over a fine grid: everywhere some block has
 * tiles, exactly one triangle shows at the top, at the highest block's height
 * (no gap, no two faces fighting), and nothing shows anywhere else.
 */
function expectOneSurface(blocks: RoofBlock[]) {
  const all = blocks.flatMap((_, i) => tris(joinRoofs(blocks, i).slopes));
  const xs = blocks.flatMap((b) => [b.x0 - 1, b.x1 + 1]);
  const zs = blocks.flatMap((b) => [b.z0 - 1, b.z1 + 1]);
  let checked = 0;
  for (let x = Math.min(...xs) + 0.0137; x < Math.max(...xs); x += 0.0971) {
    for (let z = Math.min(...zs) + 0.0291; z < Math.max(...zs); z += 0.1033) {
      // A later block's slopes past its tucked end count only inside the first (main) block's walls.
      const m = blocks[0];
      const inMain = x > m.x0 - half && x < m.x1 + half && z > m.z0 - half && z < m.z1 + half;
      const pastTuck = (b: RoofBlock) => {
        if (!b.tuck) return false;
        const u = b.axis === "x" ? x : z;
        const [u0, u1] = b.axis === "x" ? [b.x0, b.x1] : [b.z0, b.z1];
        return (b.tuck[0] > 0 && u < u0) || (b.tuck[1] > 0 && u > u1);
      };
      const want = blocks
        .filter((b, i) => i === 0 || inMain || !pastTuck(b))
        .map((b) => roofHeightAt(b, x, z))
        .filter((h): h is number => h !== null);
      const hs = all.map((t) => triHeight(t, x, z)).filter((h): h is number => h !== null);
      if (!want.length) {
        expect(hs, `no roof at ${x}, ${z}`).toHaveLength(0);
        continue;
      }
      // Within a couple of millimetres of where two slopes cross, the earlier roof's shows (see joinRoofs).
      const top = Math.max(...want);
      expect(hs.length, `a roof at ${x}, ${z}`).toBeGreaterThan(0);
      const shown = Math.max(...hs);
      expect(Math.abs(shown - top), `height at ${x}, ${z}`).toBeLessThan(0.0025);
      expect(hs.filter((h) => shown - h < 1e-3).length, `one face at ${x}, ${z}`).toBe(1);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(1000);
}

const tan28 = Math.tan((28 * Math.PI) / 180);
const half = EXT_WALL_T / 2;

function blocksOf(s: number, opts?: Parameters<typeof setBack>[1]) {
  const plan = planRoofs(setBack(s, opts));
  const ext = plan.blocks.find((b) => b.x0 < -4)!;
  const main = plan.blocks.find((b) => b !== ext)!;
  return { plan, ext, main };
}

describe("a set-back side extension", () => {
  it("keeps the flush Proposed under one hipped roof, drawn as before", () => {
    const plan = planRoofs(setBack(0));
    expect(plan.blocks).toHaveLength(1);
    const [b] = plan.blocks;
    expect([b.start, b.end, b.tuck]).toEqual(["hip", "flush", undefined]);
    expect(plan.extensions).toEqual([{ key: "extension", setBack: 0, own: false, drop: 0, pitchDeg: 28 }]);
    // With one roof nothing is cut away.
    const j = joinRoofs(plan.blocks, 0);
    const t = roofTrim(b);
    expect(j.slopes).toEqual(roofGeometry(b).slopes);
    expect(j.trim).toEqual(t.trim);
    expect(j.gutters).toEqual(t.gutters);
    expect(j.caps).toEqual(t.caps);
  });

  it("treats a few centimetres of tracing slack as flush", () => {
    expect(planRoofs(setBack(0.03)).blocks).toHaveLength(1);
  });

  for (const s of [0.5, 1.0]) {
    it(`gives the extension set back ${s} m its own lower roof at the same pitch, the main roof keeping its hip`, () => {
      const { plan, ext, main } = blocksOf(s);
      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[0]).toBe(main);
      expect(main.start).toBe("hip");
      expect(main.z1).toBeCloseTo(ext.z1 + s);
      expect([ext.axis, ext.start, ext.end, ext.pitchDeg]).toEqual(["x", "hip", "flush", 28]);
      // The same pitch over a span `s` shallower: the ridge sits s/2 tan(pitch) lower, and the rear slopes are one plane.
      const drop = roofGeometry(main).ridgeY - roofGeometry(ext).ridgeY;
      expect(drop).toBeCloseTo((s / 2) * tan28);
      expect(roofHeightAt(ext, -2, -5)).toBeCloseTo(roofHeightAt(main, 1, -5)!);
      expect(plan.extensions).toEqual([{ key: "extension", setBack: expect.closeTo(s, 6), own: true, drop: expect.closeTo(drop, 6), pitchDeg: 28 }]);
    });

    it(`puts the extension's front eaves on its set-back wall (${s} m), with no roof in front of it`, () => {
      const { plan, ext, main } = blocksOf(s);
      const front = ext.z1 + half + ext.overhang;
      expect(Math.max(...roofGeometry(ext).eaves.map((p) => p[1]))).toBeCloseTo(front);
      const mainWest = main.x0 - half - main.overhang;
      const pitched = plan.blocks.flatMap((_, i) => tris(joinRoofs(plan.blocks, i).slopes));
      for (let x = ext.x0 - 1; x < mainWest - 0.01; x += 0.05)
        for (let z = front + 0.01; z < main.z1 + 1; z += 0.05) expect(pitched.every((t) => triHeight(t, x, z) === null)).toBe(true);
    });

    it(`meets the main roof without gaps or doubled-up slopes (${s} m)`, () => {
      expectOneSurface(blocksOf(s).plan.blocks);
    });

    it(`joins the eaves at the inside corner and keeps the main roof's eaves out of the new room (${s} m)`, () => {
      const { plan, ext, main } = blocksOf(s);
      const [m, e] = [joinRoofs(plan.blocks, 0), joinRoofs(plan.blocks, 1)];
      // The extension's front gutter and the main hip end's gutter meet at the corner (within the 2 mm a tie gives the main roof).
      const meet = e.gutters.flat().some((a) => m.gutters.flat().some((b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.005));
      expect(meet).toBe(true);
      // Nothing of the main roof's eaves hangs inside the extension's walls.
      const inside = (q: P3) => q[0] > ext.x0 + 0.01 && q[0] < main.x0 - half - 0.01 && q[2] > ext.z0 + 0.01 && q[2] < ext.z1 + half - 0.01;
      for (const t of tris(m.trim)) {
        const c: P3 = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
        expect(inside(c) && c[1] < ext.y + 0.3).toBe(false);
      }
      for (const [a, b] of m.gutters) expect(inside(a) || inside(b)).toBe(false);
      // The main hip line up from the front corner stays; the rear one only above the extension's ridge.
      const hip = m.caps.find(([a]) => a[2] > main.z1);
      expect(hip![0][0]).toBeCloseTo(main.x0 - half - main.overhang);
      const extRidge = roofGeometry(ext).ridgeY;
      for (const [a, b] of m.caps) expect(Math.max(a[1], b[1])).toBeGreaterThan(extRidge - 1e-6);
    });
  }

  it("sets a separate set-back extension down by at least the chosen drop", () => {
    const { plan, ext, main } = blocksOf(0.5, { mode: "separate" });
    expect(roofGeometry(main).ridgeY - roofGeometry(ext).ridgeY).toBeCloseTo(0.3);
    expect(ext.pitchDeg).toBeLessThan(28);
    expectOneSurface(plan.blocks);
    // A set-back that already drops the ridge further keeps the pitch.
    expect(blocksOf(1.5, { mode: "separate" }).ext.pitchDeg).toBe(28);
  });

  it("meets a flush separate extension without gaps too, leaving the main roof's eaves and front hip whole", () => {
    const { plan, main } = blocksOf(0, { mode: "separate" });
    expectOneSurface(plan.blocks);
    // The extension's shallower slope, run on under the main roof, stays out of the main roof's eaves overhang.
    const corner = main.x0 - half - main.overhang;
    const hip = joinRoofs(plan.blocks, 0).caps.find(([a, b]) => Math.max(a[2], b[2]) > main.z1);
    // Eased to a shallower pitch from the same wall tops, the extension's slope stands a centimetre or two proud of
    // the main roof's over the corner overhang; the hip tiles still run down to the corner.
    const foot = hip![0][2] > hip![1][2] ? hip![0] : hip![1];
    expect(foot[0]).toBeCloseTo(corner);
    const ext = tris(joinRoofs(plan.blocks, 1).slopes);
    for (let x = main.x0 + 0.05; x < main.x0 + 3; x += 0.1) expect(ext.every((t) => triHeight(t, x, main.z1 + half + 0.1) === null)).toBe(true);
  });

  it("tucks a set-back extension behind a gabled main roof", () => {
    const { plan, ext, main } = blocksOf(0.75, { style: "gable" });
    expect(main.start).toBe("gable");
    expect(ext.start).toBe("gable");
    expectOneSurface(plan.blocks);
  });

  it("gives a narrower two-storey rear extension its own roof, run in under the main rear slope", () => {
    const m = listing91770873("");
    const first = m.floors.find((f) => f.level === 1)!;
    first.rooms.push({
      id: "rear",
      name: "Rear",
      polygon: [
        { x: 700, y: 600 },
        { x: 950, y: 600 },
        { x: 950, y: 795 },
        { x: 700, y: 795 },
      ],
      roofGroup: "rear",
    });
    const plan = planRoofs(m);
    expect(plan.blocks).toHaveLength(2);
    const rear = plan.blocks[1];
    expect([rear.axis, rear.start, rear.end]).toEqual(["z", "hip", "flush"]);
    expect(rear.tuck![1]).toBeGreaterThan(0);
    expectOneSurface(plan.blocks);
  });

  it("roofs the gap in front of the set-back wall over the garage, and follows a garage set back too", () => {
    const { plan, ext } = blocksOf(0.5);
    const z = ext.z1 + 0.25;
    const covers = (p: typeof plan, x: number, zz: number) => p.flatRoofs.some((f) => f.rects.some((r) => r.x0 < x && r.x1 > x && r.z0 < zz && r.z1 > zz));
    expect(covers(plan, -3, z)).toBe(true);
    // The garage set back as well: the porch roof in front of it reaches back to the wall.
    const model = setBack(0.5, { ground: true });
    const g = planRoofs(model);
    expect(covers(g, -3, ext.z1 + half + 0.1)).toBe(true);
    const parts = roofParts(g, { gutters: true, skirt: model.exterior!.flatRoofSkirt });
    expect(parts.tiles.pos.length).toBeGreaterThan(0);
  });
});

describe("planning check on a set-back extension", () => {
  const rules = (s: number) => {
    const site = listingSite();
    const r = planningCheck(listing91770873(""), setBack(s), { current: site, proposed: site });
    return { ridge: r.rules.find((x) => x.id.endsWith("-ridge"))!, pitch: r.rules.find((x) => x.id.endsWith("-pitch"))! };
  };
  const metres = (text: string) => [...text.matchAll(/about ([\d.]+) m/g)].map((m) => Number(m[1]));

  it("measures the extension's own lower ridge, not the main roof's beside it", () => {
    const flush = metres(rules(0).ridge.reason);
    expect(flush[0]).toBe(flush[1]);
    const { ridge, pitch } = rules(1);
    expect(ridge.status).toBe("pass");
    const [own, house] = metres(ridge.reason);
    expect(house - own).toBeCloseTo(0.3, 1);
    expect(pitch.status).toBe("pass");
  });
});
