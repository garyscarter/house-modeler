import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { useWalk, WALK_UI } from "./walkStore";
import { clearOfSweeps, DEFAULT_ADAPT, DEFAULT_LENS, DEFAULT_STEP, eyeHeightOf, forwardOf, initiallyOpen, leafSweeps, patioSlider, walkAdaptOf, walkLensOf, walkStepOf, yawOf } from "./lib/walkTypes";
import { openingParts } from "./lib/openings";
import type { Opening } from "./types";

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

  it("reads the lens: normal unless narrow or wide, legacy degrees mapped", () => {
    expect(walkLensOf({})).toBe("normal");
    expect(DEFAULT_LENS).toBe("normal");
    expect(walkLensOf({ walkLens: 75 })).toBe("narrow");
    expect(walkLensOf({ walkLens: 90 })).toBe("normal");
    expect(walkLensOf({ walkLens: 100 })).toBe("wide");
    expect(walkLensOf({ walkLens: 60 })).toBe("normal");
    expect(walkLensOf({ walkLens: "wide" })).toBe("wide");
    expect(walkLensOf({ walkLens: "narrow" })).toBe("narrow");
    expect(walkLensOf({ walkLens: "huge" })).toBe("normal");
  });

  it("reads eyes adjust (natural) and natural step (off), unknowns falling back", () => {
    expect(walkAdaptOf({})).toBe("natural");
    expect(DEFAULT_ADAPT).toBe("natural");
    expect(walkAdaptOf({ walkAdapt: "strong" })).toBe("strong");
    expect(walkAdaptOf({ walkAdapt: "off" })).toBe("off");
    expect(walkAdaptOf({ walkAdapt: "extreme" })).toBe("natural");
    expect(walkStepOf({})).toBe("off");
    expect(DEFAULT_STEP).toBe("off");
    expect(walkStepOf({ walkStep: "natural" })).toBe("natural");
    expect(walkStepOf({ walkStep: "lots" })).toBe("off");
  });

  it("keeps the lens info while walking and clears it when the walk stops", () => {
    walk().requestWalk({ kind: "front" });
    walk().setLens({ choice: "normal", w: 1, h: 1, hfov: 90, vfov: 60, cls: "large", options: { narrow: 75, normal: 90, wide: 100 } });
    expect(walk().lens?.hfov).toBe(90);
    walk().stopWalk();
    expect(walk().lens).toBeNull();
  });

  it("puts each leaf's swing where the 3D rig swings it", () => {
    const cases: [Partial<Opening>, { x: number; y: number }, 1 | -1 | 0][] = [
      [{ kind: "door" }, { x: 1, y: 0 }, 0],
      [{ kind: "door", flipHinge: true, flipSwing: true }, { x: 0, y: 1 }, 0],
      [{ kind: "door", flipSwing: true }, { x: 0, y: -1 }, 0],
      [{ kind: "door" }, { x: 1, y: 0 }, 1],
      [{ kind: "door", flipHinge: true }, { x: 0, y: 1 }, -1],
      [{ kind: "french" }, { x: 1, y: 0 }, 1],
      [{ kind: "front" }, { x: 0, y: 1 }, -1],
    ];
    for (const [o, dir, out] of cases) {
      const op = { id: "o", x: 0, y: 0, orientation: "h", widthM: 0.8, ...o } as Opening;
      const width = op.kind === "french" ? 1.5 : 0.8;
      const centre = { x: 2, y: 3 };
      const rig = openingParts({ opening: op, centre, dir, width, y0: 0, y1: 2 }, 0.1, out, true).rig!;
      const sweeps = leafSweeps(op, centre, dir, width, out);
      expect(sweeps).toHaveLength(rig.panels.length);
      // The rig's frame on the plan: x along dir, z along (-dir.y, dir.x) (DoorLeaves turns it by atan2(-dir.y, dir.x)).
      const toPlan = (x: number, z: number) => ({ x: centre.x + dir.x * x - dir.y * z, y: centre.y + dir.y * x + dir.x * z });
      rig.panels.forEach((panel, i) => {
        const pose = panel.pose(1);
        const hinge = toPlan(pose.x, pose.z);
        expect(Math.hypot(hinge.x - sweeps[i].hinge.x, hinge.y - sweeps[i].hinge.y)).toBeLessThan(0.1);
        // The open leaf points away from its hinge along its local +x, turned by ry.
        const tip = toPlan(pose.x + Math.cos(pose.ry), pose.z - Math.sin(pose.ry));
        const way = { x: tip.x - hinge.x, y: tip.y - hinge.y };
        expect(way.x * sweeps[i].side.x + way.y * sweeps[i].side.y, JSON.stringify(o)).toBeGreaterThan(0.5);
      });
    }
  });

  it("is clear of a sweep beyond the leaf's reach, or behind the wall it swings away from", () => {
    const [sw] = leafSweeps({ kind: "door" }, { x: 0, y: 0 }, { x: 1, y: 0 }, 0.8, 0);
    // Hinge at x -0.4, swinging to +y.
    expect(clearOfSweeps([sw], { x: 0, y: 0.5 }, 0.25)).toBe(false);
    expect(clearOfSweeps([sw], { x: 0, y: 1.2 }, 0.25)).toBe(true);
    expect(clearOfSweeps([sw], { x: 0, y: -0.3 }, 0.25)).toBe(true);
  });

  it("the patio slider uncovers one panel", () => {
    const p = patioSlider(2.4);
    expect(p.n).toBe(2);
    expect(p.index).toBe(1);
    expect(p.span[1] - p.span[0]).toBeCloseTo((2.4 - 0.12) / 2);
  });
});
