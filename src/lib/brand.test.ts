import { describe, expect, it } from "vitest";
import { downloadPrefix, markSvg, MARK } from "./brand";

describe("brand", () => {
  it("draws the three parts of the mark in the given colour", () => {
    const svg = markSvg("#123456");
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg).toContain(MARK.roof);
    expect(svg).not.toContain("currentColor");
    expect(svg.match(/#123456/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("prefixes downloads with storey and the house", () => {
    expect(downloadPrefix("listing-91770873")).toBe("storey-listing-91770873");
    expect(downloadPrefix("")).toBe("storey");
  });
});
