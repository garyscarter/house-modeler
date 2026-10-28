import { describe, expect, it } from "vitest";
import template from "./_template/index";
import { areaSummary } from "../lib/report";
import { isSimplePolygon, lintHouse } from "./lint";
import type { HouseDef } from "./types";

const clone = (): HouseDef => ({ ...template, presets: { ...template.presets }, sitePresets: { ...template.sitePresets } });

describe("lintHouse", () => {
  it("passes the template", () => {
    expect(lintHouse(template)).toEqual([]);
  });

  it("detects self-crossing polygons", () => {
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }])).toBe(true);
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }])).toBe(false);
  });

  it("flags a bad room, opening, size, and plot", () => {
    const def = clone();
    const base = template.presets[template.main];
    def.presets[def.main] = {
      version: 1,
      build: (img) => {
        const m = base.build(img);
        const f = m.floors[0];
        f.pxPerM = 0;
        f.rooms[0].polygon = f.rooms[0].polygon.slice(0, 2);
        f.openings.push({ ...f.openings[0], x: 5, y: 5 });
        return m;
      },
    };
    const msgs = lintHouse(def);
    expect(msgs.join("\n")).toMatch(/pxPerM/);
    expect(msgs.join("\n")).toMatch(/fewer than 3/);
  });

  it("flags openings off the walls and sizes that disagree with the polygon", () => {
    const def = clone();
    const base = template.presets[template.main];
    def.presets[def.main] = {
      version: 1,
      build: (img) => {
        const m = base.build(img);
        m.floors[0].openings.push({ ...m.floors[0].openings[0], x: 5, y: 5 });
        m.floors[0].rooms[0].dims = { w: 9, h: 9 };
        return m;
      },
    };
    const msgs = lintHouse(def).join("\n");
    expect(msgs).toMatch(/not on a room edge/);
    expect(msgs).toMatch(/printed size/);
  });

  it("flags a thin plot, and postcodes and street addresses anywhere in the data", () => {
    const def = clone();
    def.name = "12 Elm Road";
    def.sitePresets = {
      [def.site]: {
        version: 1,
        build: () => ({ ...template.sitePresets[template.site].build(), boundary: [{ x: 0, y: 0 }, { x: 1, y: 1 }], latitude: NaN, tiles: "AB1 2CD" }) as never,
      },
    };
    const msgs = lintHouse(def).join("\n");
    expect(msgs).toMatch(/3 or more corners/);
    expect(msgs).toMatch(/latitude/);
    expect(msgs).toMatch(/postcode/);
    expect(msgs).toMatch(/street address/);
  });

  it("does not mistake colour values for postcodes, and still catches a real-looking one", () => {
    const site = (tiles: string, accent: string) => ({
      version: 1,
      build: () => ({ ...template.sitePresets[template.site].build(), tiles, accent }) as never,
    });
    const withStrings = (tiles: string, accent: string) => ({ ...clone(), sitePresets: { [template.site]: site(tiles, accent) } });
    expect(lintHouse(withStrings("#F4F1EA", "#B5A4CC")).join("\n")).not.toMatch(/postcode/);
    expect(lintHouse(withStrings("#F4F1EA", "AB1 2CD")).join("\n")).toMatch(/postcode/);
  });

  const withMain = (edit: (m: ReturnType<(typeof template.presets)[string]["build"]>) => void): HouseDef => {
    const def = clone();
    const base = template.presets[template.main];
    def.presets[def.main] = { version: 1, build: (img) => { const m = base.build(img); edit(m); return m; } };
    return def;
  };

  it("takes per-room dims exceptions, and flags stale or reasonless ones", () => {
    const name = template.presets[template.main].build("").floors[0].rooms[0].name;
    const off = (m: ReturnType<(typeof template.presets)[string]["build"]>) => { m.floors[0].rooms[0].dims = { w: 9, h: 9 }; };
    expect(lintHouse(withMain(off)).join("\n")).toMatch(/printed size/);
    expect(lintHouse(withMain(off), { dimsExceptions: { [name]: "traced to the plan" } }).join("\n")).not.toMatch(/printed size/);
    expect(lintHouse(withMain(off), { dimsExceptions: { [name]: " " } }).join("\n")).toMatch(/needs a reason/);
    expect(lintHouse(withMain(() => {}), { dimsExceptions: { Nowhere: "x" } }).join("\n")).toMatch(/not a room/);
    expect(lintHouse(withMain((m) => { m.floors[0].rooms[0].dims = undefined; }), { dimsExceptions: { [name]: "x" } }).join("\n")).toMatch(/not needed/);
  });

  it("checks the internal area against the listed area in both directions", () => {
    const internal = areaSummary(template.presets[template.main].build("")).internal;
    expect(lintHouse(withMain((m) => { m.listedArea = internal * 1.02; })).join("\n")).not.toMatch(/listing says/);
    for (const k of [1.05, 0.95]) {
      const msg = lintHouse(withMain((m) => { m.listedArea = internal * k; })).join("\n");
      expect(msg).toMatch(/listing says/);
      expect(msg).toMatch(/scale is probably wrong/);
    }
  });
});
