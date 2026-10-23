import { describe, expect, it } from "vitest";
import { dockFloorActive, dockFloorPick, floorDisplayName, floorForKey, floorsByLevel, houseName, peekPatch, tabSwitchPatch } from "./studio";
import type { Floor, HouseModel } from "../types";

const fl = (id: string, level: number) => ({ id, name: id, level }) as unknown as Floor;
const floors = [fl("up", 1), fl("gr", 0)];

describe("floorDisplayName", () => {
  it("maps the preset names and leaves custom ones alone", () => {
    expect(floorDisplayName("Ground Floor")).toBe("Ground floor");
    expect(floorDisplayName("First Floor")).toBe("First floor");
    expect(floorDisplayName("LOWER GROUND FLOOR")).toBe("Lower ground floor");
    expect(floorDisplayName("Loft")).toBe("Loft");
    expect(floorDisplayName("Annexe Floor")).toBe("Annexe Floor");
  });
});

describe("houseName", () => {
  it("names the listing by preset or basedOn, else House", () => {
    expect(houseName({ preset: { id: "listing-91770873", version: 1 } } as HouseModel)).toBe("Listing 91770873");
    expect(houseName({ basedOn: { id: "listing-91770873-proposed", version: 1 } } as HouseModel)).toBe("Listing 91770873");
    expect(houseName({} as HouseModel)).toBe("House");
    expect(houseName(undefined)).toBe("House");
  });
});

describe("floors", () => {
  it("sorts by level without mutating", () => {
    expect(floorsByLevel(floors).map((f) => f.id)).toEqual(["gr", "up"]);
    expect(floors[0].id).toBe("up");
  });
  it("dockFloorPick in 3D sets the edit floor and cut; All clears the cut", () => {
    const ui = { tab: "3d" as const, maxLevel: null, editFloorId: null };
    expect(dockFloorPick(ui, floors, "gr")).toEqual({ editFloorId: "gr", maxLevel: 0 });
    expect(dockFloorPick({ ...ui, maxLevel: 0 }, floors, "all")).toEqual({ maxLevel: null });
  });
  it("dockFloorPick in plan only sets the edit floor, and All does nothing", () => {
    const ui = { tab: "plan" as const, maxLevel: 0, editFloorId: "gr" };
    expect(dockFloorPick(ui, floors, "up")).toEqual({ editFloorId: "up" });
    expect(dockFloorPick(ui, floors, "all")).toEqual({});
  });
  it("dockFloorActive lights All, the cut floor, or the edit floor", () => {
    expect(dockFloorActive({ tab: "3d", maxLevel: null, editFloorId: "gr" }, floors)).toBe("all");
    expect(dockFloorActive({ tab: "3d", maxLevel: 1, editFloorId: "gr" }, floors)).toBe("up");
    expect(dockFloorActive({ tab: "plan", maxLevel: null, editFloorId: "up" }, floors)).toBe("up");
    expect(dockFloorActive({ tab: "plan", maxLevel: null, editFloorId: null }, floors)).toBe("gr");
  });
  it("floorForKey picks by level, 0 is all, out of range is null", () => {
    expect(floorForKey(floors, "1")).toBe("gr");
    expect(floorForKey(floors, "2")).toBe("up");
    expect(floorForKey(floors, "3")).toBeNull();
    expect(floorForKey(floors, "0")).toBe("all");
    expect(floorForKey(floors, "x")).toBeNull();
  });
  it("tabSwitchPatch moves a cut to the edit floor, and leaves no cut alone", () => {
    expect(tabSwitchPatch({ tab: "plan", maxLevel: 0, editFloorId: "up" }, floors, "3d")).toEqual({ tab: "3d", maxLevel: 1 });
    expect(tabSwitchPatch({ tab: "plan", maxLevel: null, editFloorId: "up" }, floors, "3d")).toEqual({ tab: "3d" });
    expect(tabSwitchPatch({ tab: "3d", maxLevel: 1, editFloorId: "gr" }, floors, "plan")).toEqual({ tab: "plan" });
  });
});

describe("peekPatch", () => {
  const base = { peek: false, peekReturn: null, activeVariant: "proposed" as const, viewMode: "single" as const, variants: { current: {}, proposed: {} } };
  it("swaps to the other layout and back", () => {
    const on = peekPatch(base, true);
    expect(on).toEqual({ peek: true, peekReturn: "proposed", activeVariant: "current" });
    expect(peekPatch({ ...base, ...on } as typeof base, false)).toEqual({ peek: false, peekReturn: null, activeVariant: "proposed" });
    expect(peekPatch({ ...base, activeVariant: "current" }, true).activeVariant).toBe("proposed");
  });
  it("does nothing with one layout, in side by side or wipe, when already on or off", () => {
    expect(peekPatch({ ...base, variants: { proposed: {} } }, true)).toEqual({});
    expect(peekPatch({ ...base, viewMode: "side-by-side" }, true)).toEqual({});
    expect(peekPatch({ ...base, viewMode: "wipe" }, true)).toEqual({});
    expect(peekPatch({ ...base, peek: true }, true)).toEqual({});
    expect(peekPatch(base, false)).toEqual({});
    expect(peekPatch({ ...base, viewMode: "overlay" }, true).peek).toBe(true);
  });
});
