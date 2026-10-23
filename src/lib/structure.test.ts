import { describe, expect, it } from "vitest";
import type { Floor, HouseModel } from "../types";
import { floorStructure, flightStructure, modelStructure, roofStructure, shellLooks } from "./structure";

const floor = (): Floor => ({
  id: "g",
  name: "Ground",
  level: 0,
  image: "data:image/png;base64,AAAA",
  imageW: 100,
  imageH: 100,
  pxPerM: 10,
  origin: { x: 0, y: 0 },
  offset: { x: 0, y: 0 },
  rooms: [{ id: "r1", name: "Kitchen", polygon: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }], color: "#fff" }],
  openings: [{ id: "o1", kind: "window", x: 25, y: 0, orientation: "h", widthM: 1, color: "#000" }],
  stairs: { x: 10, y: 10 },
});
const model = (f: Floor): HouseModel => ({ floors: [f], ceilingHeight: 2.4, slabThickness: 0.2, exterior: { roofColor: "#a00" } as HouseModel["exterior"] });

describe("structure signatures", () => {
  it("ignore colours, finishes, names and fixtures", () => {
    const a = floor();
    const b = floor();
    b.rooms[0] = { ...b.rooms[0], color: "#123", wallPaint: "#abc", floorFinish: "oak" as never, notes: "x" };
    b.openings[0] = { ...b.openings[0], color: "#fff", frameColor: "#222" };
    b.fixtures = [{ id: "f", type: "sofa", x: 1, y: 1, rot: 0 }];
    expect(floorStructure(b)).toBe(floorStructure(a));
    expect(modelStructure(model(b))).toBe(modelStructure(model(a)));
    expect(roofStructure(model(b))).toBe(roofStructure(model(a)));
    expect(flightStructure(model(b), b)).toBe(flightStructure(model(a), a));
  });

  it("change when a wall moves", () => {
    const b = floor();
    b.rooms[0] = { ...b.rooms[0], polygon: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 50 }, { x: 0, y: 50 }] };
    expect(floorStructure(b)).not.toBe(floorStructure(floor()));
    expect(roofStructure(model(b))).not.toBe(roofStructure(model(floor())));
  });

  it("change with openings, but the roof and flight do not read them", () => {
    const b = floor();
    b.openings = [...b.openings, { id: "o2", kind: "door", x: 5, y: 0, orientation: "h", widthM: 0.9 }];
    expect(floorStructure(b)).not.toBe(floorStructure(floor()));
    expect(modelStructure(model(b))).not.toBe(modelStructure(model(floor())));
    expect(roofStructure(model(b))).toBe(roofStructure(model(floor())));
  });

  it("change with stairs, heights, exterior, free walls and exterior colour", () => {
    const base = floor();
    const moved = { ...floor(), stairs: { x: 20, y: 10 } };
    expect(flightStructure(model(moved), moved)).not.toBe(flightStructure(model(base), base));
    const taller = { ...model(base), ceilingHeight: 2.6 };
    expect(roofStructure(taller)).not.toBe(roofStructure(model(base)));
    expect(flightStructure(taller, base)).not.toBe(flightStructure(model(base), base));
    const hip = { ...model(base), exterior: { roofStyle: "hip" } as HouseModel["exterior"] };
    expect(roofStructure(hip)).not.toBe(roofStructure(model(base)));
    const walled = { ...floor(), walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }] };
    expect(floorStructure(walled)).not.toBe(floorStructure(base));
    const ext = floor();
    ext.rooms[0] = { ...ext.rooms[0], exteriorColor: "#900" };
    expect(floorStructure(ext)).not.toBe(floorStructure(base));
  });
});

describe("shellLooks", () => {
  it("ignores fixtures, floor colours and finishes, names and the plan image", () => {
    const a = floor();
    const b = floor();
    b.rooms[0] = { ...b.rooms[0], name: "Diner", color: "#123", floorFinish: "oak" as never, floorAngle: 45, floorGrout: "#999", notes: "x" };
    b.fixtures = [{ id: "f", type: "sofa", x: 1, y: 1, rot: 0 }];
    b.image = "data:image/png;base64,BBBB";
    expect(shellLooks(b)).toBe(shellLooks(a));
    b.fixtures = [{ id: "f", type: "sofa", x: 9, y: 4, rot: 90 }];
    expect(shellLooks({ ...b })).toBe(shellLooks(a));
  });

  it("changes with wall paint, skirting, exterior colour, opening colours and opening position", () => {
    const base = shellLooks(floor());
    const paint = floor();
    paint.rooms[0] = { ...paint.rooms[0], wallPaint: "#abc" };
    expect(shellLooks(paint)).not.toBe(base);
    const skirt = floor();
    skirt.rooms[0] = { ...skirt.rooms[0], skirtingColor: "#333" };
    expect(shellLooks(skirt)).not.toBe(base);
    const ext = floor();
    ext.rooms[0] = { ...ext.rooms[0], exteriorColor: "#a33" };
    expect(shellLooks(ext)).not.toBe(base);
    const moved = floor();
    moved.openings[0] = { ...moved.openings[0], x: 30 };
    expect(shellLooks(moved)).not.toBe(base);
    const tinted = floor();
    tinted.openings[0] = { ...tinted.openings[0], frameColor: "#222" };
    expect(shellLooks(tinted)).not.toBe(base);
  });
});
