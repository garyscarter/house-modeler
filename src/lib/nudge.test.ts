import { describe, expect, it } from "vitest";
import { arrowDelta, keyBelongsElsewhere, pasteAt, shiftPts, slideOpening } from "./nudge";

describe("arrowDelta", () => {
  it("is 1 cm, or 10 cm with Shift, and up is -y", () => {
    expect(arrowDelta("ArrowUp", false)).toEqual({ x: 0, y: -0.01 });
    expect(arrowDelta("ArrowRight", true)).toEqual({ x: 0.1, y: 0 });
    expect(arrowDelta("a", false)).toBeNull();
  });
});

describe("keyBelongsElsewhere", () => {
  it("ignores inputs, contenteditable and open dialogs", () => {
    expect(keyBelongsElsewhere({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(keyBelongsElsewhere({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(keyBelongsElsewhere({ tagName: "BODY" } as unknown as EventTarget)).toBe(false);
    expect(keyBelongsElsewhere({ tagName: "BODY" } as unknown as EventTarget, { querySelector: () => ({}) })).toBe(true);
  });
});

describe("slideOpening", () => {
  const wall: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 0, y: 50 },
    { x: 200, y: 50 },
  ];
  const o = { x: 100, y: 50, orientation: "h" as const, widthM: 1 };
  it("moves along the wall and ignores the perpendicular", () => {
    expect(slideOpening(o, wall, 5, 9, 100)).toEqual({ x: 105, y: 50 });
  });
  it("stays on the wall", () => {
    expect(slideOpening(o, wall, 500, 0, 100)).toEqual({ x: 150, y: 50 });
    expect(slideOpening(o, wall, -500, 0, 100)).toEqual({ x: 50, y: 50 });
  });
  it("slides vertical walls by dy and centres in a short wall", () => {
    const v = { x: 10, y: 100, orientation: "v" as const, widthM: 1 };
    expect(slideOpening(v, [{ x: 10, y: 0 }, { x: 10, y: 300 }], 7, -20, 100)).toEqual({ x: 10, y: 80 });
    expect(slideOpening(v, [{ x: 10, y: 0 }, { x: 10, y: 60 }], 0, 5, 100)).toEqual({ x: 10, y: 30 });
  });
});

describe("pasteAt", () => {
  const img = { w: 1000, h: 800 };
  const centre = { x: 500, y: 400 };
  it("keeps x / y when inside the image and nothing is there", () => {
    expect(pasteAt({ type: "sofa", x: 200, y: 300 }, [], img, centre, 100)).toEqual({ x: 200, y: 300 });
  });
  it("uses the view centre when outside the image", () => {
    expect(pasteAt({ type: "sofa", x: 2000, y: 300 }, [], img, centre, 100)).toEqual(centre);
  });
  it("offsets by 0.3 m while the original still sits there", () => {
    const src = { type: "sofa", x: 200, y: 300 };
    expect(pasteAt(src, [src], img, centre, 100)).toEqual({ x: 230, y: 330 });
    expect(pasteAt(src, [src, { type: "sofa", x: 230, y: 330 }], img, centre, 100)).toEqual({ x: 260, y: 360 });
  });
});

describe("shiftPts", () => {
  it("moves every point", () => expect(shiftPts([{ x: 1, y: 2 }], 3, 4)).toEqual([{ x: 4, y: 6 }]));
});
