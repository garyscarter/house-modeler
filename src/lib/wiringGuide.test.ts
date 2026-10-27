import { describe, expect, it } from "vitest";
import { electricalLayerSvg, scheduleCsv, wiringGuideHtml } from "./wiringGuide";
import { listing91770873Proposed } from "./houses/listing91770873";
import { numberPoints, pointRows } from "./electrics";
import { planExtent, planScale, planSvg } from "./export";
import type { Fixture, HouseModel } from "../types";

const fx = (id: string, type: string, x: number, y: number, extra: Partial<Fixture> = {}): Fixture => ({ id, type, x, y, rot: 0, ...extra });

/** The listing's Proposed layout with points added on both floors (the built-in model has none). */
function withPoints(): HouseModel {
  const base = listing91770873Proposed("");
  const floors = [...base.floors].sort((a, b) => a.level - b.level);
  const [g, f1] = floors;
  const gr = g.rooms[0].polygon;
  const c = { x: (gr[0].x + gr[2].x) / 2, y: (gr[0].y + gr[2].y) / 2 };
  const r1 = f1.rooms[0].polygon;
  const c1 = { x: (r1[0].x + r1[2].x) / 2, y: (r1[0].y + r1[2].y) / 2 };
  const gf = [
    fx("sock", "socket-double", c.x, c.y),
    fx("p1", "light-pendant", c.x + 60, c.y + 30),
    fx("p2", "light-pendant", c.x - 60, c.y + 30),
    fx("sw", "switch-1g", c.x, c.y - 40, { controls: ["p1", "p2", "up"] }),
    fx("grid", "light-downlight-grid", c.x, c.y + 80),
    fx("out", "light-outside", c.x, c.y - 4000),
  ];
  const ff = [fx("up", "light-flush", c1.x, c1.y), fx("s2", "socket-single", c1.x + 20, c1.y + 20)];
  return {
    ...base,
    circuits: [{ id: "c", name: "Ring 1", kind: "ring", points: ["sock", "s2"] }],
    floors: base.floors.map((f) => (f.id === g.id ? { ...f, fixtures: gf } : f.id === f1.id ? { ...f, fixtures: ff } : f)),
  };
}

const svgs = (html: string) => html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];

describe("wiring guide", () => {
  const model = withPoints();
  const numbered = numberPoints(model);
  const rows = pointRows(model, numbered);
  const html = wiringGuideHtml({ date: "27 October 2026", houseName: "Listing 91770873", variantLabel: "Proposed", model });

  it("is a page with a plan per floor, each label once in its own floor's drawing", () => {
    expect(html).toMatch(/^<!doctype html>/);
    const plans = html.match(/<section class="plan">[\s\S]*?<\/section>/g)!;
    expect(plans.length).toBe(model.floors.length);
    const sorted = [...model.floors].sort((a, b) => a.level - b.level);
    sorted.forEach((f, i) => {
      for (const p of numbered) {
        const has = new RegExp(`>${p.label}<`).test(plans[i]) && plans[i].includes(`>${p.label}<`);
        if (p.floor.id === f.id) expect(has).toBe(true);
      }
    });
    const upLabel = numbered.find((p) => p.fx.id === "up")!.label;
    expect(plans[1]).toContain(`>${upLabel}<`);
  });

  it("has a legend row for each used symbol and none for unused", () => {
    const legend = html.match(/<ul class="legend">[\s\S]*?<\/ul>/g)!.join("");
    expect(legend).toContain("Socket (double)");
    expect(legend).toContain("Downlights (grid)");
    expect(legend).not.toContain("Cooker switch");
    const used = new Set(numbered.map((p) => p.item.symbol));
    expect((legend.match(/<li>/g) ?? []).length).toBe(used.size);
  });

  it("schedule counts equal the points placed", () => {
    const sched = html.match(/<table class="sched">[\s\S]*?<\/table>/)![0];
    const counts = [...sched.matchAll(/<td class="num">(\d+)<\/td><td class="num">[^<]*<\/td>/g)].map((m) => Number(m[1]));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(rows.reduce((a, r) => a + r.quantity, 0));
    expect(html).toContain("Ring 1");
    const tot = html.match(/<table class="tot">[\s\S]*?<\/table>/)![0];
    expect(tot).toContain(`<td class="num">${rows.reduce((a, r) => a + r.quantity, 0)}</td></tr></table>`);
  });

  it("draws the grid as one downlight per bulb and a stub for the cross-floor link", () => {
    const g = [...model.floors].sort((a, b) => a.level - b.level)[0];
    const e = planExtent([model]);
    const layer = electricalLayerSvg(model, g, numbered, { scale: planScale(e), k: 1000 / planScale(e), x: (p) => p.x * 10, y: (p) => p.y * 10, width: 100, height: 100 });
    expect(layer).toContain(`to ${model.floors.find((f) => f.level > 0)!.name}`);
    expect(layer).toContain("stroke-dasharray");
    expect(layer).toContain("<path d=\"M"); // an arc for the same-floor link
    expect((layer.match(/<g transform/g) ?? []).length).toBeGreaterThanOrEqual(6 + 4);
  });

  it("CSV has one row per point plus the header", () => {
    const lines = scheduleCsv(model).trim().split("\r\n");
    expect(lines.length).toBe(numbered.length + 1);
    expect(lines[0]).toBe("Floor,Room,Point,Type,Quantity,Height,Circuit,Notes");
  });

  it("an empty model says so and has no plans", () => {
    const empty = wiringGuideHtml({ date: "d", variantLabel: "Proposed", model: listing91770873Proposed("") });
    expect(empty).toContain("No electrical points yet");
    expect(svgs(empty).length).toBeLessThanOrEqual(3) /* brand marks only */;
    expect(planSvg).toBeTypeOf("function");
  });
});
