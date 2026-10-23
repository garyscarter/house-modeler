import { describe, expect, it } from "vitest";
import type { Fixture } from "../types";
import { byId } from "./catalogue";
import { builtInLayout, frontAreas, isJoinery, joineryOf, patchJoinery, shelfStack, shelfStackPatch } from "./joinery";

const fx = (type: string, extra: Partial<Fixture> = {}): Fixture => ({ id: "f", type, x: 0, y: 0, rot: 0, ...extra });
const ALCOVE = { w: 0.9, d: 0.4, h: 2.25 };

describe("joineryOf", () => {
  it("takes the catalogue's settings and lets the fixture override them", () => {
    const item = byId("built-in-alcove")!;
    expect(joineryOf(fx("built-in-alcove"), item, ALCOVE)).toMatchObject({ baseH: 0.85, baseFront: "shaker", top: true, plinth: true, shelves: 3, upperFront: "open", upperD: 0.3, bays: 2, topBox: 0 });
    expect(joineryOf(fx("built-in-alcove", { joinery: { baseFront: "glass", bays: 3 } }), item, ALCOVE)).toMatchObject({ baseFront: "glass", bays: 3, shelves: 3 });
  });
  it("keeps settings in range", () => {
    const j = joineryOf(fx("built-in-alcove", { joinery: { bays: 40, baseH: 9, upperD: 2, shelves: -3, topBox: 5 } }), byId("built-in-alcove")!, ALCOVE);
    expect(j.bays).toBe(12);
    expect(j.baseH).toBeCloseTo(2.05);
    expect(j.upperD).toBe(0.4);
    expect(j.shelves).toBe(0);
    expect(j.topBox).toBe(0);
  });
  it("colours the carcass and top like the unit unless set", () => {
    const item = byId("built-in-alcove")!;
    expect(joineryOf(fx("built-in-alcove", { color: "#123456" }), item, ALCOVE)).toMatchObject({ carcass: "#123456", topColor: "#123456" });
    expect(joineryOf(fx("built-in-alcove", { worktop: "#222222", joinery: { carcass: "#ffffff" } }), item, ALCOVE)).toMatchObject({ carcass: "#ffffff", topColor: "#222222" });
  });
  it("knows which items are joinery", () => {
    for (const id of ["built-in-alcove", "window-seat", "wall-cube", "floating-shelf"]) expect(isJoinery(byId(id)), id).toBe(true);
    expect(isJoinery(byId("sofa-3"))).toBe(false);
    expect(isJoinery(undefined)).toBe(false);
  });
});

describe("builtInLayout", () => {
  it("stacks plinth, base, top and shelves up an alcove unit", () => {
    const L = builtInLayout(joineryOf(fx("built-in-alcove"), byId("built-in-alcove")!, ALCOVE), 0.9, 2.25);
    expect(L.plinth).toEqual([0, 0.1]);
    expect(L.base![0]).toBeCloseTo(0.1);
    expect(L.base![1]).toBeCloseTo(0.82);
    expect(L.top![1]).toBeCloseTo(0.85);
    expect(L.upper[0]).toBeCloseTo(0.85);
    expect(L.upper[1]).toBeCloseTo(2.25);
    expect(L.topBox).toBeNull();
    expect(L.shelfYs).toHaveLength(3);
    expect(L.shelfYs[0]).toBeCloseTo(0.85 + 1.4 / 4);
    [-0.45, 0, 0.45].forEach((x, i) => expect(L.bayXs[i]).toBeCloseTo(x));
  });
  it("adds a top box, and runs open shelves to the plinth with no base", () => {
    const cup = builtInLayout(joineryOf(fx("built-in-cupboard"), byId("built-in-cupboard")!, { w: 0.9, d: 0.5, h: 2.4 }), 0.9, 2.4);
    expect(cup.topBox![0]).toBeCloseTo(2.0);
    const open = builtInLayout(joineryOf(fx("built-in-shelves"), byId("built-in-shelves")!, { w: 0.9, d: 0.3, h: 2.4 }), 0.9, 2.4);
    expect(open.base).toBeNull();
    expect(open.top).toBeNull();
    expect(open.upper[0]).toBeCloseTo(0.1);
    expect(open.shelfYs).toHaveLength(5);
  });
});

describe("frontAreas", () => {
  it("splits doors from open shelving", () => {
    const item = byId("built-in-alcove")!;
    const a = frontAreas(item, joineryOf(fx("built-in-alcove"), item, ALCOVE), 0.9, 2.25);
    expect(a.closed).toBeCloseTo(0.9 * 0.72);
    expect(a.open).toBeCloseTo(0.9 * 1.4);
    const cube = byId("wall-cube")!;
    const c = frontAreas(cube, joineryOf(fx("wall-cube"), cube, { w: 0.4, d: 0.3, h: 0.4 }), 0.4, 0.4);
    expect(c.closed).toBe(0);
    expect(c.open).toBeCloseTo(0.16);
  });
});

describe("floating shelf stacks", () => {
  it("reads an old single shelf as one board as thick as its height", () => {
    expect(shelfStack(joineryOf(fx("floating-shelf"), byId("floating-shelf")!, { w: 1, d: 0.25, h: 0.04 }), 0.04)).toEqual({ n: 1, t: 0.04, spacing: 0, ys: [0] });
  });
  it("spaces a stack of three over the item's height", () => {
    const s = shelfStack(joineryOf(fx("floating-shelves"), byId("floating-shelves")!, { w: 1, d: 0.25, h: 0.74 }), 0.74);
    expect(s.n).toBe(3);
    expect(s.t).toBe(0.04);
    expect(s.spacing).toBeCloseTo(0.35);
  });
  it("turns a single shelf into a stack and back", () => {
    const item = byId("floating-shelf")!;
    const p = shelfStackPatch(fx("floating-shelf"), item, { n: 3 });
    expect(p.h).toBeCloseTo(0.74);
    expect(p.joinery).toEqual({ shelves: 3, shelfT: 0.04 });
    const q = shelfStackPatch(fx("floating-shelf", p), item, { spacing: 0.3 });
    expect(q.h).toBeCloseTo(0.64);
    const back = shelfStackPatch(fx("floating-shelf", q), item, { n: 1 });
    expect(back.h).toBeCloseTo(0.04);
    expect(back.joinery).toEqual({ shelves: 1 });
  });
});

describe("patchJoinery", () => {
  it("merges settings and drops cleared ones", () => {
    const f = fx("built-in-alcove", { joinery: { bays: 3, fit: "recess" } });
    expect(patchJoinery(f, { baseFront: "slab" })).toEqual({ joinery: { bays: 3, fit: "recess", baseFront: "slab" } });
    expect(patchJoinery(f, { bays: undefined, fit: undefined })).toEqual({ joinery: undefined });
  });
});
