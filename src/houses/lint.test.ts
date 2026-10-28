import { describe, expect, it } from "vitest";
import template from "./_template/index";
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

  it("flags a bad room, opening, size, plot and photo place", () => {
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
    const msgs = lintHouse(def, { photoPlaces: { a: { floor: "Nowhere", room: "x" }, b: { floor: "Ground Floor", room: "Cellar" } } });
    expect(msgs.join("\n")).toMatch(/pxPerM/);
    expect(msgs.join("\n")).toMatch(/fewer than 3/);
    expect(msgs.join("\n")).toMatch(/no floor named "Nowhere"/);
    expect(msgs.join("\n")).toMatch(/no room "Cellar"/);
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
});
