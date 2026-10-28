import { BUILT_IN_NAME } from "../houses/default";
import { describe, expect, it } from "vitest";
import { costTile, houseTile, planningTile, reviewSubtitle } from "./reviewSummary";
import type { AreaReport, CostEstimate } from "./report";
import type { PlanningCheck } from "./planning";

const areas = (current?: number, proposed?: number): AreaReport => ({ floors: [], current, proposed });
const est = (over: Partial<CostEstimate>): CostEstimate => ({ lines: [], subtotal: 0, contingency: 0, total: 0, missing: [], ...over });
const line = (total?: number) => ({ def: {}, quantity: 1, total }) as unknown as CostEstimate["lines"][number];

describe("reviewSummary", () => {
  it("summarises whole-house area", () => {
    const t = houseTile(areas(100, 127.1));
    expect(t.line).toBe("100.0 m² → 127.1 m²");
    expect(t.delta).toContain("27.1");
    expect(houseTile(areas(100)).delta).toBeUndefined();
    expect(houseTile(areas()).line).toBe("–");
  });
  it("asks for rates when nothing is priced", () => {
    expect(costTile(undefined).kind).toBe("none");
    expect(costTile(est({ lines: [line(undefined)], missing: ["x" as never] })).label).toBe("Add your rates");
  });
  it("shows partial and full totals", () => {
    expect(costTile(est({ lines: [line(10), line(undefined)], missing: ["x" as never], total: 10 })).kind).toBe("partial");
    const full = costTile(est({ lines: [line(1000)], total: 1000 }));
    expect(full.kind).toBe("total");
    expect(full.label).toContain("1,000");
  });
  it("maps planning verdicts to tones", () => {
    const v = (verdict: string) => ({ verdict }) as unknown as PlanningCheck;
    expect(planningTile(v("permission"))).toEqual({ label: "Needs planning permission", tone: "bad" });
    expect(planningTile(v("pd")).tone).toBe("good");
    expect(planningTile(v("prior")).tone).toBe("warn");
    expect(planningTile(undefined).tone).toBe("neutral");
  });
  it("builds the subtitle", () => {
    expect(reviewSubtitle(["current", "proposed"])).toBe(`${BUILT_IN_NAME} · As listed → Proposed`);
    expect(reviewSubtitle(["proposed"])).toBe(`${BUILT_IN_NAME} · Proposed`);
  });
});
