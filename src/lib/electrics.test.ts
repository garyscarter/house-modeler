import { describe, expect, it } from "vitest";
import {
  OUTSIDE,
  addCircuit,
  assignToCircuit,
  centreHeight,
  circuitOf,
  controllersOf,
  deleteCircuit,
  links,
  glyphOffset,
  isWallPoint,
  mountForCentre,
  numberPoints,
  pointKind,
  pointQuantity,
  pointRows,
  pointsOf,
  pruneCircuits,
  pruneLinks,
  renameCircuit,
  roomOf,
  scheduleRows,
  toggleLink,
  totals,
} from "./electrics";
import { byId } from "./catalogue";
import { floor, rect } from "./testing";
import type { Fixture, HouseModel } from "../types";

// 1 px = 1 cm: a kitchen 0-400 × 0-300 and a hall 400-600 × 0-300 on the ground floor; a landing upstairs.
const fx = (id: string, type: string, x: number, y: number, extra: Partial<Fixture> = {}): Fixture => ({ id, type, x, y, rot: 0, ...extra });
const ground = floor([rect("Kitchen", 0, 0, 400, 300), rect("Hall", 400, 0, 600, 300)], [], {
  fixtures: [
    fx("s2", "socket-double", 300, 296),
    fx("s1", "socket-double", 100, 296),
    fx("sw", "switch-1g", 390, 150, { controls: ["k1", "k2", "gone"] }),
    fx("k1", "pendant", 100, 150),
    fx("k2", "downlight-grid", 300, 150),
    fx("sofa", "sofa-3", 200, 100),
    fx("lamp", "floor-lamp", 50, 50),
    fx("out", "outside-light", 200, 310),
    fx("hl", "flush-light", 500, 150),
  ],
});
const first = floor([rect("Landing", 0, 0, 300, 300)], [], { id: "f1", level: 1, name: "First", fixtures: [fx("sw2", "switch-2way", 10, 10, { controls: ["hl"] })] });
const model: HouseModel = { floors: [first, ground], ceilingHeight: 2.4, slabThickness: 0.25 };

describe("pointKind", () => {
  it("classes lights, switches, sockets and the rest; furniture and plug-in lamps are not points", () => {
    expect(pointKind(byId("pendant")!)).toBe("light");
    expect(pointKind(byId("outside-light")!)).toBe("light");
    expect(pointKind(byId("switch-pull-cord")!)).toBe("switch");
    expect(pointKind(byId("socket-floor")!)).toBe("socket");
    expect(pointKind(byId("cooker-switch")!)).toBe("connection");
    expect(pointKind(byId("smoke-alarm")!)).toBe("alarm");
    expect(pointKind(byId("consumer-unit")!)).toBe("board");
    expect(pointKind(byId("floor-lamp")!)).toBeUndefined();
    expect(pointKind(byId("sofa-3")!)).toBeUndefined();
  });
});

describe("heights", () => {
  it("reads and writes wall points by their centre", () => {
    const item = byId("socket-double")!;
    expect(centreHeight(fx("a", "socket-double", 0, 0), item, 2.4)).toBeCloseTo(0.45, 3);
    expect(mountForCentre(1.1, fx("a", "socket-double", 0, 0), item)).toBeCloseTo(1.1 - 0.043, 3);
    expect(pointQuantity({}, byId("downlight-grid")!)).toBe(4);
    expect(pointQuantity({ w: 3.6, d: 2.4, pitch: 1.2 }, byId("downlight-grid")!)).toBe(6);
    expect(pointQuantity({}, byId("pendant")!)).toBe(1);
  });
});

describe("glyphOffset", () => {
  it("pushes a wall point's symbol off the wall into the room, and leaves ceiling items alone", () => {
    const sock = byId("socket-double")!;
    const o = glyphOffset({ rot: 0 }, sock, 0.25);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(0.125 - 0.0175);
    const r = glyphOffset({ rot: 90 }, sock, 0.25);
    expect(r.x).toBeCloseTo(-(0.125 - 0.0175));
    expect(r.y).toBeCloseTo(0);
    expect(glyphOffset({ rot: 0 }, byId("pendant")!, 0.25)).toEqual({ x: 0, y: 0 });
    expect(isWallPoint(byId("socket-floor")!)).toBe(false);
  });
});

describe("rooms and numbers", () => {
  it("puts a point in the room holding it, a point in a wall in the nearest room, outdoor items Outside", () => {
    expect(roomOf(ground, { x: 100, y: 100 }).name).toBe("Kitchen");
    expect(roomOf(ground, { x: 100, y: 320 }).name).toBe("Kitchen");
    expect(roomOf(ground, { x: 100, y: 400 }).name).toBe(OUTSIDE);
    expect(roomOf(ground, { x: 100, y: 100 }, { outdoor: true }).name).toBe(OUTSIDE);
  });
  it("lists only electrical points", () => {
    expect(pointsOf(ground).map((p) => p.fx.id).sort()).toEqual(["hl", "k1", "k2", "out", "s1", "s2", "sw"]);
  });
  it("numbers per room and kind in reading order, floors by level, Outside last", () => {
    const n = numberPoints(model).map((p) => `${p.room.name} ${p.label} ${p.fx.id}`);
    expect(n).toEqual(["Kitchen L1 k1", "Kitchen L2 k2", "Kitchen SW1 sw", "Kitchen S1 s1", "Kitchen S2 s2", "Hall L1 hl", "Outside L1 out", "Landing SW1 sw2"]);
  });
});

describe("links", () => {
  it("indexes the switches of each light across floors and skips dangling ids", () => {
    expect(controllersOf(model, "hl").map((s) => s.id)).toEqual(["sw2"]);
    expect(controllersOf(model, "k1").map((s) => s.id)).toEqual(["sw"]);
    expect(links(model).map((l) => `${l.from.fx.id}>${l.to.fx.id}`)).toEqual(["sw>k1", "sw>k2", "sw2>hl"]);
  });
  it("toggles a link and prunes dead ones", () => {
    expect(toggleLink({ controls: ["a"] }, "b")).toEqual({ controls: ["a", "b"] });
    expect(toggleLink({ controls: ["a"] }, "a")).toEqual({ controls: undefined });
    const pruned = pruneLinks(model);
    expect(pruned.floors[1].fixtures!.find((f) => f.id === "sw")!.controls).toEqual(["k1", "k2"]);
    expect(pruneLinks(pruned)).toBe(pruned);
  });
});

describe("circuits", () => {
  it("adds, renames, assigns (one circuit per point), deletes and prunes", () => {
    let c = addCircuit(undefined, "ring", "c1");
    c = addCircuit(c, "lighting", "c2", "Ground lights");
    expect(c.map((x) => x.name)).toEqual(["Ring main 1", "Ground lights"]);
    c = assignToCircuit(c, "c1", ["s1", "s2"]);
    c = assignToCircuit(c, "c2", ["s2", "k1"]);
    expect(circuitOf(c, "s2")?.id).toBe("c2");
    expect(c[0].points).toEqual(["s1"]);
    c = renameCircuit(c, "c1", "Kitchen ring");
    expect(c[0].name).toBe("Kitchen ring");
    expect(assignToCircuit(c, null, ["s1"])[0].points).toEqual([]);
    expect(pruneCircuits({ ...model, circuits: [{ id: "x", name: "x", kind: "other", points: ["s1", "nope"] }] })![0].points).toEqual(["s1"]);
    expect(deleteCircuit(c, "c1").map((x) => x.id)).toEqual(["c2"]);
  });
});

describe("schedule (stubs until Dua Lipa's chunk)", () => {
  it("exports the schedule functions", () => {
    expect(Array.isArray(pointRows(model))).toBe(true);
    expect(Array.isArray(scheduleRows([]))).toBe(true);
    expect(Array.isArray(totals([]))).toBe(true);
  });
});
