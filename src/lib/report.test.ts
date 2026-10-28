import { describe, expect, it } from "vitest";
import type { Fixture, HouseModel, Opening } from "../types";
import { builtInHouse, builtInProposed } from "../houses/default";
import {
  areaReport,
  areaSummary,
  changeCost,
  CONTINGENCY,
  diffModels,
  estimateCosts,
  fmtDelta,
  M2_TO_FT2,
  modelArea,
  pairFloors,
  pairRooms,
  roomArea,
  roomNotes,
  significantArea,
  STRUCTURAL_ADVICE,
} from "./report";
import { floor, rect } from "./testing";

const model = (...floors: HouseModel["floors"]): HouseModel => ({ floors, ceilingHeight: 2.4, slabThickness: 0.25 });
const op = (id: string, kind: Opening["kind"], x: number, y: number, orientation: "h" | "v", widthM: number): Opening => ({ id, kind, x, y, orientation, widthM });
/** Two 3 m x 4 m rooms side by side, joined by an internal wall at x = 3 m. */
const pair = (openings: Opening[] = []) => floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)], openings);

describe("areas", () => {
  it("measures rooms in square metres", () => {
    const f = pair();
    expect(roomArea(f, f.rooms[0])).toBeCloseTo(12);
    expect(modelArea(model(f))).toBeCloseTo(24);
  });

  it("totals floors and variants and pairs rooms by id", () => {
    const a = model(pair());
    const b = model(floor([rect("A", 0, 0, 400, 400), rect("B", 400, 0, 600, 400)]));
    const r = areaReport(a, b);
    expect(r.floors).toHaveLength(1);
    expect(r.floors[0].rows.map((x) => [x.name, x.current, x.proposed])).toEqual([
      ["A", 12, 16],
      ["B", 12, 8],
    ]);
    expect(r.current).toBeCloseTo(24);
    expect(r.proposed).toBeCloseTo(24);
  });

  it("works with only one variant", () => {
    const r = areaReport(model(pair()), undefined);
    expect(r.floors[0].rows.every((x) => x.proposed === undefined)).toBe(true);
    expect(r.proposed).toBeUndefined();
    expect(r.current).toBeCloseTo(24);
  });

  it("falls back to floor level and name when ids differ, and spots a rename by position", () => {
    const a = floor([rect("A", 0, 0, 300, 400, { id: "x1" }), rect("Study", 300, 0, 600, 400, { id: "x2" })]);
    const b = floor([rect("A", 0, 0, 300, 400, { id: "y1" }), rect("Office", 300, 0, 600, 400, { id: "y2" })], [], { id: "other" });
    expect(pairFloors(model(a), model(b))).toHaveLength(1);
    expect(pairRooms(a, b).map((p) => [p.a?.name, p.b?.name])).toEqual([
      ["A", "A"],
      ["Study", "Office"],
    ]);
    expect(areaReport(model(a), model(b)).floors[0].rows[1].was).toBe("Study");
    expect(diffModels(model(a), model(b)).map((c) => c.description)).toEqual(["Study renamed Office"]);
  });

  it("ignores area changes under 0.2 m² or 3%", () => {
    expect(significantArea(12, 12.15)).toBe(false);
    expect(significantArea(30, 30.5)).toBe(false); // 1.7%
    expect(significantArea(12, 12.5)).toBe(true);
  });

  it("formats changes in either unit", () => {
    expect(fmtDelta(2.5)).toBe("+2.5");
    expect(fmtDelta(-1)).toBe("−1.0");
    expect(fmtDelta(0.01)).toBe("");
    expect(fmtDelta(1, "ft²")).toBe(`+${Math.round(M2_TO_FT2)}`);
  });
});

describe("changes for listing 91770873", () => {
  const a = builtInHouse("");
  const b = builtInProposed("");
  const changes = diffModels(a, b);

  it("finds the new first-floor room and its extra area", () => {
    const room = changes.find((c) => c.category === "Room");
    expect(room?.description).toBe("New room: New Room");
    expect(room?.floor).toBe("Floor 1");
    const area = changes.find((c) => c.category === "Floor");
    expect(area?.costLine).toBe("newFloorArea");
    expect(area?.quantity).toBeCloseTo(room!.quantity, 1);
    expect(area!.quantity).toBeGreaterThan(25);
  });

  it("lists the new door and two windows", () => {
    const doors = changes.filter((c) => c.category === "Door");
    const windows = changes.filter((c) => c.category === "Window");
    expect(doors).toHaveLength(1);
    expect(doors[0].description).toMatch(/between New Room and Landing/);
    // Cut into what was the outside wall of the house.
    expect(doors[0].structural).toMatch(/structural engineer/);
    expect(windows).toHaveLength(2);
    expect(windows.map((w) => w.description)).toEqual(
      expect.arrayContaining([expect.stringMatching(/rear wall of New Room/), expect.stringMatching(/front wall of New Room/)]),
    );
    expect(windows.every((w) => w.costLine === "newWindow" && w.unit === "each")).toBe(true);
  });

  it("adds the extension's outside walls without removing any", () => {
    const walls = changes.filter((c) => c.category === "Wall");
    expect(walls).toHaveLength(3);
    expect(walls.every((w) => w.description.startsWith("New ") && /part of the extension/.test(w.description))).toBe(true);
    expect(walls.reduce((s, w) => s + w.quantity, 0)).toBeCloseTo(4.04 * 2 + 6.71, 0);
    expect(changes.some((c) => c.description.startsWith("Remove"))).toBe(false);
  });

  it("leaves the ground floor alone", () => {
    expect(changes.every((c) => c.floor === "Floor 1")).toBe(true);
  });

  it("finds nothing between a model and its copy", () => {
    expect(diffModels(a, structuredClone(a))).toEqual([]);
  });
});

describe("changes", () => {
  it("flags a removed long wall as structural and prices it per metre", () => {
    const changes = diffModels(model(pair()), model(floor([rect("A", 0, 0, 600, 400)])));
    const wall = changes.find((c) => c.category === "Wall")!;
    expect(wall.description).toBe("Remove the wall between A and B (4.00 m)");
    expect(wall.quantity).toBe(4);
    expect(wall.costLine).toBe("removeWall");
    expect(wall.structural).toBe(STRUCTURAL_ADVICE);
    expect(changes.filter((c) => c.category === "Room").map((c) => c.description)).toEqual(["A enlarged from 12.0 to 24.0 m²", "B removed"]);
  });

  it("adds a partition without a structural flag", () => {
    const changes = diffModels(model(floor([rect("A", 0, 0, 600, 400)])), model(floor([rect("A", 0, 0, 600, 200), rect("C", 0, 200, 600, 400)])));
    const wall = changes.find((c) => c.category === "Wall")!;
    expect(wall.costLine).toBe("newPartition");
    expect(wall.quantity).toBe(6);
    expect(wall.structural).toBeUndefined();
    expect(changes.some((c) => c.description.startsWith("A reduced from 24.0 to 12.0"))).toBe(true);
  });

  it("matches openings by id, then by kind and position, and reports widening and type changes", () => {
    const a = model(pair([op("d1", "door", 300, 200, "v", 0.8), op("w1", "window", 150, 400, "h", 1.0), op("w2", "window", 450, 400, "h", 1.0)]));
    const b = model(pair([op("d1", "door", 300, 200, "v", 1.6), op("zz", "window", 160, 400, "h", 1.0), op("w2", "french", 450, 400, "h", 1.0)]));
    const changes = diffModels(a, b);
    expect(changes.map((c) => c.description)).toEqual([
      "Door between A and B widened from 0.80 to 1.60 m",
      "Window in the front wall of B replaced by French doors",
    ]);
    expect(changes.map((c) => c.costLine)).toEqual(["alterOpening", "newDoor"]);
  });

  it("reports added, removed and moved openings", () => {
    const a = model(pair([op("w1", "window", 150, 0, "h", 1), op("d1", "door", 300, 100, "v", 0.8)]));
    const b = model(pair([op("w9", "window", 450, 0, "h", 1.2), op("d1", "door", 300, 300, "v", 0.8)]));
    const changes = diffModels(a, b);
    expect(changes.map((c) => c.description)).toEqual([
      "Window in the rear wall of A removed, opening blocked up",
      "Door between A and B moved 2.0 m",
      "New window in the rear wall of B, 1.20 m wide",
    ]);
    expect(changes.map((c) => c.costLine)).toEqual(["blockOpening", "alterOpening", "newWindow"]);
    // A new window in an existing outside wall needs a lintel.
    expect(changes[2].structural).toMatch(/lintel/);
  });

  it("reports added and removed floors", () => {
    const g = pair();
    const up = { ...pair(), id: "f1", name: "First", level: 1 };
    const added = diffModels(model(g), model(g, up));
    expect(added[0]).toEqual(expect.objectContaining({ description: "New floor: First", quantity: 24, costLine: "newFloorArea" }));
    expect(diffModels(model(g, up), model(g))).toEqual([expect.objectContaining({ description: "First removed", unit: "m²", quantity: 24 })]);
  });
});

describe("costs", () => {
  const changes = diffModels(model(pair()), model(floor([rect("A", 0, 0, 600, 400)], [op("n", "window", 300, 0, "h", 1)])));

  it("prices nothing until the user enters rates", () => {
    const est = estimateCosts(changes, {});
    expect(est.total).toBe(0);
    expect(est.lines.every((l) => l.rate === undefined && l.total === undefined)).toBe(true);
    expect(est.missing).toEqual(["removeWall", "newWindow"]);
  });

  it("totals lines from the user's rates and adds contingency", () => {
    const rates = { removeWall: 500, newWindow: 800, [CONTINGENCY]: 10 };
    const est = estimateCosts(changes, rates);
    expect(est.lines.map((l) => [l.def.id, l.quantity, l.total])).toEqual([
      ["removeWall", 4, 2000],
      ["newWindow", 1, 800],
    ]);
    expect(est.subtotal).toBe(2800);
    expect(est.contingency).toBe(280);
    expect(est.total).toBe(3080);
    expect(est.missing).toEqual([]);
    expect(changeCost(changes.find((c) => c.costLine === "removeWall")!, rates)).toBe(2000);
    expect(changeCost(changes.find((c) => c.category === "Room")!, rates)).toBeUndefined();
  });
});

describe("notes", () => {
  it("collects room notes floor by floor", () => {
    const g = floor([rect("Kitchen", 0, 0, 300, 300, { notes: "  Replace units  " }), rect("Hall", 300, 0, 400, 300)]);
    const up = floor([rect("Bed", 0, 0, 300, 300, { notes: "Damp patch" })], [], { id: "f1", name: "First", level: 1 });
    expect(roomNotes(model(up, g))).toEqual([
      { floor: "Floor", room: "Kitchen", notes: "Replace units" },
      { floor: "First", room: "Bed", notes: "Damp patch" },
    ]);
  });
});

describe("areaSummary", () => {
  it("measures listing 91770873 within 5% of its printed 113.9 m² and leaves the garage out of the heated area", () => {
    const s = areaSummary(builtInHouse(""));
    expect(Math.abs(s.vsListed!)).toBeLessThan(0.05);
    expect(s.unheatedRooms).toEqual(["Garage"]);
    expect(s.internal - s.heated).toBeGreaterThan(10);
    expect(s.internal).toBeLessThan(modelArea(builtInHouse("")));
  });

  it("honours an explicit unheated flag over the name", () => {
    const m = builtInHouse("");
    m.floors[0].rooms.find((r) => r.name === "Garage")!.unheated = false;
    expect(areaSummary(m).unheatedRooms).toEqual([]);
  });
});

describe("archway between the living rooms", () => {
  it("is not reported as a change between As listed and the built-in Proposed", () => {
    const a = builtInHouse("x");
    const b = builtInProposed("x");
    const arch = a.floors[0].openings.find((o) => o.kind === "archway")!;
    expect(arch).toBeTruthy();
    expect(b.floors[0].openings.find((o) => o.x === arch.x && o.y === arch.y)?.kind).toBe("archway");
    const text = diffModels(a, b).map((c) => c.description).join("\n");
    expect(text).not.toMatch(/archway|bi-fold/i);
  });
});

describe("joinery costs", () => {
  const room = () => rect("Study", 0, 0, 600, 400);
  const withFx = (...fixtures: Fixture[]) => model(floor([room()], [], { fixtures }));
  const fx = (id: string, type: string, extra: Partial<Fixture> = {}): Fixture => ({ id, type, x: 100, y: 100, rot: 0, ...extra });
  const joinery = (a: HouseModel, b: HouseModel) => diffModels(a, b).filter((c) => c.category === "Joinery");
  const none = withFx();

  it("prices a new built-in as cupboard fronts and open shelving", () => {
    const ch = joinery(none, withFx(fx("a", "built-in-alcove")));
    expect(ch.map((c) => [c.costLine, c.quantity, c.unit])).toEqual([
      ["joineryClosed", 0.6, "m²"],
      ["joineryOpen", 1.4, "m²"],
    ]);
    expect(ch[0].description).toBe("New built-in alcove unit in the Study, 0.90 × 2.40 m: cupboard fronts");
  });

  it("ignores unchanged, moved and repainted units", () => {
    const base = withFx(fx("a", "built-in-alcove"));
    expect(joinery(base, base)).toEqual([]);
    expect(joinery(base, withFx(fx("a", "built-in-alcove", { x: 200 })))).toEqual([]);
    expect(joinery(base, withFx(fx("a", "built-in-alcove", { color: "#123456", worktop: "#654321", joinery: { carcass: "#111111" } })))).toEqual([]);
  });

  it("prices a resized unit again", () => {
    const ch = joinery(withFx(fx("a", "built-in-alcove")), withFx(fx("a", "built-in-alcove", { w: 1.2 })));
    expect(ch.map((c) => c.costLine)).toEqual(["joineryClosed", "joineryOpen"]);
    expect(ch[0].description).toContain("remade, now 1.20 × 2.40 m");
  });

  it("notes a removed unit without pricing it", () => {
    const ch = joinery(withFx(fx("a", "built-in-alcove")), none);
    expect(ch).toHaveLength(1);
    expect(ch[0].costLine).toBeUndefined();
    expect(ch[0].description).toBe("Built-in alcove unit in the Study removed");
  });

  it("counts floating shelves and window seat metres", () => {
    const shelf = joinery(none, withFx(fx("s", "floating-shelves")));
    expect(shelf.map((c) => [c.costLine, c.quantity])).toEqual([["floatingShelf", 3]]);
    expect(shelf[0].description).toBe("New floating shelves in the Study: 3 × 1.00 m");
    const seat = joinery(none, withFx(fx("w", "window-seat")));
    expect(seat.map((c) => [c.costLine, c.quantity])).toEqual([["windowSeat", 1.2]]);
  });

  it("estimates from joinery rates and lists unpriced lines", () => {
    const ch = joinery(none, withFx(fx("a", "built-in-alcove"), fx("w", "window-seat", { x: 400 })));
    const est = estimateCosts(ch, { joineryClosed: 600, joineryOpen: 300, windowSeat: 900 });
    expect(est.subtotal).toBeCloseTo(0.6 * 600 + 1.4 * 300 + 1.2 * 900);
    expect(est.missing).toEqual([]);
    expect(estimateCosts(ch, { windowSeat: 900 }).missing).toEqual(["joineryClosed", "joineryOpen"]);
  });

  it("finds no joinery changes between the listing variants", () => {
    expect(diffModels(builtInHouse(""), builtInProposed("")).filter((c) => c.category === "Joinery")).toEqual([]);
  });
});

describe("electrical costs", () => {
  const room = () => rect("Kitchen", 0, 0, 600, 400);
  const withFx = (...fixtures: Fixture[]) => model(floor([room()], [], { fixtures }));
  const fx = (id: string, type: string, x = 100, y = 100, extra: Partial<Fixture> = {}): Fixture => ({ id, type, x, y, rot: 0, ...extra });
  const elec = (a: HouseModel, b: HouseModel) => diffModels(a, b).filter((c) => c.category === "Electrics");
  const none = withFx();

  it("charges five new points on the electrical works line", () => {
    const five = withFx(fx("a", "socket-double", 50), fx("b", "socket-double", 150), fx("c", "socket-double", 250), fx("d", "switch-1g", 350), fx("e", "pendant", 450));
    const ch = elec(none, five);
    expect(ch.every((c) => c.costLine === "electricalWorks")).toBe(true);
    expect(ch.reduce((a, c) => a + c.quantity, 0)).toBe(5);
    expect(ch.find((c) => c.description.includes("socket"))).toMatchObject({ quantity: 3, unit: "each", description: "New socket (double) in the Kitchen × 3" });
    const est = estimateCosts(diffModels(none, five), { electricalWorks: 100 });
    const line = est.lines.find((l) => l.def.id === "electricalWorks")!;
    expect([line.quantity, line.total]).toEqual([5, 500]);
  });

  it("counts every bulb of a downlight grid", () => {
    const ch = elec(none, withFx(fx("g", "downlight-grid")));
    expect(ch).toHaveLength(1);
    expect(ch[0].quantity).toBe(4);
  });

  it("charges a point moved 0.3 m or more once, and ignores small moves, relinks and scene settings", () => {
    const base = withFx(fx("s", "socket-double", 100, 100), fx("sw", "switch-1g", 300, 100), fx("l", "pendant", 200, 200));
    expect(elec(base, withFx(fx("s", "socket-double", 120, 100), fx("sw", "switch-1g", 300, 100), fx("l", "pendant", 200, 200)))).toEqual([]);
    const moved = elec(base, withFx(fx("s", "socket-double", 140, 100), fx("sw", "switch-1g", 300, 100), fx("l", "pendant", 200, 200)));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ quantity: 1, costLine: "electricalWorks" });
    expect(moved[0].description).toMatch(/^Move socket/);
    const relinked = withFx(fx("s", "socket-double"), fx("sw", "switch-1g", 300, 100, { controls: ["l"] }), fx("l", "pendant", 200, 200, { dim: 40, warmth: 3000, on: false }));
    expect(elec(base, relinked)).toEqual([]);
  });

  it("notes removed points without pricing, and leaves furniture alone", () => {
    const ch = elec(withFx(fx("s", "socket-double"), fx("sofa", "sofa-3")), withFx(fx("sofa", "sofa-3")));
    expect(ch).toHaveLength(1);
    expect(ch[0].costLine).toBeUndefined();
    expect(ch[0].description).toBe("Socket (double) removed from the Kitchen");
    expect(elec(none, withFx(fx("sofa", "sofa-3")))).toEqual([]);
  });

  it("puts outdoor lights outside", () => {
    expect(elec(none, withFx(fx("o", "outside-light")))[0].description).toBe("New outside wall light outside");
  });
});
