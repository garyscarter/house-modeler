import { describe, expect, it } from "vitest";
import { PAINT_PALETTE, swatchName } from "./paintPalette";

describe("paint palette", () => {
  it("has valid, distinct colours with distinct names", () => {
    expect(PAINT_PALETTE.length).toBeGreaterThanOrEqual(9);
    for (const s of PAINT_PALETTE) expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(PAINT_PALETTE.map((s) => s.hex)).size).toBe(PAINT_PALETTE.length);
    expect(new Set(PAINT_PALETTE.map((s) => s.name)).size).toBe(PAINT_PALETTE.length);
  });

  it("covers the modern staples by plain name", () => {
    const names = PAINT_PALETTE.map((s) => s.name.toLowerCase());
    for (const n of ["warm white", "soft greige", "sage green", "deep green", "navy", "terracotta", "dusty pink", "charcoal", "mushroom"]) expect(names).toContain(n);
  });

  it("names no paint brand", () => {
    const brands = /farrow|dulux|little greene|sherwin|benjamin|crown|valspar|leyland|johnstone|zinsser|annie sloan|\bral\b|pantone/i;
    for (const s of PAINT_PALETTE) expect(s.name).not.toMatch(brands);
  });

  it("looks a colour up by hex whatever its case", () => {
    expect(swatchName("#F4F1EA")).toBe("Warm white");
    expect(swatchName("#123456")).toBeUndefined();
  });
});
