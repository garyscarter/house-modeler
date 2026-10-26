import { describe, expect, it } from "vitest";
import type { Floor, Opening, Room } from "../types";
import { openingSides } from "./openingSides";

const room = (id: string, name: string, x0: number, y0: number, x1: number, y1: number): Room =>
  ({ id, name, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] }) as Room;
const floor = { pxPerM: 100, rooms: [room("a", "Hall", 0, 0, 300, 300), room("b", "Living room", 300, 0, 600, 300)] } as unknown as Floor;
const door = (o: Partial<Opening>): Opening => ({ id: "d", kind: "door", x: 0, y: 0, orientation: "v", widthM: 0.9, ...o });

describe("openingSides", () => {
  it("names the rooms either side of an internal door; +z of a vertical wall is plan -x", () => {
    expect(openingSides(floor, door({ x: 300, y: 150 }))).toEqual({ front: "Hall", back: "Living room" });
  });
  it("puts outside first on an external wall", () => {
    expect(openingSides(floor, door({ x: 0, y: 150 }))).toEqual({ front: "outside", back: "Hall" });
    expect(openingSides(floor, door({ x: 150, y: 300, orientation: "h" }))).toEqual({ front: "outside", back: "Hall" });
    expect(openingSides(floor, door({ x: 150, y: 0, orientation: "h" }))).toEqual({ front: "outside", back: "Hall" });
  });
  it("uses +z (plan +y) as the front of an internal horizontal wall", () => {
    const f = { pxPerM: 100, rooms: [room("a", "Kitchen", 0, 0, 300, 300), room("b", "Hall", 0, 300, 300, 600)] } as unknown as Floor;
    expect(openingSides(f, door({ x: 150, y: 300, orientation: "h" }))).toEqual({ front: "Hall", back: "Kitchen" });
  });
  it("falls back to one side / other side", () => {
    expect(openingSides(floor, door({ x: 150, y: 150, orientation: "h" }))).toEqual({ front: "one side", back: "other side" });
    expect(openingSides(floor, door({ x: -500, y: 150 }))).toEqual({ front: "one side", back: "other side" });
  });
});
