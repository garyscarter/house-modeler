import { describe, expect, it } from "vitest";
import { progressLabel, samplesFor, stillSize } from "./stills";

describe("stillSize", () => {
  it("keeps a small viewer's size", () => {
    expect(stillSize(800, 533)).toEqual({ width: 800, height: 533 });
  });
  it("caps the longest side and keeps the aspect", () => {
    expect(stillSize(3200, 1800)).toEqual({ width: 1600, height: 900 });
    expect(stillSize(1000, 2000, 1000)).toEqual({ width: 500, height: 1000 });
  });
  it("never returns a zero size", () => {
    expect(stillSize(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe("samplesFor", () => {
  it("scales with quality", () => {
    expect(samplesFor("high")).toBe(256);
    expect(samplesFor("balanced")).toBe(128);
    expect(samplesFor("low")).toBe(48);
  });
});

describe("progressLabel", () => {
  it("says the scene is building before the first sample", () => {
    expect(progressLabel(0, 256, 0)).toBe("Building the scene…");
    expect(progressLabel(0.75, 256, 900)).toBe("Building the scene…");
  });
  it("estimates the time left from the running average", () => {
    // 48 samples in 9.6 s is 0.2 s each; 208 to go is about 42 s.
    expect(progressLabel(48, 256, 9600)).toBe("48 of 256 samples · about 42 s left");
  });
  it("switches to minutes for long waits", () => {
    expect(progressLabel(10, 256, 10000)).toBe("10 of 256 samples · about 4 min left");
  });
  it("drops the estimate when done", () => {
    expect(progressLabel(256, 256, 60000)).toBe("256 of 256 samples");
  });
});
