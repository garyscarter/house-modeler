import { describe, expect, it } from "vitest";
import type { Fixture } from "../types";
import { duplicateFixtures, exactGroup, expandToGroups, fixturesInRect, groupFixtures, moveFixtures, rotateFixtures, selectionBounds, ungroupFixtures } from "./fixtureGroups";
import { CATALOGUE } from "./catalogue";

const type = CATALOGUE[0].id;
const fx = (id: string, x: number, y: number, extra: Partial<Fixture> = {}): Fixture => ({ id, type, x, y, rot: 0, ...extra });
const base = [fx("a", 0, 0), fx("b", 100, 0), fx("c", 200, 0), fx("d", 300, 0)];

describe("grouping", () => {
  it("groups, expands and ungroups", () => {
    const g = groupFixtures(base, ["a", "b"], "G");
    expect(g.filter((f) => f.groupId === "G").map((f) => f.id)).toEqual(["a", "b"]);
    expect(expandToGroups(["a"], g).sort()).toEqual(["a", "b"]);
    expect(expandToGroups(["c"], g)).toEqual(["c"]);
    const u = ungroupFixtures(g, ["b"]);
    expect(u.some((f) => f.groupId)).toBe(false);
  });
  it("dissolves a group left with one member", () => {
    const g = groupFixtures(base, ["a", "b"], "G");
    const g2 = groupFixtures(g, ["b", "c"], "H");
    expect(g2.find((f) => f.id === "a")!.groupId).toBeUndefined();
    expect(g2.filter((f) => f.groupId === "H")).toHaveLength(2);
  });
  it("knows an exact group", () => {
    const g = groupFixtures(base, ["a", "b"], "G");
    expect(exactGroup(g, ["a", "b"])).toBe("G");
    expect(exactGroup(g, ["a"])).toBeNull();
  });
});

describe("moveFixtures", () => {
  it("moves only the ids", () => {
    const m = moveFixtures(base, ["a", "c"], 5, -2);
    expect(m.map((f) => [f.x, f.y])).toEqual([[5, -2], [100, 0], [205, -2], [300, 0]]);
  });
});

describe("rotateFixtures", () => {
  it("turns two items 90 degrees clockwise (y down) about their centre", () => {
    const r = rotateFixtures([fx("a", 0, 0), fx("b", 100, 0)], ["a", "b"], 90);
    expect(r[0].x).toBeCloseTo(50);
    expect(r[0].y).toBeCloseTo(-50);
    expect(r[1].x).toBeCloseTo(50);
    expect(r[1].y).toBeCloseTo(50);
    expect(r.map((f) => f.rot)).toEqual([90, 90]);
  });
  it("leaves others alone", () => {
    const r = rotateFixtures(base, ["a", "b"], 90);
    expect(r[2]).toEqual(base[2]);
  });
});

describe("duplicateFixtures", () => {
  it("copies a group as its own group, keeping layout", () => {
    let n = 0;
    const g = groupFixtures(base, ["a", "b"], "G");
    const copy = duplicateFixtures(g, ["a", "b"], 10, 20, () => "n" + ++n);
    expect(copy).toHaveLength(2);
    expect(copy[0].groupId).toBeDefined();
    expect(copy[0].groupId).toBe(copy[1].groupId);
    expect(copy[0].groupId).not.toBe("G");
    expect(copy[0].id).not.toBe("a");
    expect([copy[0].x, copy[0].y, copy[1].x]).toEqual([10, 20, 110]);
  });
  it("does not leave a lone grouped copy", () => {
    const g = groupFixtures(base, ["a", "b"], "G");
    expect(duplicateFixtures(g, ["a"], 0, 0, () => "x")[0].groupId).toBeUndefined();
  });
});

describe("fixturesInRect and selectionBounds", () => {
  it("picks by centre, any corner order", () => {
    expect(fixturesInRect(base, { x0: 150, y0: 10, x1: -10, y1: -10 })).toEqual(["a", "b"]);
  });
  it("includes footprints", () => {
    const b = selectionBounds([fx("a", 100, 100)], ["a"], 100)!;
    expect(b.x0).toBeLessThan(100);
    expect(b.x1).toBeGreaterThan(100);
    expect(selectionBounds(base, [], 100)).toBeNull();
  });
});
