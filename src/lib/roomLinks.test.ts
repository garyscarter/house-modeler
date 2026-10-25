import { describe, expect, it } from "vitest";
import type { Floor, Room } from "../types";
import { findRoom, linkRoot, linkedFollowers, setLink, syncLinks } from "./roomLinks";

const room = (id: string, extra: Partial<Room> = {}): Room => ({ id, name: id, polygon: [], ...extra }) as Room;
const mk = (): Floor[] =>
  [
    { id: "f1", name: "Ground", rooms: [room("A", { floorFinish: "herringbone", wallPaint: "#111111" }), room("B", { floorFinish: "plain", color: "#222222" })] },
    { id: "f2", name: "First", rooms: [room("C"), room("D")] },
  ] as unknown as Floor[];

describe("roomLinks", () => {
  it("finds rooms", () => {
    expect(findRoom(mk(), "C")?.floor.id).toBe("f2");
    expect(findRoom(mk(), "Z")).toBeUndefined();
  });
  it("setLink copies fields, removing the follower's own", () => {
    const out = setLink(mk(), "f1", "B", "floor", "A");
    const b = findRoom(out, "B")!.room;
    expect(b.floorFrom).toBe("A");
    expect(b.floorFinish).toBe("herringbone");
    expect(b.color).toBeUndefined();
    expect(b.wallsFrom).toBeUndefined();
  });
  it("clearing keeps values", () => {
    const linked = setLink(mk(), "f1", "B", "floor", "A");
    const b = findRoom(setLink(linked, "f1", "B", "floor", undefined), "B")!.room;
    expect(b.floorFrom).toBeUndefined();
    expect(b.floorFinish).toBe("herringbone");
  });
  it("resolves roots", () => {
    let f = setLink(mk(), "f1", "A", "floor", "B");
    f = setLink(f, "f2", "C", "floor", "A");
    expect(findRoom(f, "C")!.room.floorFrom).toBe("B");
    expect(linkRoot(f, "C", "floor")).toBe("B");
  });
  it("rejects self-link", () => {
    const f = setLink(mk(), "f1", "A", "floor", "A");
    expect(findRoom(f, "A")!.room.floorFrom).toBeUndefined();
    const g = setLink(setLink(mk(), "f1", "B", "floor", "A"), "f1", "A", "floor", "B");
    expect(findRoom(g, "A")!.room.floorFrom).toBeUndefined();
  });
  it("sync propagates floor not walls, and vice versa", () => {
    let f = setLink(mk(), "f1", "B", "floor", "A");
    f = setLink(f, "f2", "C", "walls", "A");
    f = f.map((fl) => ({ ...fl, rooms: fl.rooms.map((r) => (r.id === "A" ? { ...r, floorFinish: "tile" as never, wallPaint: "#abcdef" } : r)) }));
    const s = syncLinks(f, "A");
    expect(findRoom(s, "B")!.room.floorFinish).toBe("tile");
    expect(findRoom(s, "B")!.room.wallPaint).toBeUndefined();
    expect(findRoom(s, "C")!.room.wallPaint).toBe("#abcdef");
    expect(findRoom(s, "C")!.room.floorFinish).toBeUndefined();
    expect(linkedFollowers(s, "A", "floor").map((r) => r.id)).toEqual(["B"]);
  });
  it("ignores a missing source and returns the same array when unchanged", () => {
    const f = mk();
    f[0].rooms[1] = { ...f[0].rooms[1], floorFrom: "gone" };
    expect(syncLinks(f, "gone")).toBe(f);
    expect(linkRoot(f, "B", "floor")).toBeUndefined();
    const g = setLink(mk(), "f1", "B", "floor", "A");
    expect(syncLinks(g, "A")).toBe(g);
  });
});
