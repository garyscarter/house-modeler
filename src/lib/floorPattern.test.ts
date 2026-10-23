import { describe, expect, it } from "vitest";
import { chevronBlocks, floorUv, herringboneBlocks, hexagons, hexTile, inConvex, longAxisAngle, normaliseAngle, parquetTile, type Block, type XY } from "./floorPattern";

const L = 0.35;
const W = 0.07;

/** Deterministic points spread over a tile. */
function samples(tu: number, tv: number, n = 1500): XY[] {
  const out: XY[] = [];
  let a = 12345;
  const rnd = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < n; i++) out.push([rnd() * tu, rnd() * tv]);
  return out;
}

const edgeLengths = (pts: XY[]) => pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]));
const edgeAngles = (pts: XY[]) =>
  pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const deg = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    return Math.round(((deg % 180) + 180) % 180);
  });

/** Every point of the tile lies in exactly one block. */
function expectCovered(blocks: { pts: XY[] }[], tu: number, tv: number) {
  for (const [x, y] of samples(tu, tv)) {
    const n = blocks.filter((b) => inConvex(b.pts, x, y)).length;
    expect(n, `${x.toFixed(3)},${y.toFixed(3)}`).toBe(1);
  }
}

/** A block running off one side of the tile has a twin with the same key a repeat away, so the repeat has no seam. */
function expectPeriodic(blocks: (Block | { pts: XY[]; key: number })[], tu: number, tv: number) {
  const close = (a: XY[], b: XY[], du: number, dv: number) => a.every((p, i) => Math.abs(p[0] + du - b[i][0]) < 1e-9 && Math.abs(p[1] + dv - b[i][1]) < 1e-9);
  for (const b of blocks) {
    const maxU = Math.max(...b.pts.map((p) => p[0]));
    const maxV = Math.max(...b.pts.map((p) => p[1]));
    if (maxU > tu + 1e-9) expect(blocks.some((o) => o.key === b.key && close(b.pts, o.pts, -tu, 0))).toBe(true);
    if (maxV > tv + 1e-9) expect(blocks.some((o) => o.key === b.key && close(b.pts, o.pts, 0, -tv))).toBe(true);
  }
  // Keys name blocks of one repeat: blocks with one key are whole repeats apart.
  const byKey = new Map<number, XY>();
  for (const b of blocks) {
    const p = b.pts[0];
    const seen = byKey.get(b.key);
    if (!seen) byKey.set(b.key, p);
    else {
      const ku = (p[0] - seen[0]) / tu;
      const kv = (p[1] - seen[1]) / tv;
      expect(Math.abs(ku - Math.round(ku))).toBeLessThan(1e-9);
      expect(Math.abs(kv - Math.round(kv))).toBeLessThan(1e-9);
    }
  }
}

describe("herringbone", () => {
  const [tu, tv] = parquetTile(L, W, 24, 3);
  const blocks = herringboneBlocks(L, W, 24, 3);

  it("repeats every whole number of lattice periods: w√2 along the rows, l√2 across", () => {
    expect(tu).toBeCloseTo(24 * W * Math.SQRT2);
    expect(tv).toBeCloseTo(3 * L * Math.SQRT2);
    // Two blocks per lattice cell.
    expect(new Set(blocks.map((b) => b.key)).size).toBe(2 * 24 * 3);
  });

  it("is made of 350 x 70 mm blocks laid at 45 degrees to the rows, half one way and half the other", () => {
    for (const b of blocks) {
      const lens = edgeLengths(b.pts).sort((x, y) => x - y);
      expect(lens[0]).toBeCloseTo(W);
      expect(lens[1]).toBeCloseTo(W);
      expect(lens[2]).toBeCloseTo(L);
      expect(lens[3]).toBeCloseTo(L);
      expect(new Set(edgeAngles(b.pts))).toEqual(new Set([45, 135]));
    }
    const angles = blocks.map((b) => Math.round((b.angle * 180) / Math.PI));
    expect(new Set(angles)).toEqual(new Set([-45, 45]));
  });

  it("covers the floor with no gaps or overlaps", () => expectCovered(blocks, tu, tv));

  it("meets itself across the edges of the repeat", () => expectPeriodic(blocks, tu, tv));

  it("puts the end of each block against the side of a block at right angles (the zig-zag)", () => {
    // Just past the far end of a block, along its length, is a block turned 90 degrees.
    for (const b of blocks.slice(0, 40)) {
      const [p0, p1, p2] = b.pts;
      const long = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const [a, c] = long ? [p1, p2] : [p2, b.pts[3]];
      const dir: XY = long ? [p1[0] - p0[0], p1[1] - p0[1]] : [p2[0] - p1[0], p2[1] - p1[1]];
      const n = Math.hypot(...dir);
      const x = (a[0] + c[0]) / 2 + (dir[0] / n) * 0.01;
      const y = (a[1] + c[1]) / 2 + (dir[1] / n) * 0.01;
      const next = blocks.find((o) => o !== b && inConvex(o.pts, x, y));
      if (!next) continue; // off the enumerated area
      expect(Math.abs(Math.abs(next.angle - b.angle) - Math.PI / 2)).toBeLessThan(1e-9);
    }
  });
});

describe("chevron", () => {
  const [tu, tv] = parquetTile(L, W, 24, 3);
  const blocks = chevronBlocks(L, W, 24, 3);

  it("has mitred ends along the rows and long sides at 45 degrees, alternating strip by strip", () => {
    for (const b of blocks) {
      const lens = edgeLengths(b.pts);
      expect(lens[0]).toBeCloseTo(W * Math.SQRT2);
      expect(lens[2]).toBeCloseTo(W * Math.SQRT2);
      expect(lens[1]).toBeCloseTo(L);
      expect(lens[3]).toBeCloseTo(L);
      expect(b.pts[0][1]).toBeCloseTo(b.pts[1][1]);
    }
    expect(new Set(blocks.map((b) => Math.round((b.angle * 180) / Math.PI)))).toEqual(new Set([45, 135]));
  });

  it("covers the floor with no gaps or overlaps", () => expectCovered(blocks, tu, tv));

  it("meets itself across the edges of the repeat", () => expectPeriodic(blocks, tu, tv));
});

describe("hexagons", () => {
  const [tu, tv] = hexTile(0.1, 10, 12);
  const hexes = hexagons(0.1, 10, 12);

  it("are 100 mm across the flats, in rows 86.6 mm apart", () => {
    expect(tu).toBeCloseTo(1);
    expect(tv).toBeCloseTo(12 * 0.0866, 3);
    for (const h of hexes) for (const len of edgeLengths(h.pts)) expect(len).toBeCloseTo(0.1 / Math.sqrt(3));
  });

  it("cover the floor with no gaps or overlaps", () => expectCovered(hexes, tu, tv));

  it("meet themselves across the edges of the repeat", () => expectPeriodic(hexes, tu, tv));
});

describe("pattern direction", () => {
  it("leaves texture coordinates alone at 0 degrees and turns them otherwise", () => {
    expect(floorUv(1.5, -2, 0)).toEqual([1.5, -2]);
    // At 45 degrees the pattern's u axis runs along the plan's diagonal.
    const [u, v] = floorUv(Math.SQRT1_2, Math.SQRT1_2, 45);
    expect(u).toBeCloseTo(1);
    expect(v).toBeCloseTo(0);
    const [u2, v2] = floorUv(0, 2, 90);
    expect(u2).toBeCloseTo(2);
    expect(v2).toBeCloseTo(0);
    // Lengths are kept, so blocks stay their real size.
    const [a, b] = floorUv(3, 4, 33);
    expect(Math.hypot(a, b)).toBeCloseTo(5);
  });

  it("normalises angles to a half turn", () => {
    expect(normaliseAngle(0)).toBe(0);
    expect(normaliseAngle(180)).toBe(0);
    expect(normaliseAngle(-45)).toBe(135);
    expect(normaliseAngle(405)).toBe(45);
    expect(normaliseAngle(Number.NaN)).toBe(0);
  });

  it("finds the direction of a room's longest wall", () => {
    const wide = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 3 },
      { x: 0, y: 3 },
    ];
    const deep = wide.map((p) => ({ x: p.y, y: p.x }));
    expect(longAxisAngle(wide)).toBe(0);
    expect(longAxisAngle(deep)).toBe(90);
  });
});
