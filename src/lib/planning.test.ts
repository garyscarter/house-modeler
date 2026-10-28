import { describe, expect, it } from "vitest";
import { DEFAULT_EXTERIOR, type Exterior, type HouseModel, type Opening, type Room, type Site } from "../types";
import { builtInHouse, builtInProposed, listingSite } from "../houses/default";
import { planningCheck, type PlanningCheck, type RuleStatus } from "./planning";
import { rectPoly, simpleSite } from "./site";
import { floor, rect } from "./testing";

/**
 * A two-storey house, 8 m wide and 9 m deep, in a 1 px = 1 cm plan: world
 * x 0..8, z 0..9 with the front at z = 9. Semi-detached on the right unless
 * said otherwise.
 */
function house(ext: Partial<Exterior> = {}): HouseModel {
  return {
    floors: [floor([rect("Living", 0, 0, 800, 900)], [], { level: 0, id: "g", name: "Ground" }), floor([rect("Bed", 0, 0, 800, 900)], [], { level: 1, id: "u", name: "First" })],
    ceilingHeight: 2.4,
    slabThickness: 0.25,
    exterior: { ...DEFAULT_EXTERIOR, roofStyle: "hip", partyWall: "right", pitchDeg: 35, ...ext },
  };
}

/** A copy of `m` with rooms (and openings) added to a storey. */
function plus(m: HouseModel, level: number, rooms: Room[], openings: Opening[] = []): HouseModel {
  const out = structuredClone(m);
  const f = out.floors.find((x) => x.level === level)!;
  f.rooms.push(...rooms);
  f.openings.push(...openings);
  return out;
}

/** The plot: 3 m to the left, 12 m behind, 6 m in front (then pavement and road), party wall on the right. */
const plot = (m: HouseModel, d: Partial<{ front: number; rear: number; left: number; right: number }> = {}) => simpleSite(m, { front: 6, rear: 12, left: 3, right: 0, ...d });

const rule = (r: PlanningCheck, id: string) => {
  const found = r.rules.find((x) => x.id === id || x.id.endsWith(`-${id}`));
  if (!found) throw new Error(`no rule ${id} in ${r.rules.map((x) => x.id).join(", ")}`);
  return found;
};
const statusOf = (r: PlanningCheck, id: string): RuleStatus => rule(r, id).status;

describe("planningCheck: no change", () => {
  it("finds no work when Proposed is As listed", () => {
    const m = house();
    const s = plot(m);
    const r = planningCheck(m, structuredClone(m), { current: s, proposed: s });
    expect(r.verdict).toBe("none");
    expect(r.parts).toHaveLength(0);
    expect(r.rules.every((x) => x.status === "na")).toBe(true);
    expect(r.consents).toHaveLength(0);
    expect(r.caveats.join(" ")).toMatch(/Article 4/);
    expect(r.caveats.join(" ")).toMatch(/1 July 1948/);
  });

  it("ignores a wall nudged by a couple of centimetres", () => {
    const m = house();
    const p = structuredClone(m);
    p.floors[0].rooms[0] = rect("Living", -2, 0, 800, 900);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(r.parts).toHaveLength(0);
    expect(r.verdict).toBe("none");
  });
});

describe("planningCheck: rear extensions (Class A)", () => {
  it("passes a 3 m single-storey rear extension on a semi", () => {
    const m = house();
    const p = plus(m, 0, [rect("Kitchen", 0, -300, 400, 0)]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(r.houseType).toBe("semi-detached");
    expect(r.parts).toHaveLength(1);
    const part = r.parts[0];
    expect(part.sides).toEqual(["rear"]);
    expect(part.storeys).toBe(1);
    expect(part.depth).toBeCloseTo(3, 1);
    expect(part.height).toBeLessThan(3.1);
    expect(part.label).toBe("Single-storey rear extension");
    expect(statusOf(r, "rear-depth")).toBe("pass");
    expect(statusOf(r, "rear-height")).toBe("pass");
    expect(statusOf(r, "front")).toBe("pass");
    expect(r.verdict).toBe("pd");
    expect(r.headline).toBe("Looks like permitted development");
    expect(r.consents.map((c) => c.id)).toContain("building-regs");
  });

  it("needs prior approval between 3 and 6 m on a semi", () => {
    const m = house();
    const p = plus(m, 0, [rect("Kitchen", 0, -450, 400, 0)]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(statusOf(r, "rear-depth")).toBe("prior");
    expect(r.verdict).toBe("prior");
    expect(r.because[0]).toMatch(/4\.5 m deep.*prior approval/);
  });

  it("fails beyond 6 m on a semi", () => {
    const m = house();
    const p = plus(m, 0, [rect("Kitchen", 0, -700, 400, 0)]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(statusOf(r, "rear-depth")).toBe("fail");
    expect(r.verdict).toBe("permission");
  });

  it("allows 4 m (8 m with prior approval) on a detached house", () => {
    const m = house({ partyWall: "none" });
    const s = plot(m, { right: 3 });
    const ok = planningCheck(m, plus(m, 0, [rect("Kitchen", 0, -390, 400, 0)]), { current: s, proposed: s });
    expect(ok.houseType).toBe("detached");
    expect(statusOf(ok, "rear-depth")).toBe("pass");
    const prior = planningCheck(m, plus(m, 0, [rect("Kitchen", 0, -500, 400, 0)]), { current: s, proposed: s });
    expect(statusOf(prior, "rear-depth")).toBe("prior");
  });

  it("checks a two-storey rear extension's depth and its distance to the rear boundary", () => {
    const m = house({ extensionRoof: "separate" });
    const room = (name: string) => rect(name, 0, -300, 400, 0, { roofGroup: "ext" });
    const p = plus(plus(m, 0, [room("Kitchen")]), 1, [room("Bed 4")]);
    const far = plot(m, { rear: 12 });
    const r = planningCheck(m, p, { current: far, proposed: far });
    expect(r.parts[0].storeys).toBe(2);
    expect(statusOf(r, "rear-depth")).toBe("pass");
    expect(statusOf(r, "rear-gap")).toBe("pass");
    expect(rule(r, "rear-gap").reason).toMatch(/8\.9 m from the boundary/);
    expect(statusOf(r, "ridge")).toBe("pass");
    expect(statusOf(r, "pitch")).toBe("pass");
    const near = plot(m, { rear: 8 });
    const r2 = planningCheck(m, p, { current: near, proposed: near });
    expect(statusOf(r2, "rear-gap")).toBe("fail");
    expect(r2.verdict).toBe("permission");
    expect(r2.because.join(" ")).toMatch(/rear boundary/);
  });

  it("fails an extension that rises above the existing ridge", () => {
    const m = house({ extensionRoof: "continue", ridgeAxis: "x" });
    const room = (name: string) => rect(name, 0, -300, 800, 0);
    const p = plus(plus(m, 0, [room("Kitchen")]), 1, [room("Bed 4")]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    // One roof over a deeper house rises higher.
    expect(statusOf(r, "ridge")).toBe("fail");
    expect(r.because.join(" ")).toMatch(/above the existing ridge/);
  });

  it("flags the 45-degree line where a rear extension sits against the attached neighbour", () => {
    const m = house();
    const p = plus(m, 0, [rect("Kitchen", 400, -300, 800, 0)]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    const n45 = rule(r, "N45");
    expect(n45.status).toBe("check");
    expect(n45.reason).toMatch(/Attached neighbour/);
    expect(n45.reason).toMatch(/9\d°/);
    // Local guidance only: it doesn't change the permitted development answer.
    expect(r.verdict).toBe("pd");
    expect(r.consents.find((c) => c.id === "party-wall")).toBeTruthy();
  });

  it("passes the 45-degree line for a narrow extension away from the neighbour", () => {
    const m = house();
    const p = plus(m, 0, [rect("Kitchen", 0, -200, 300, 0)]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(statusOf(r, "N45")).toBe("pass");
    expect(rule(r, "N45").reason).toMatch(/\b(\d|[1-3]\d)°/);
  });
});

describe("planningCheck: side extensions (Class A)", () => {
  it("passes a single-storey side extension under half the house's width", () => {
    const m = house();
    const p = plus(m, 0, [rect("Utility", -250, 0, 0, 900)]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    const part = r.parts[0];
    expect(part.sides).toEqual(["left"]);
    expect(part.width).toBeCloseTo(2.5, 1);
    expect(part.boundaryDistance).toBeCloseTo(0.375, 1);
    expect(statusOf(r, "side-storeys")).toBe("pass");
    expect(statusOf(r, "side-width")).toBe("pass");
    expect(statusOf(r, "side-height")).toBe("pass");
    expect(statusOf(r, "side-road")).toBe("pass");
    // Within 2 m of the boundary, but a flat roof under 3 m.
    expect(statusOf(r, "eaves-2m")).toBe("pass");
    expect(r.verdict).toBe("pd");
  });

  it("fails a side extension wider than half the house", () => {
    const m = house();
    const p = plus(m, 0, [rect("Utility", -500, 0, 0, 900)]);
    const s = plot(m, { left: 6 });
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(statusOf(r, "side-width")).toBe("fail");
    expect(rule(r, "side-width").reason).toMatch(/5\.00 m wide; half the original house's width \(8\.0 m\) is 4\.00 m/);
  });

  it("fails a two-storey side extension, with the eaves too high by the boundary", () => {
    const m = house();
    const room = (name: string) => rect(name, -250, 0, 0, 900);
    const p = plus(plus(m, 0, [room("Study")]), 1, [room("Bed 4")]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(r.parts[0].label).toBe("Two-storey side extension on the left");
    expect(statusOf(r, "side-storeys")).toBe("fail");
    expect(statusOf(r, "side-height")).toBe("fail");
    expect(statusOf(r, "eaves-2m")).toBe("fail");
    expect(r.verdict).toBe("permission");
    expect(r.headline).toMatch(/Needs planning permission/);
    expect(r.because[0]).toMatch(/two storeys/);
  });

  it("asks for obscure glazing on upper-floor side windows", () => {
    const m = house();
    const room = (name: string) => rect(name, -250, 0, 0, 900);
    const win: Opening = { id: "w", kind: "window", x: -250, y: 450, orientation: "v", widthM: 1 };
    const p = plus(plus(m, 0, [room("Study")]), 1, [room("Bed 4")], [win]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(statusOf(r, "side-windows")).toBe("check");
  });

  it("fails a side extension whose side faces a road (a corner plot)", () => {
    const m = house();
    const p = plus(m, 0, [rect("Utility", -250, 0, 0, 900)]);
    const s = plot(m);
    s.surfaces.push({ id: "side-road", kind: "pavement", polygon: rectPoly(-5, -12, -3, 17) });
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(statusOf(r, "side-road")).toBe("fail");
  });

  it("fails an extension forward of the front wall", () => {
    const m = house();
    const p = plus(m, 0, [rect("Study", 0, 900, 500, 1200)]);
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(r.parts[0].sides).toEqual(["front"]);
    expect(statusOf(r, "front")).toBe("fail");
    expect(r.because[0]).toMatch(/3\.0 m forward of the front wall/);
  });

  it("fails an extra storey on top", () => {
    const m = house();
    const p = structuredClone(m);
    p.floors.push(floor([rect("Loft room", 0, 0, 800, 900)], [], { level: 2, id: "l", name: "Second" }));
    const s = plot(m);
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(r.parts[0].newStorey).toBe(true);
    expect(statusOf(r, "storey")).toBe("fail");
  });

  it("fails when extensions cover more than half the garden", () => {
    const m = house();
    const p = plus(m, 0, [rect("Kitchen", 0, -300, 800, 0)]);
    const s = plot(m, { front: 1, rear: 4, left: 0.5 });
    const r = planningCheck(m, p, { current: s, proposed: s });
    expect(statusOf(r, "rear-depth")).toBe("pass");
    expect(statusOf(r, "A-coverage")).toBe("fail");
    expect(rule(r, "A-coverage").reason).toMatch(/24\.0 m², 5\d% of the 4\d\.\d m²/);
  });
});

describe("planningCheck: porches (Class D)", () => {
  it("passes a small porch and fails a big one", () => {
    const m = house();
    const s = plot(m);
    const small = planningCheck(m, plus(m, 0, [rect("Porch", 300, 900, 450, 1050)]), { current: s, proposed: s });
    expect(small.parts[0].label).toBe("Porch");
    expect(small.rules.filter((x) => x.id.startsWith("ext"))).toHaveLength(0);
    const area = small.rules.find((x) => x.id === "D0-area")!;
    expect(area.status).toBe("pass");
    expect(area.reason).toMatch(/2\.6 m²/);
    expect(small.rules.find((x) => x.id === "D0-road")!.status).toBe("pass");
    expect(small.verdict).toBe("pd");
    const big = planningCheck(m, plus(m, 0, [rect("Porch", 300, 900, 500, 1040)]), { current: s, proposed: s });
    expect(big.rules.find((x) => x.id === "D0-area")!.status).toBe("fail");
    expect(big.verdict).toBe("permission");
  });

  it("fails a porch within 2 m of the boundary by the road", () => {
    const m = house();
    const s = plot(m, { front: 2.5 });
    const r = planningCheck(m, plus(m, 0, [rect("Porch", 300, 900, 450, 1050)]), { current: s, proposed: s });
    expect(r.rules.find((x) => x.id === "D0-road")!.status).toBe("fail");
  });

  it("checks the listing's porch canopy when it is made narrower or wider", () => {
    const a = builtInHouse("");
    const s = listingSite();
    const narrower = structuredClone(a);
    const g = narrower.floors.find((f) => f.level === 0)!;
    g.canopies = [g.canopies![0].map((p) => (p.x === 530 ? { ...p, x: 600 } : p))];
    const r = planningCheck(a, narrower, { current: s, proposed: s });
    const area = r.rules.find((x) => x.id === "D0-area")!;
    expect(area.status).toBe("pass");
    expect(area.reason).toMatch(/2\.6 m²/);
    // The tiled skirt over it may top 3 m: measure it.
    expect(r.rules.find((x) => x.id === "D0-height")!.status).toBe("check");
    expect(r.rules.find((x) => x.id === "D0-road")!.reason).toMatch(/2\.9 m from the boundary by the road/);

    const wider = structuredClone(a);
    const w = wider.floors.find((f) => f.level === 0)!;
    w.canopies = [w.canopies![0].map((p) => (p.y === 620 ? { ...p, y: 660 } : p))];
    expect(planningCheck(a, wider, { current: s, proposed: s }).rules.find((x) => x.id === "D0-area")!.status).toBe("fail");
  });
});

describe("planningCheck: plot changes", () => {
  const listingPair = () => ({ a: builtInHouse(""), s: listingSite() });

  it("asks for the highway authority's consent when the drive opening widens", () => {
    const { a, s } = listingPair();
    const p = structuredClone(s);
    p.boundary[6] = { x: -0.85, y: 5.5 }; // the drive's east edge moves 1 m along the front wall
    const r = planningCheck(a, structuredClone(a), { current: s, proposed: p });
    const kerb = r.consents.find((c) => c.id === "dropped-kerb")!;
    expect(kerb.reason).toMatch(/from 3\.0 m to 4\.0 m/);
    expect(statusOf(r, "W-removed")).toBe("pass");
    expect(statusOf(r, "W-opening")).toBe("pass");
    // No building work, so only the kerb.
    expect(r.verdict).toBe("pd");
    expect(r.consents.map((c) => c.id)).toEqual(["dropped-kerb"]);
  });

  it("fails a new front wall over 1 m by the road", () => {
    const { a, s } = listingPair();
    const p = structuredClone(s);
    p.boundaryEdges![5] = { ...p.boundaryEdges![5], height: 1.5 };
    const r = planningCheck(a, structuredClone(a), { current: s, proposed: p });
    expect(statusOf(r, "W-height")).toBe("fail");
    expect(r.verdict).toBe("permission");
  });

  it("checks new hard surfacing in the front garden over 5 m²", () => {
    const m = house();
    const s = plot(m);
    const withDrive = (x1: number, finish?: "gravel"): Site => {
      const p = structuredClone(s);
      p.surfaces.push({ id: "drive", kind: "drive", polygon: rectPoly(-1.5, 9, x1, 15), ...(finish ? { finish } : {}) });
      return p;
    };
    const big = planningCheck(m, structuredClone(m), { current: s, proposed: withDrive(2.5) });
    expect(statusOf(big, "F")).toBe("check");
    expect(rule(big, "F").reason).toMatch(/24\.0 m²/);
    expect(statusOf(planningCheck(m, structuredClone(m), { current: s, proposed: withDrive(2.5, "gravel") }), "F")).toBe("pass");
    expect(statusOf(planningCheck(m, structuredClone(m), { current: s, proposed: withDrive(-0.9) }), "F")).toBe("pass");
  });
});

describe("planningCheck: the built-in house", () => {
  const run = (wingAfter1948 = false) => {
    const s = listingSite();
    return planningCheck(builtInHouse(""), builtInProposed(""), { current: s, proposed: s }, { wingAfter1948 });
  };

  it("says the two-storey side extension needs a householder planning application, and why", () => {
    const r = run();
    expect(r.verdict).toBe("permission");
    expect(r.headline).toBe("Needs planning permission (a householder planning application)");
    expect(r.parts).toHaveLength(1);
    const part = r.parts[0];
    expect(part.sides).toEqual(["left"]);
    expect(part.levels).toEqual([1]);
    expect(part.storeys).toBe(2);
    expect(part.width).toBeCloseTo(4.05, 1);
    // Two 2.25 m storeys and a 0.2 m floor, over a ground floor 0.26 m above the garden.
    expect(part.eaves).toBeCloseTo(4.96, 1);
    expect(part.boundaryDistance).toBeLessThan(0.05);
    expect(statusOf(r, "side-storeys")).toBe("fail");
    expect(statusOf(r, "side-height")).toBe("fail");
    expect(statusOf(r, "eaves-2m")).toBe("fail");
    expect(statusOf(r, "side-width")).toBe("pass");
    expect(statusOf(r, "front")).toBe("pass");
    expect(statusOf(r, "eaves")).toBe("pass");
    expect(statusOf(r, "ridge")).toBe("pass");
    expect(statusOf(r, "A-coverage")).toBe("pass");
    expect(rule(r, "A-coverage").reason).toMatch(/add no ground area/);
    expect(statusOf(r, "A-materials")).toBe("check");
    expect(statusOf(r, "N45")).toBe("pass");
    expect(r.because.join(" ")).toMatch(/two storeys/);
    expect(r.because.join(" ")).toMatch(/right on the boundary/);
    expect(r.consents.map((c) => c.id)).toEqual(["building-regs", "party-wall"]);
    expect(r.original).toMatch(/As listed is taken as the original/);
  });

  it("counts the garage wing as an earlier extension when it was added after 1948", () => {
    const r = run(true);
    expect(r.parts[0].levels).toEqual([0, 1]);
    expect(statusOf(r, "side-width")).toBe("fail");
    expect(rule(r, "side-width").reason).toMatch(/4\.05 m wide; half the original house's width \(6\.4 m\) is 3\.\d\d m/);
    expect(rule(r, "A-coverage").reason).toMatch(/side wing included/);
    expect(r.original).toMatch(/without its single-storey side wing/);
  });
});
