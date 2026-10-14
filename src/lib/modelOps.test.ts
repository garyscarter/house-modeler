import { describe, expect, it } from "vitest";
import { renamePhotos, scaleFloor } from "./modelOps";
import { floor, rect } from "./testing";

describe("scaleFloor", () => {
  it("scales everything placed in image pixels", () => {
    const f = floor([rect("A", 0, 0, 200, 100)], [{ id: "o", kind: "door", x: 100, y: 100, orientation: "h", widthM: 0.8 }], {
      walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }],
      fixtures: [{ id: "x", type: "toilet", x: 40, y: 20, rot: 0 }],
      canopies: [[{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }]],
      stairs: { x: 30, y: 30 },
    });
    const g = scaleFloor(f, 0.5, "img", 1000, 1000);
    expect(g.pxPerM).toBe(50);
    expect(g.rooms[0].polygon[2]).toEqual({ x: 100, y: 50 });
    expect(g.openings[0].x).toBe(50);
    expect(g.walls![0].b).toEqual({ x: 25, y: 0 });
    expect(g.fixtures![0]).toMatchObject({ x: 20, y: 10 });
    expect(g.canopies![0][1]).toEqual({ x: 10, y: 5 });
    expect(g.stairs).toEqual({ x: 15, y: 15 });
  });
});

describe("renamePhotos", () => {
  const photos = [
    { id: "1", name: "a", dataUrl: "", floorName: "Ground", roomName: "Kitchen" },
    { id: "2", name: "b", dataUrl: "", floorName: "First", roomName: "Kitchen" },
  ];
  it("follows a renamed room on its own floor only", () => {
    const out = renamePhotos(photos, "Ground", { room: "Kitchen" }, { room: "Kitchen/Diner" });
    expect(out[0].roomName).toBe("Kitchen/Diner");
    expect(out[1].roomName).toBe("Kitchen");
  });
  it("follows a renamed floor", () => {
    const out = renamePhotos(photos, "First", { floor: "First" }, { floor: "First Floor" });
    expect(out[1].floorName).toBe("First Floor");
  });
  it("returns the same array when nothing changes", () => {
    expect(renamePhotos(photos, "Ground", { room: "Lounge" }, { room: "Living" })).toBe(photos);
  });
});
