import { describe, expect, it } from "vitest";
import { planRoofs, roofGeometry, type RoofBlock } from "./roof";
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
