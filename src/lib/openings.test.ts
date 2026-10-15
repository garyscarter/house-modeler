import { describe, expect, it } from "vitest";
import type { Opening } from "../types";
import type { OpeningPlacement } from "./geometry";
import { bayOutline, bayParts, bifoldPanels, boxQuads, casements, openingParts, type Box } from "./openings";

const T = 0.25;
const place = (kind: Opening["kind"], width: number, extra: Partial<Opening> = {}, y1 = 2.1, y0 = 0): OpeningPlacement => ({
  opening: { id: kind, kind, x: 0, y: 0, orientation: "h", widthM: width, ...extra },
  centre: { x: 0, y: 0 },
  dir: { x: 1, y: 0 },
  width,
  y0,
  y1,
});
const leaves = (boxes: Box[]) => boxes.filter((b) => b.mat === "leaf");
const glass = (boxes: Box[]) => boxes.filter((b) => b.mat === "glass");

describe("windows", () => {
  it("splits wider windows into more casements", () => {
    expect([0.6, 1.2, 1.8, 2.6].map(casements)).toEqual([1, 2, 3, 4]);
  });

  it("sets the glazing back from the outside face with a sill outside and a board inside", () => {
    const { boxes } = openingParts(place("window", 1.2, {}, 2.1, 0.9), T, 1);
    for (const g of glass(boxes)) {
      expect(g.p[2]).toBeGreaterThan(0);
      expect(g.p[2]).toBeLessThan(T / 2);
    }
    const sill = boxes.find((b) => b.mat === "sill")!;
    expect(sill.p[2] + sill.s[2] / 2).toBeGreaterThan(T / 2); // projects past the wall face
    expect(sill.p[1]).toBeCloseTo(0.88);
    const board = boxes.find((b) => b.mat === "joinery")!;
    expect(board.p[2] - board.s[2] / 2).toBeLessThan(-T / 2);
  });

  it("puts a transom and top lights in tall windows only", () => {
    expect(glass(openingParts(place("window", 0.6, {}, 2.1, 0.9), T, 1).boxes)).toHaveLength(2);
    expect(glass(openingParts(place("window", 0.6, {}, 2.1, 1.5), T, 1).boxes)).toHaveLength(1);
  });
});

describe("doors", () => {
  it("hinges at the other jamb with flipHinge and swings to the other side with flipSwing", () => {
    const leafOf = (extra: Partial<Opening>) => leaves(openingParts(place("door", 0.8, extra, 2.05), 0.1, 0).boxes)[0];
    const base = leafOf({});
    const hinged = leafOf({ flipHinge: true });
    const swung = leafOf({ flipSwing: true });
    expect(base.p[0]).toBeLessThan(0);
    expect(hinged.p[0]).toBeGreaterThan(0);
    expect(Math.sign(swung.p[2])).toBe(-Math.sign(base.p[2]));
  });

  it("opens an external door into the house", () => {
    const leafGlass = glass(openingParts(place("door", 0.85), T, 1).boxes)[0];
    expect(leafGlass.p[2]).toBeLessThan(0);
  });

  it("opens French doors outwards as a pair", () => {
    const { boxes } = openingParts(place("french", 1.5, {}, 2.1), T, -1);
    const panes = glass(boxes);
    expect(panes).toHaveLength(2);
    for (const p of panes) expect(p.p[2]).toBeLessThan(-0.3);
    expect(panes[0].p[0]).toBeLessThan(0);
    expect(panes[1].p[0]).toBeGreaterThan(0);
  });

  it("folds bi-fold panels into a stack at the hinge jamb", () => {
    const w = 3;
    const n = bifoldPanels(w - 0.12);
    const panes = glass(openingParts(place("bifold", w, {}, 2.1), T, 1).boxes);
    expect(panes).toHaveLength(n);
    // All within the outer third of the opening on the hinge side (left by default).
    for (const p of panes) expect(p.p[0]).toBeLessThan(-w / 2 + w / 3);
    const flipped = glass(openingParts(place("bifold", w, { flipHinge: true }, 2.1), T, 1).boxes);
    for (const p of flipped) expect(p.p[0]).toBeGreaterThan(w / 2 - w / 3);
  });

  it("draws nothing for a gap", () => {
    expect(openingParts(place("gap", 1.2, {}, 2.4), T, 0).boxes).toEqual([]);
  });
});

describe("bays", () => {
  it("cants at 45 degrees, shallower when the opening is narrow", () => {
    const wide = bayOutline(2.4, T);
    expect(wide[1].z - wide[0].z).toBeCloseTo(0.6);
    expect(wide[1].x - wide[0].x).toBeCloseTo(0.6);
    const narrow = bayOutline(1.0, T);
    expect(narrow[1].z - narrow[0].z).toBeCloseTo(0.3);
    expect(narrow[2].x - narrow[1].x).toBeCloseTo(0.4);
  });

  it("builds a base, glazing on three faces, a roof and a floor on the outside", () => {
    for (const out of [1, -1] as const) {
      const parts = bayParts(place("bay", 2.4), T, out, "R", { sill: 0.75, plinth: -0.25 });
      // Glass on all three faces (two casements on the 1.2 m front, one on each side, plus top lights).
      expect(glass(parts.boxes).length).toBeGreaterThanOrEqual(4);
      for (const g of glass(parts.boxes)) expect(g.p[2] * out).toBeGreaterThan(T / 2);
      const outside = parts.quads.filter((q) => q.slot.kind === "outside");
      expect(outside.length).toBe(3);
      // Outside faces point away from the wall.
      for (const q of outside) expect(q.n[2] * out).toBeGreaterThanOrEqual(0);
      const roof = parts.quads.filter((q) => q.slot.kind === "part" && q.slot.mat === "lead" && q.n[1] > 0);
      expect(roof).toHaveLength(3);
      expect(Math.max(...parts.bayFloor!.map((p) => p.z * out))).toBeCloseTo(T / 2 + 0.6 - 0.2, 1);
    }
  });
});

describe("boxQuads", () => {
  it("places a box along a wall running down the plan", () => {
    // Wall along +z (plan y): local x maps to world z, local +z (the +n side) to world -x.
    const q = boxQuads([{ mat: "frame", p: [1, 0.5, 0.2], s: [0.1, 0.1, 0.1] }], { centre: { x: 5, y: 0 }, dir: { x: 0, y: 1 } });
    expect(q).toHaveLength(6);
    const xs = q.flatMap((f) => f.v.map((v) => v[0]));
    const zs = q.flatMap((f) => f.v.map((v) => v[2]));
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(4.8);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(1);
    for (const f of q) {
      const [a, b, c] = f.v;
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      expect(cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2]).toBeGreaterThan(0);
    }
  });
});
