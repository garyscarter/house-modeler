import { describe, expect, it } from "vitest";
import { CATALOGUE } from "./catalogue";
import { ELECTRIC_SYMBOLS, electricSymbol, glyphSvg, hasElectricSymbol } from "./electricSymbols";

describe("electric symbols", () => {
  it("draw every Lighting and Electrics symbol, and nothing for furniture", () => {
    for (const c of CATALOGUE.filter((x) => x.category === "Lighting" || x.category === "Electrics")) {
      expect(hasElectricSymbol(c.symbol), c.id).toBe(true);
      expect(electricSymbol(c.symbol).length, c.id).toBeGreaterThan(0);
    }
    expect(electricSymbol("sofa")).toEqual([]);
    expect(new Set(ELECTRIC_SYMBOLS).size).toBe(ELECTRIC_SYMBOLS.length);
  });
  it("serialise to SVG for print", () => {
    expect(glyphSvg("socket-2", 10, 20, 3.5)).toMatch(/^<g transform="translate\(10 20\)/);
  });
});
