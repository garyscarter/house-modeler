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
    expect(downloadPrefix("my-house")).toBe("storey-my-house");
    expect(downloadPrefix("")).toBe("storey");
  });
});

describe("wordmark", () => {
  it("has both optical sizes and picks small under 40 px", async () => {
    const { WORDMARK, wordmarkCut, wordmarkSvg, wordmarkWidth } = await import("./brand");
    for (const cut of ["small", "large"] as const) {
      expect(WORDMARK[cut].d.length).toBeGreaterThan(500);
      expect(WORDMARK[cut].viewBox).toHaveLength(4);
    }
    expect(wordmarkCut(16)).toBe("small");
    expect(wordmarkCut(60)).toBe("large");
    // About 3.8 times as wide as it is tall (t ascender to y descender).
    expect(wordmarkWidth(10) / 10).toBeGreaterThan(3);
    expect(wordmarkWidth(10) / 10).toBeLessThan(4.5);
    const svg = wordmarkSvg("#000", 20, { x: 1, y: 2 });
    expect(svg).toContain('aria-label="Storey"');
    expect(svg).toContain('x="1.00" y="2.00"');
  });
});
