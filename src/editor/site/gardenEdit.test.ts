import { describe, expect, it } from "vitest";
import type { GardenItem, Site } from "../../types";
import { angleToward, closesPolygon, fromLocal, gardenClipboard, newItem, pasteItems, removeItems, resizeKind, resizePatch, rotateItems, snapRot, toLocal } from "./gardenEdit";
import { gardenDef } from "../../lib/gardenCatalogue";

const site = (items: GardenItem[]): Site => ({ boundary: [], surfaces: [], neighbours: [], frontBearing: 0, latitude: 0, longitude: 0, items }) as unknown as Site;
const mk = (p: Partial<GardenItem> = {}): GardenItem => ({ id: "a", type: "dining-6", x: 1, y: 1, rot: 0, ...p });

describe("gardenEdit", () => {
  it("angles run clockwise from up", () => {
    expect(angleToward({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe(0);
    expect(angleToward({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
    expect(angleToward({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(180);
    expect(angleToward({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(270);
  });
  it("snaps turns to 15 degrees unless free", () => {
    expect(snapRot(97)).toBe(90);
    expect(snapRot(98)).toBe(105);
    expect(snapRot(98, true)).toBe(98);
    expect(snapRot(-15)).toBe(345);
  });
  it("local and world frames invert each other", () => {
    const item = mk({ rot: 30, x: 2, y: 3 });
    const l = toLocal(item, fromLocal(item, { x: 0.7, y: -0.4 }));
    expect(l.x).toBeCloseTo(0.7);
    expect(l.y).toBeCloseTo(-0.4);
  });
  it("rotates by 15 and skips runs", () => {
    const s = rotateItems(site([mk(), mk({ id: "r", type: "hedge", to: { x: 3, y: 1 } })]), ["a", "r"], 15);
    expect(s.items![0].rot).toBe(15);
    expect(s.items![1].rot).toBe(0);
    expect(rotateItems(s, ["a"], -30).items![0].rot).toBe(345);
  });
  it("makes runs with a second end", () => {
    const hedge = newItem(gardenDef("hedge")!, { x: 1, y: 2 });
    expect(hedge.to).toEqual({ x: 4, y: 2 });
    expect(newItem(gardenDef("dining-6")!, { x: 1, y: 2 }, 45).rot).toBe(45);
    expect(newItem(gardenDef("festoon")!, { x: 0, y: 0 }, 0, { x: 5, y: 0 }).to).toEqual({ x: 5, y: 0 });
  });
  it("resizes on 5 cm steps", () => {
    expect(resizePatch(mk(), "w", { x: 1.01, y: 0 })).toMatchObject({ w: 2 });
    expect(resizePatch(mk(), "spread", { x: 0.6, y: 0 })).toEqual({ w: 1.2, d: 1.2 });
    expect(resizeKind(mk())).toBe("rect");
    expect(resizeKind(mk({ type: "apple-tree" }))).toBe("spread");
    expect(resizeKind(mk({ type: "festoon", to: { x: 2, y: 2 } }))).toBe("none");
  });
  it("pastes copies with new ids, offset", () => {
    gardenClipboard.set([mk({ id: "z", to: undefined })]);
    const r = pasteItems(site([]), gardenClipboard.get());
    expect(r.site.items).toHaveLength(1);
    expect(r.ids[0]).not.toBe("z");
    expect(r.site.items![0].x).toBeCloseTo(1.5);
    expect(removeItems(r.site, r.ids).items).toEqual([]);
  });
  it("closes a polygon on its first or last point", () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];
    expect(closesPolygon(pts, { x: 0.1, y: 0.1 }, 0.3)).toBe(true);
    expect(closesPolygon(pts, { x: 4.1, y: 3 }, 0.3)).toBe(true);
    expect(closesPolygon(pts, { x: 2, y: 2 }, 0.3)).toBe(false);
    expect(closesPolygon(pts.slice(0, 2), { x: 0, y: 0 }, 0.3)).toBe(false);
  });
});
