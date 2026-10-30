import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { useWalk, WALK_UI } from "./walkStore";
import { eyeHeightOf, forwardOf, initiallyOpen, patioSlider, yawOf } from "./lib/walkTypes";

const st = () => useStore.getState();
const walk = () => useWalk.getState();

describe("walk store", () => {
  beforeEach(() => {
    walk().stopWalk();
    useStore.setState({ tab: "plan", viewMode: "wipe", showCeilings: false, maxLevel: 0, sectionHeight: 1.2, showLabels: true, showExterior: false, showSite: false, measureTool: true, peek: false });
  });

  it("requestWalk switches to the walk view and stopWalk puts it back", () => {
    walk().requestWalk({ kind: "front" });
    expect(walk().on).toBe(true);
    expect(walk().pending).toEqual({ kind: "front" });
    expect(st().tab).toBe("3d");
    for (const [k, v] of Object.entries(WALK_UI)) expect(st()[k as keyof typeof WALK_UI]).toBe(v);
    walk().stopWalk();
    expect(walk().on).toBe(false);
    expect(st().viewMode).toBe("wipe");
    expect(st().showCeilings).toBe(false);
    expect(st().maxLevel).toBe(0);
    expect(st().sectionHeight).toBe(1.2);
    expect(st().showLabels).toBe(true);
    expect(st().measureTool).toBe(true);
  });

  it("a second request keeps the view saved by the first", () => {
    walk().requestWalk({ kind: "front" });
    walk().requestWalk({ kind: "room", level: 0, roomId: "r" });
    walk().stopWalk();
    expect(st().viewMode).toBe("wipe");
  });

  it("toggles and merges doors", () => {
    walk().toggleDoor("k", false);
    expect(walk().doors.k).toBe(true);
    walk().toggleDoor("k", false);
    expect(walk().doors.k).toBe(false);
    walk().mergeDoors({ k: true, j: true });
    expect(walk().doors).toEqual({ k: false, j: true });
  });
});

describe("walk rules", () => {
  it("clamps the eye height", () => {
    expect(eyeHeightOf({})).toBe(1.7);
    expect(eyeHeightOf({ eyeHeight: 5 })).toBe(2);
    expect(eyeHeightOf({ eyeHeight: 1.75 })).toBe(1.75);
  });

  it("yaw and forward agree", () => {
    for (const yaw of [0, 0.5, Math.PI / 2, -2]) expect(yawOf(forwardOf(yaw))).toBeCloseTo(yaw);
    expect(forwardOf(0).y).toBeCloseTo(-1);
  });

  it("doors start as the scene draws them", () => {
    expect(initiallyOpen({ kind: "door" }, false)).toBe(false);
    expect(initiallyOpen({ kind: "door" }, true)).toBe(true);
    expect(initiallyOpen({ kind: "door", openDeg: 0 }, true)).toBe(false);
    expect(initiallyOpen({ kind: "front" }, true)).toBe(false);
    expect(initiallyOpen({ kind: "gap" }, false)).toBe(true);
    expect(initiallyOpen({ kind: "window" }, true)).toBe(false);
  });

  it("the patio slider uncovers one panel", () => {
    const p = patioSlider(2.4);
    expect(p.n).toBe(2);
    expect(p.index).toBe(1);
    expect(p.span[1] - p.span[0]).toBeCloseTo((2.4 - 0.12) / 2);
  });
});
