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

  const WALL = [
    "wall-light", "switch-1g", "switch-2g", "switch-2way", "switch-dimmer", "switch-pull", "socket-1", "socket-2", "socket-usb",
    "socket-outdoor", "shaver-socket", "fused-spur", "cooker-switch", "cooker-outlet", "shower-point", "extractor-fan",
    "thermostat", "bell-push", "bell-chime", "co-alarm", "tv-point", "data-point", "ev-charger", "consumer-unit",
  ] as const;
  const ext = (p: ReturnType<typeof electricSymbol>[number]): number[][] => {
    switch (p.k) {
      case "circle": return [[p.cx - p.r, p.cy - p.r], [p.cx + p.r, p.cy + p.r]];
      case "line": return [[p.x1, p.y1], [p.x2, p.y2]];
      case "rect": return [[p.x, p.y], [p.x + p.w, p.y + p.h]];
      case "text": return [[p.x, p.y]];
      case "path": return (p.d.match(/-?\d*\.?\d+/g) ?? []).map(Number).flatMap((v, i, a) => (i % 2 === 0 && i + 1 < a.length ? [[v, a[i + 1]]] : []));
    }
  };
  it("keep every primitive inside the unit square", () => {
    for (const sym of ELECTRIC_SYMBOLS) {
      for (const p of electricSymbol(sym)) {
        for (const [x, y] of ext(p)) {
          expect(Math.abs(x), sym).toBeLessThanOrEqual(0.5001);
          expect(Math.abs(y), sym).toBeLessThanOrEqual(0.5001);
        }
        if (p.k === "text") expect(p.size, sym).toBeGreaterThanOrEqual(0.28);
      }
    }
  });
  it("draw every symbol differently", () => {
    const seen = new Map<string, string>();
    for (const sym of ELECTRIC_SYMBOLS) {
      const j = JSON.stringify(electricSymbol(sym));
      expect(seen.get(j), `${sym} duplicates ${seen.get(j)}`).toBeUndefined();
      seen.set(j, sym);
    }
  });
  it("wall symbols touch the wall line", () => {
    for (const sym of WALL) {
      const ys = electricSymbol(sym).flatMap((p) => (p.k === "path" ? [...p.d.matchAll(/[ML]\s*-?[\d.]+\s+(-?[\d.]+)/g)].map((m) => Number(m[1])) : ext(p).map((e) => e[1])));
      expect(Math.min(...ys), sym).toBeLessThanOrEqual(-0.4999);
    }
  });
});
