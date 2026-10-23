import { describe, expect, it } from "vitest";
import type { Opening } from "../types";
import type { OpeningPlacement } from "./geometry";
import { bifoldLayout } from "./bifold";
import { bayOutline, bayParts, boxQuads, casements, defaultStyle, doorLeaf, effectiveOpenDeg, frontUnit, withSidelight, glazingLayout, openingParts, resolvedStyle, styleOptions, topLights, type Box } from "./openings";

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
    const board = boxes.find((b) => b.mat === "board")!;
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
    const n = bifoldLayout(w, false).n;
    const panes = glass(openingParts(place("bifold", w, {}, 2.1), T, 1).boxes);
    expect(panes).toHaveLength(n);
    // All within the outer third of the opening on the hinge side (left by default).
    for (const p of panes) expect(p.p[0]).toBeLessThan(-w / 2 + w / 3);
    const flipped = glass(openingParts(place("bifold", w, { flipHinge: true }, 2.1), T, 1).boxes);
    for (const p of flipped) expect(p.p[0]).toBeGreaterThan(w / 2 - w / 3);
  });

  it("gives internal bi-folds a lining and no threshold, external ones a frame and threshold", () => {
    const mats = (out: 1 | 0) => openingParts(place("bifold", 2, {}, 2.1), T, out).boxes.map((b) => b.mat);
    expect(mats(0)).not.toContain("threshold");
    expect(mats(0)).toContain("lining");
    expect(mats(1)).toContain("threshold");
  });

  it("draws an archway as an open, lined opening with no leaves, glass or threshold", () => {
    const { boxes } = openingParts(place("archway", 2, {}, 2.1), T, 0);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => b.mat === "leaf")).toBe(true);
    // Head lining sits at the head and architraves stand proud of both wall faces.
    expect(Math.max(...boxes.map((b) => b.p[1] + b.s[1] / 2))).toBeGreaterThan(2.1);
    expect(boxes.some((b) => b.p[2] > T / 2)).toBe(true);
    expect(boxes.some((b) => b.p[2] < -T / 2)).toBe(true);
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

describe("door styles", () => {
  const leafParts = (style: Opening["style"], out: 1 | 0 = 0, extra: Partial<Opening> = {}) => openingParts(place("door", 0.8, { style, ...extra }, 2.05), out ? T : 0.1, out).boxes;

  it("keeps the old looks by default: panelled internal, glazed external, classic front, panel-grid garage", () => {
    expect(defaultStyle("door", false)).toBe("panel");
    expect(defaultStyle("door", true)).toBe("glazed");
    expect(defaultStyle("front", true)).toBe("front");
    expect(defaultStyle("garage", true)).toBe("panel-grid");
    expect(defaultStyle("window", true)).toBeUndefined();
    // A style the kind does not offer falls back to the default.
    expect(resolvedStyle({ id: "g", kind: "garage", x: 0, y: 0, orientation: "h", widthM: 2.2, style: "six-panel" }, true)).toBe("panel-grid");
    expect(styleOptions("window")).toEqual([]);
    expect(styleOptions("door").map((o) => o.value)).toContain("glazed-15");
  });

  it("gives a glazed-15 door 15 panes in 3 columns and 5 rows", () => {
    const panes = glass(leafParts("glazed-15"));
    expect(panes).toHaveLength(15);
    expect(new Set(panes.map((p) => p.p[0].toFixed(3))).size).toBe(3);
    expect(new Set(panes.map((p) => p.p[1].toFixed(3))).size).toBe(5);
  });

  it("gives a six-panel door six raised panels on each face and no glass", () => {
    const b = doorLeaf("six-panel", 2.0, 0.04, 1)(0.75);
    expect(b.filter((x) => x.mat === "panel")).toHaveLength(12);
    expect(glass(b)).toHaveLength(0);
  });

  it("glazes the top half of a half-glazed door with obscure glass", () => {
    const b = doorLeaf("half-glazed", 2.0, 0.05, 1)(0.8);
    const ob = b.filter((x) => x.mat === "obscure");
    expect(ob).toHaveLength(1);
    expect(ob[0].p[1] - ob[0].s[1] / 2).toBeGreaterThan(0.9);
    expect(doorLeaf("half-glazed-2", 2.0, 0.05, 1)(0.8).filter((x) => x.mat === "obscure")).toHaveLength(2);
  });

  it("puts a ledged door's ledges on the face away from the show face", () => {
    const b = doorLeaf("ledged", 2.0, 0.04, 1)(0.7);
    const ledges = b.filter((x) => x.mat === "leaf" && x.s[1] === 0.15);
    expect(ledges).toHaveLength(3);
    for (const l of ledges) expect(l.p[2]).toBeLessThan(0);
    expect(b.filter((x) => x.mat === "groove").length).toBeGreaterThan(4);
  });

  it("draws a door shut in its frame with openDeg 0", () => {
    const shut = leafParts("half-glazed", 1, { openDeg: 0 }).find((x) => x.mat === "leaf")!;
    // Shut: the leaf lies along the wall, across the opening.
    expect(Math.abs(Math.sin(shut.ry ?? 0))).toBeLessThan(1e-9);
    expect(shut.s[0]).toBeGreaterThan(0.6);
    const open = leafParts("half-glazed", 1).find((x) => x.mat === "leaf")!;
    expect(Math.abs(Math.sin(open.ry ?? 0))).toBeGreaterThan(0.9);
  });

  it("draws every swing door shut when doors are not shown open, whatever openDeg says", () => {
    const leafRy = (kind: "door" | "french", out: 1 | -1 | 0, extra: Partial<Opening>) =>
      leaves(openingParts(place(kind, kind === "french" ? 1.5 : 0.8, extra, 2.05), T, out, false).boxes).map((b) => Math.abs(Math.sin(b.ry ?? 0)));
    for (const v of [...leafRy("door", 0, { openDeg: 90 }), ...leafRy("door", 1, {}), ...leafRy("french", -1, { openDeg: 120 })]) expect(v).toBeLessThan(1e-9);
  });

  it("lays bi-fold panels flat across the opening when shut", () => {
    const w = 3;
    const panes = glass(openingParts(place("bifold", w, {}, 2.1), T, 1, false).boxes);
    expect(panes).toHaveLength(bifoldLayout(w, false).n);
    expect(Math.min(...panes.map((p) => p.p[0]))).toBeLessThan(-w / 4);
    expect(Math.max(...panes.map((p) => p.p[0]))).toBeGreaterThan(w / 4);
  });

  it("works out the effective open angle", () => {
    expect(effectiveOpenDeg({}, 75)).toBe(75);
    expect(effectiveOpenDeg({ openDeg: 30 }, 75)).toBe(30);
    expect(effectiveOpenDeg({ openDeg: 300 }, 75)).toBe(180);
    expect(effectiveOpenDeg({ openDeg: 30 }, 75, false)).toBe(0);
    expect(effectiveOpenDeg({}, 80, false)).toBe(0);
  });

  it("lines internal doors with the lining material", () => {
    expect(leafParts("glazed-15").some((b) => b.mat === "lining")).toBe(true);
  });

  it("draws a front door shut with a letter plate on the outside", () => {
    const b = openingParts(place("front", 0.9, { style: "half-glazed-2" }, 2.05), T, 1).boxes;
    expect(b.filter((x) => x.mat === "obscure")).toHaveLength(2);
    const plate = b.filter((x) => x.mat === "metal").find((x) => x.s[0] === 0.28)!;
    expect(plate.p[2]).toBeGreaterThan(0);
  });
});

describe("front door units and contemporary styles", () => {
  it("splits a unit into the door and its side lights, the door taking 0.75 to 0.98 m", () => {
    expect(frontUnit({}, 0.9)).toEqual({ door: [-0.45, 0.45], lights: [] });
    // Too narrow for a light: all door.
    expect(frontUnit({ sidelight: "latch" }, 0.9).lights).toEqual([]);
    // Hinges at the start jamb (-x), so the handle side is +x.
    const latch = frontUnit({ sidelight: "latch" }, 1.3);
    expect(latch.door[0]).toBeCloseTo(-0.65);
    expect(latch.door[1]).toBeCloseTo(0.25);
    expect(latch.lights).toHaveLength(1);
    expect(latch.lights[0][1]).toBeCloseTo(0.65);
    expect(frontUnit({ sidelight: "hinge" }, 1.3).lights[0][0]).toBeCloseTo(-0.65);
    expect(frontUnit({ sidelight: "hinge", flipHinge: true }, 1.3).lights[0][1]).toBeCloseTo(0.65);
    const both = frontUnit({ sidelight: "both" }, 1.8);
    expect(both.door[1] - both.door[0]).toBeCloseTo(0.98);
    expect(both.lights).toHaveLength(2);
  });

  it("glazes a side light full height beside the leaf, past a mullion, in one frame", () => {
    const plain = openingParts(place("front", 1.3, { style: "flush" }, 2.05), T, 1).boxes;
    const unit = openingParts(place("front", 1.3, { style: "flush", sidelight: "latch" }, 2.05), T, 1).boxes;
    expect(glass(plain)).toHaveLength(0);
    const g = glass(unit);
    expect(g).toHaveLength(1);
    expect(g[0].s[1]).toBeGreaterThan(1.8);
    expect(g[0].p[0]).toBeGreaterThan(0.25);
    // The leaf stays a door's width, in the rest of the unit.
    const lf = leaves(unit)[0];
    expect(lf.s[0]).toBeGreaterThan(0.75);
    expect(lf.s[0]).toBeLessThan(0.9);
    expect(lf.p[0]).toBeLessThan(0);
    // A mullion runs the full height between them.
    expect(unit.filter((b) => b.mat === "frame" && b.s[1] > 2 && Math.abs(b.p[0] - 0.25) < 1e-6)).toHaveLength(1);
    expect(glass(openingParts(place("front", 1.8, { style: "flush", sidelight: "both" }, 2.05), T, 1).boxes)).toHaveLength(2);
  });

  it("widens a door too narrow for its side lights, keeping the leaf where it was", () => {
    const door: Opening = { id: "f", kind: "front", x: 100, y: 200, orientation: "h", widthM: 0.9 };
    const ppm = 50;
    const one = withSidelight(door, "latch", ppm);
    expect(one.widthM).toBe(1.3);
    const unit = { ...door, ...one };
    const [d0, d1] = frontUnit(unit, unit.widthM).door;
    // The leaf's centre, in image px along the wall, has not moved.
    expect(unit.x + ((d0 + d1) / 2) * ppm).toBeCloseTo(100);
    expect(unit.y).toBe(200);
    expect(frontUnit(unit, unit.widthM).lights).toHaveLength(1);
    expect(withSidelight({ ...door, orientation: "v" }, "both", ppm)).toMatchObject({ widthM: 1.8, y: 200 });
    // Wide enough already: it stays put; taking the light away shrinks it back to the leaf.
    expect(withSidelight({ ...door, widthM: 1.5 }, "hinge", ppm)).toEqual({ sidelight: "hinge", widthM: 1.5, x: 100 });
    const back = withSidelight(unit, undefined, ppm);
    expect(back.sidelight).toBeUndefined();
    expect(back.widthM).toBeCloseTo(0.9);
    expect(back.x).toBeCloseTo(100);
    // A short run of wall narrows the unit and slides it back inside.
    const fitted = withSidelight(door, "latch", ppm, [70, 132]);
    expect(fitted.widthM).toBeCloseTo(1.24);
    expect(fitted.x! - (fitted.widthM! / 2) * ppm).toBeCloseTo(70);
  });

  it("draws the contemporary and cottage styles", () => {
    expect(doorLeaf("strip", 2.0, 0.05, 1, true)(0.85).filter((x) => x.mat === "obscure")).toHaveLength(1);
    expect(doorLeaf("squares", 2.0, 0.05, 1, true)(0.85).filter((x) => x.mat === "obscure")).toHaveLength(3);
    expect(doorLeaf("grooved", 2.0, 0.05, 1, true)(0.85).filter((x) => x.mat === "groove").length).toBeGreaterThan(8);
    const cottage = doorLeaf("cottage", 2.0, 0.05, 1, true)(0.85);
    expect(glass(cottage)).toHaveLength(1);
    expect(glass(cottage)[0].p[1]).toBeGreaterThan(1.4);
    // Contemporary front doors have a long pull bar outside; the cottage door a knob.
    const tall = (b: Box[]) => b.filter((x) => x.mat === "metal" && x.s[1] > 0.5);
    expect(tall(doorLeaf("strip", 2.0, 0.05, 1, true)(0.85))).toHaveLength(1);
    expect(tall(cottage)).toHaveLength(0);
    expect(styleOptions("front").map((o) => o.value)).toEqual(expect.arrayContaining(["strip", "squares", "grooved", "cottage"]));
  });
});

describe("garage styles", () => {
  it("makes an up-and-over door one leaf with 3 x 2 raised panels and a central handle", () => {
    const b = openingParts(place("garage", 2.15, { style: "up-over" }, 2.0), T, 1).boxes;
    expect(leaves(b)).toHaveLength(1);
    const panels = b.filter((x) => x.mat === "panel");
    expect(panels).toHaveLength(6);
    expect(new Set(panels.map((p) => p.p[0].toFixed(3))).size).toBe(3);
    expect(new Set(panels.map((p) => p.p[1].toFixed(3))).size).toBe(2);
    for (const m of b.filter((x) => x.mat === "metal")) expect(m.p[0]).toBeCloseTo(0);
  });

  it("keeps the panel-grid look by default", () => {
    expect(openingParts(place("garage", 2.4, {}, 2.0), T, 1).boxes.filter((x) => x.mat === "panel")).toHaveLength(6);
  });
});

describe("glazing patterns", () => {
  const win = (glazing: Opening["glazing"], w = 1.2) => openingParts(place("window", w, { glazing }, 2.1, 0.9), T, 1).boxes;

  it("counts panes per pattern", () => {
    expect(glass(win("grid"))).toHaveLength(4); // two casements, two top lights
    expect(glass(win("fixed"))).toHaveLength(1);
    expect(glass(win("fixed-top", 0.85))).toHaveLength(2);
    expect(glass(win("fixed-top", 1.7))).toHaveLength(3);
    expect(glass(win("casement-fixed-casement", 1.85))).toHaveLength(4);
  });

  it("puts the fixed pane under the top lights", () => {
    const [low, high] = [...glass(win("fixed-top", 0.85))].sort((a, b) => a.p[1] - b.p[1]);
    expect(low.s[1]).toBeGreaterThan(high.s[1] * 2);
    expect(low.s[0]).toBeCloseTo(high.s[0]);
  });

  it("runs the side casements of casement-fixed-casement full height", () => {
    const { cells } = glazingLayout("casement-fixed-casement", -0.9, 0.9, 1, 2.1, 3, true);
    const sides = cells.filter((c) => c.a === -0.9 || c.b === 0.9);
    expect(sides).toHaveLength(2);
    for (const c of sides) {
      expect(c.lo).toBe(1);
      expect(c.hi).toBe(2.1);
      expect(c.sash).toBe(true);
    }
    expect(cells.filter((c) => !c.sash)).toHaveLength(1);
  });

  it("adds a top light per 0.85 m or so", () => {
    expect([0.6, 0.9, 1.7, 2.6].map(topLights)).toEqual([1, 1, 2, 3]);
  });

  it("uses the pattern on each bay face", () => {
    const parts = bayParts(place("bay", 1.5, { glazing: "fixed-top" }), T, 1, "R", { sill: 0.75, plinth: -0.25, depth: 0.3 });
    expect(glass(parts.boxes)).toHaveLength(6);
  });
});

describe("sills", () => {
  const win = (sillStyle?: Opening["sillStyle"]) => openingParts(place("window", 1.0, { sillStyle }, 2.1, 0.9), T, 1).boxes;
  it("draws a thin uPVC sill, a deep stone one, or none, and always a board inside", () => {
    const stone = win().find((b) => b.mat === "sill")!;
    const upvc = win("upvc").find((b) => b.mat === "sill")!;
    expect(upvc.s[1]).toBeLessThan(stone.s[1]);
    expect(upvc.s[2]).toBeLessThan(stone.s[2]);
    expect(upvc.p[2] + upvc.s[2] / 2).toBeGreaterThan(T / 2);
    expect(win("none").some((b) => b.mat === "sill")).toBe(false);
    for (const s of [undefined, "upvc", "none"] as const) expect(win(s).some((b) => b.mat === "board")).toBe(true);
  });
});
