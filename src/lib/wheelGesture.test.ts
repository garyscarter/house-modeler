import { describe, expect, it } from "vitest";
import { STICKY_MS, wheelClassifier, wheelIntent, wheelPixels } from "./wheelGesture";

const ev = (p: Partial<{ deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean }>) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  ...p,
});

describe("wheelIntent", () => {
  it("zooms on a trackpad pinch and on Ctrl/⌘ + wheel", () => {
    expect(wheelIntent(ev({ deltaY: 2.5, ctrlKey: true }))).toBe("zoom");
    expect(wheelIntent(ev({ deltaY: 100, metaKey: true }))).toBe("zoom");
  });
  it("zooms on mouse wheel notches, in px or in lines", () => {
    expect(wheelIntent(ev({ deltaY: 100 }))).toBe("zoom");
    expect(wheelIntent(ev({ deltaY: -120 }))).toBe("zoom");
    expect(wheelIntent(ev({ deltaY: 3, deltaMode: 1 }))).toBe("zoom");
  });
  it("pans on a trackpad swipe: sideways, small or fractional steps", () => {
    expect(wheelIntent(ev({ deltaX: 4, deltaY: 1 }))).toBe("pan");
    expect(wheelIntent(ev({ deltaY: 6 }))).toBe("pan");
    expect(wheelIntent(ev({ deltaY: 57.5 }))).toBe("pan");
  });
});

describe("wheelClassifier", () => {
  it("keeps a swipe a pan when its steps grow large", () => {
    const c = wheelClassifier();
    expect(c(ev({ deltaY: 4 }), 0)).toBe("pan");
    expect(c(ev({ deltaY: 120 }), 16)).toBe("pan");
  });
  it("decides afresh after a pause, or when a pinch starts", () => {
    const c = wheelClassifier();
    expect(c(ev({ deltaY: 4 }), 0)).toBe("pan");
    expect(c(ev({ deltaY: 3, ctrlKey: true }), 10)).toBe("zoom");
    expect(c(ev({ deltaY: 100 }), 10 + STICKY_MS + 1)).toBe("zoom");
  });
});

describe("wheelPixels", () => {
  it("scales lines and pages to px", () => {
    expect(wheelPixels(ev({ deltaX: 2, deltaY: 3 }))).toEqual({ dx: 2, dy: 3 });
    expect(wheelPixels(ev({ deltaY: 3, deltaMode: 1 }))).toEqual({ dx: 0, dy: 120 });
  });
});
