import { describe, expect, it } from "vitest";
import { isIOS, withMaxScale } from "./noFocusZoom";

describe("no zoom on focus", () => {
  it("recognises iPhones and iPads (which pose as a Mac with a touch screen), not Android or a real Mac", () => {
    expect(isIOS({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/124", maxTouchPoints: 5 })).toBe(false);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124", maxTouchPoints: 0 })).toBe(false);
  });
  it("adds maximum-scale=1 to the viewport content once", () => {
    expect(withMaxScale("width=device-width, initial-scale=1, viewport-fit=cover")).toBe("width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1");
    expect(withMaxScale("width=device-width, maximum-scale=1")).toBe("width=device-width, maximum-scale=1");
  });
});
