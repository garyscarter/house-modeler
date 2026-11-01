import { describe, expect, it } from "vitest";
import { DPR, dprFor, qualityChoices, resolveQuality } from "./quality";

describe("resolveQuality", () => {
  it("auto is high on desktop and balanced on tablet and phone", () => {
    expect(resolveQuality("auto", "desktop")).toBe("high");
    expect(resolveQuality("auto", "tablet")).toBe("balanced");
    expect(resolveQuality("auto", "phone")).toBe("balanced");
  });
  it("an explicit setting wins on every chassis", () => {
    for (const c of ["desktop", "tablet", "phone"] as const) {
      expect(resolveQuality("high", c)).toBe("high");
      expect(resolveQuality("balanced", c)).toBe("balanced");
      expect(resolveQuality("low", c)).toBe("low");
    }
  });
  it("a missing setting counts as auto", () => expect(resolveQuality(undefined, "desktop")).toBe("high"));
});

describe("DPR", () => {
  it("steps down with quality", () => {
    expect(DPR.high).toEqual([1, 1.5]);
    expect(DPR.balanced).toEqual([1, 1.25]);
    expect(DPR.low).toEqual([1, 1]);
  });
});

describe("dprFor", () => {
  it("is the table, capped by maxDpr", () => {
    expect(dprFor("high")).toEqual([1, 1.5]);
    expect(dprFor("high", 1)).toEqual([1, 1]);
    expect(dprFor("balanced", 2)).toEqual([1, 1.25]);
    expect(dprFor("low", 1)).toEqual([1, 1]);
  });
});

describe("qualityChoices", () => {
  it("offers Auto and Low on a phone, all four elsewhere", () => {
    expect(qualityChoices("phone")).toEqual(["auto", "low"]);
    expect(qualityChoices("tablet")).toEqual(["auto", "high", "balanced", "low"]);
    expect(qualityChoices("desktop")).toHaveLength(4);
  });
});
