import { describe, expect, it } from "vitest";
import {
  CLICK_SLOP_PX,
  canLongPress,
  DOUBLE_PRESS_MS,
  IDLE,
  chipSize,
  clampScale,
  pinchOf,
  reduceDrag,
  type DragEvent,
  type DragPhase,
  frameOf,
  isDoublePress,
  liveTransform,
  pastSlop,
  resizeCam,
} from "./editorCore";

describe("pastSlop", () => {
  it("is true at the slop distance and beyond", () => {
    expect(pastSlop({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
    expect(pastSlop({ x: 0, y: 0 }, { x: CLICK_SLOP_PX, y: 0 })).toBe(true);
    expect(pastSlop({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(true);
  });
});

describe("isDoublePress", () => {
  const a = { key: "room:1#0", at: 1000, x: 100, y: 100 };
  it("accepts the same key inside 400 ms and 6 px", () => {
    expect(isDoublePress(a, { ...a, at: 1000 + DOUBLE_PRESS_MS, x: 104, y: 104 })).toBe(true);
  });
  it("rejects another key, too late, too far, or nothing before", () => {
    expect(isDoublePress(a, { ...a, key: "room:1#1", at: 1100 })).toBe(false);
    expect(isDoublePress(a, { ...a, at: 1401 })).toBe(false);
    expect(isDoublePress(a, { ...a, at: 1100, x: 108 })).toBe(false);
    expect(isDoublePress(null, a)).toBe(false);
    expect(isDoublePress(a, { ...a, at: 900 })).toBe(false);
  });
});

describe("liveTransform", () => {
  it("is empty for equal cameras", () => {
    expect(liveTransform({ x: 5, y: 6, s: 2 }, { x: 5, y: 6, s: 2 })).toBe("");
  });
  it("maps committed-frame points to where the live camera shows them", () => {
    const c0 = { x: 100, y: 50, s: 2 };
    const c1 = { x: 60, y: 90, s: 1 };
    const m = /matrix\(([^ ]+) 0 0 ([^ ]+) ([^ ]+) ([^)]+)\)/.exec(liveTransform(c0, c1))!;
    const [k, , tx, ty] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    for (const P of [{ x: 0, y: 0 }, { x: 123, y: 45 }, { x: -20, y: 300 }]) {
      // The point sits at screen S under c1; drawn from the c0 viewBox, the transformed point must land at the same S.
      const S = { x: (P.x - c1.x) / c1.s, y: (P.y - c1.y) / c1.s };
      const Q = { x: k * P.x + tx, y: k * P.y + ty };
      const S0 = { x: (Q.x - c0.x) / c0.s, y: (Q.y - c0.y) / c0.s };
      expect(S0.x).toBeCloseTo(S.x, 4);
      expect(S0.y).toBeCloseTo(S.y, 4);
    }
  });
});

describe("resizeCam", () => {
  const c = { x: 10, y: 20, s: 2 };
  it("topLeft keeps the camera", () => {
    expect(resizeCam(c, { w: 100, h: 100 }, { w: 300, h: 50 }, "topLeft")).toEqual(c);
  });
  it("centre keeps the model point at the centre", () => {
    const r = resizeCam(c, { w: 100, h: 100 }, { w: 300, h: 50 }, "centre");
    expect(r.s).toBe(2);
    expect(r.x + (300 * r.s) / 2).toBeCloseTo(c.x + (100 * c.s) / 2);
    expect(r.y + (50 * r.s) / 2).toBeCloseTo(c.y + (100 * c.s) / 2);
  });
});

describe("clampScale", () => {
  it("leaves an in-range camera alone", () => {
    const c = { x: 1, y: 2, s: 3 };
    expect(clampScale(c, 1, 5, { x: 10, y: 10 })).toBe(c);
  });
  it("keeps the point under `about`", () => {
    const c = { x: 100, y: 200, s: 10 };
    const about = { x: 40, y: 30 };
    const r = clampScale(c, 1, 4, about);
    expect(r.s).toBe(4);
    expect(r.x + about.x * r.s).toBeCloseTo(c.x + about.x * c.s);
    expect(r.y + about.y * r.s).toBeCloseTo(c.y + about.y * c.s);
    expect(clampScale(c, 20, 30, about).s).toBe(20);
  });
});

describe("frameOf", () => {
  it("round-trips toScreen against fromClient", () => {
    const f = frameOf({ x: 100, y: 50, s: 0.5 }, { left: 30, top: 20 }, 40);
    expect(f.unitsPerPx).toBe(0.5);
    expect(f.unitsPerM).toBe(40);
    const p = { x: 133, y: 71 };
    const s = f.toScreen(p);
    const back = f.fromClient({ clientX: s.x + 30, clientY: s.y + 20 });
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe("chipSize and pinchOf", () => {
  it("sizes a chip from its text", () => {
    const c = chipSize("3.00 m", 2, 10);
    expect(c.w).toBeCloseTo(6 * 10 * 0.56 + 16);
    expect(c.h).toBeCloseTo(13.5);
  });
  it("finds the midpoint and a non-zero spread", () => {
    expect(pinchOf({ x: 0, y: 0 }, { x: 6, y: 8 })).toEqual({ m: { x: 3, y: 4 }, d: 10 });
    expect(pinchOf({ x: 1, y: 1 }, { x: 1, y: 1 }).d).toBe(1);
  });
});

describe("canLongPress", () => {
  const o = { x: 100, y: 100 };
  it("accepts a still finger or pen, alone", () => {
    expect(canLongPress("touch", 1, o, { x: 103, y: 102 })).toBe(true);
    expect(canLongPress("pen", 1, o, o)).toBe(true);
  });
  it("refuses a mouse, a second pointer and a moved finger", () => {
    expect(canLongPress("mouse", 1, o, o)).toBe(false);
    expect(canLongPress("touch", 2, o, o)).toBe(false);
    expect(canLongPress("touch", 1, o, { x: 108, y: 100 })).toBe(false);
  });
});

describe("reduceDrag", () => {
  const run = (events: DragEvent[], from: DragPhase = IDLE) => {
    let phase = from;
    const all: string[][] = [];
    for (const ev of events) {
      const r = reduceDrag(phase, ev);
      phase = r.phase;
      all.push(r.effects);
    }
    return { phase, all };
  };
  const press: DragEvent = { type: "press", pointerId: 1, client: { x: 100, y: 100 }, slop: 6 };

  it("stays pressed inside the slop, then starts and moves", () => {
    const r = run([press, { type: "move", pointerId: 1, client: { x: 103, y: 100 } }, { type: "move", pointerId: 1, client: { x: 110, y: 100 } }, { type: "move", pointerId: 1, client: { x: 120, y: 100 } }]);
    expect(r.all).toEqual([[], [], ["start", "move"], ["move"]]);
    expect(r.phase.tag).toBe("moving");
  });
  it("a slop of 0 moves from the first event", () => {
    const r = run([{ ...press, slop: 0 } as DragEvent, { type: "move", pointerId: 1, client: { x: 100, y: 100 } }]);
    expect(r.all[1]).toEqual(["start", "move"]);
  });
  it("a release inside the slop is a tap; after moving it flushes then ends", () => {
    expect(run([press, { type: "up", pointerId: 1 }]).all[1]).toEqual(["tap", "finish"]);
    const moved = run([press, { type: "move", pointerId: 1, client: { x: 150, y: 100 } }, { type: "up", pointerId: 1 }]);
    expect(moved.all[2]).toEqual(["flush", "end", "finish"]);
    expect(moved.phase).toEqual(IDLE);
  });
  it("cancel restores, finishes and notifies, and is a no-op when idle", () => {
    expect(run([press, { type: "cancel" }]).all[1]).toEqual(["restore", "finish", "cancelled"]);
    expect(run([{ type: "cancel" }]).all[0]).toEqual([]);
  });
  it("lost capture keeps the changes; before the slop it just finishes", () => {
    expect(run([press, { type: "move", pointerId: 1, client: { x: 150, y: 100 } }, { type: "lost", pointerId: 1 }]).all[2]).toEqual(["flush", "end", "finish"]);
    expect(run([press, { type: "lost", pointerId: 1 }]).all[1]).toEqual(["finish"]);
  });
  it("ignores another pointer and a second press", () => {
    const r = run([press, { type: "move", pointerId: 2, client: { x: 300, y: 300 } }, { type: "up", pointerId: 2 }, press]);
    expect(r.all).toEqual([[], [], [], []]);
    expect(r.phase.tag).toBe("pressed");
  });
});
