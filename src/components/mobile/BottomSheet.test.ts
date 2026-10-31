import { describe, expect, it } from "vitest";
import { detentHeights, settle } from "./BottomSheet";

const H = detentHeights(700); // peek 64, half 350, full 692

describe("sheet detents", () => {
  it("sizes the detents from the canvas", () => {
    expect(H).toEqual({ hidden: 0, peek: 64, half: 350, full: 692 });
  });
  it("half is the content's own height when that is less than half the canvas", () => {
    expect(detentHeights(700, 220).half).toBe(220);
    expect(detentHeights(700, 900).half).toBe(350);
    expect(detentHeights(700, 20).half).toBe(64);
  });
  it("settles on the nearest detent when released slowly", () => {
    expect(settle(100, 0, H)).toBe("peek");
    expect(settle(300, 0.1, H)).toBe("half");
    expect(settle(600, -0.2, H)).toBe("full");
  });
  it("snaps in the direction of a fling", () => {
    expect(settle(120, 0.9, H)).toBe("half");
    expect(settle(350, 0.9, H)).toBe("full");
    expect(settle(400, -0.9, H)).toBe("half");
    expect(settle(350, -0.9, H)).toBe("peek");
  });
});
