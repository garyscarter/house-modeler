import { describe, expect, it } from "vitest";
import { PINCH_ZOOM_MAX, PINCH_ZOOM_PER_PX, STICKY_MS, WHEEL_ZOOM_MIN, WHEEL_ZOOM_PER_PX, wheelClassifier, wheelIntent, wheelPixels, wheelZoomFactor } from "./wheelGesture";

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
  it("follows the preference for a plain wheel, and still zooms a pinch", () => {
    expect(wheelIntent(ev({ deltaY: 4 }), "zoom")).toBe("zoom");
    expect(wheelIntent(ev({ deltaX: 3, deltaY: 4 }), "zoom")).toBe("zoom");
    expect(wheelIntent(ev({ deltaY: 100 }), "pan")).toBe("pan");
    expect(wheelIntent(ev({ deltaY: 3, deltaMode: 1 }), "pan")).toBe("pan");
    expect(wheelIntent(ev({ deltaY: 3, ctrlKey: true }), "pan")).toBe("zoom");
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
  it("reads the preference on every event", () => {
    let mode: "auto" | "zoom" | "pan" = "zoom";
    const c = wheelClassifier(() => mode);
    expect(c(ev({ deltaY: 4 }), 0)).toBe("zoom");
    mode = "pan";
    expect(c(ev({ deltaY: 100 }), STICKY_MS + 1)).toBe("pan");
  });
});

describe("wheelPixels", () => {
  it("scales lines and pages to px", () => {
    expect(wheelPixels(ev({ deltaX: 2, deltaY: 3 }))).toEqual({ dx: 2, dy: 3 });
    expect(wheelPixels(ev({ deltaY: 3, deltaMode: 1 }))).toEqual({ dx: 0, dy: 120 });
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on a negative delta, out on a positive one, and not at all on none", () => {
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, false)).toBeLessThan(1);
    expect(wheelZoomFactor(0, false)).toBe(1);
    expect(wheelZoomFactor(-100, false) * wheelZoomFactor(100, false)).toBeCloseTo(1);
  });
  it("scales a wheel notch with its size, down to a floor so a slow Mac notch still moves", () => {
    expect(wheelZoomFactor(-100, false)).toBeCloseTo(Math.exp(100 * WHEEL_ZOOM_PER_PX));
    expect(wheelZoomFactor(-4, false)).toBeCloseTo(Math.exp(WHEEL_ZOOM_MIN));
    expect(wheelZoomFactor(-120, false)).toBeGreaterThan(wheelZoomFactor(-100, false));
  });
  it("gives a pinch more punch per px, no floor, and a cap so Ctrl + a mouse notch is one big step", () => {
    expect(wheelZoomFactor(-10, true)).toBeCloseTo(Math.exp(10 * PINCH_ZOOM_PER_PX));
    expect(wheelZoomFactor(-1, true)).toBeLessThan(Math.exp(WHEEL_ZOOM_MIN));
    expect(wheelZoomFactor(-100, true)).toBeCloseTo(Math.exp(PINCH_ZOOM_MAX));
  });
});
