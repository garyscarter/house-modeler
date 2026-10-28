import { describe, expect, it } from "vitest";
import template from "./_template/index";
import type { Room } from "../types";
import { innerAreaM2, isSimplePolygon, lintHouse } from "./lint";
import type { HouseDef } from "./types";

const clone = (): HouseDef => ({ ...template, presets: { ...template.presets }, sitePresets: { ...template.sitePresets } });

const rect = (id: string, x0: number, y0: number, x1: number, y1: number): Room =>
  ({ id, name: id, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] }) as Room;

describe("innerAreaM2", () => {
  // 100 px per metre. A room traced on wall centre lines 4.25 x 3.25 m, one side shared with a neighbour: its walls
  // are three external (0.25 thick) and one partition (0.1), so the inside is (4.25-.125-.05) x (3.25-.125-.125).
  it("shrinks a centre-line rectangle to its inner faces", () => {
    const room = rect("a", 0, 0, 425, 325);
    const next = rect("b", 425, 0, 700, 325);
    expect(innerAreaM2(room, [room, next], 100)).toBeCloseTo(4.075 * 3.0, 3);
  });

  it("uses the external thickness on every side of a lone room", () => {
    const room = rect("a", 0, 0, 400, 300);
    expect(innerAreaM2(room, [room], 100)).toBeCloseTo(3.75 * 2.75, 3);
  });

  it("is the same for a polygon wound the other way", () => {
    const room = rect("a", 0, 0, 400, 300);
    const rev = { ...room, polygon: [...room.polygon].reverse() } as Room;
    expect(innerAreaM2(rev, [rev], 100)).toBeCloseTo(3.75 * 2.75, 3);
  });

  it("lets a correctly traced room pass at the default tolerance", () => {
    const def = clone();
    const base = template.presets[template.main];
    def.presets[def.main] = {
      version: 1,
      build: (img) => {
        const m = base.build(img);
        const f = m.floors[0];
        const r = f.rooms[0];
        const inner = innerAreaM2(r, f.rooms, f.pxPerM);
        r.dims = { w: Math.sqrt(inner), h: Math.sqrt(inner) };
        return m;
      },
    };
    const first = template.presets[template.main].build("").floors[0].rooms[0].name;
    expect(lintHouse(def).filter((m) => m.includes(`"${first}"`) && /inside its walls/.test(m))).toEqual([]);
  });
});

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
});
