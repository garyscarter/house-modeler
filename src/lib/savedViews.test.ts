import { describe, expect, it } from "vitest";
import { cleanViewName, makeSavedView, nextViewName, parseSavedViews, shotTargets, viewsCoverAll } from "./savedViews";
import type { VariantKey } from "../types";

const pose = { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 1, z: 0 } };
const good = (id: string, over: object = {}) => ({ id, name: "A", ...pose, maxLevel: 1, ...over });

describe("naming", () => {
  it("fills the first gap", () => {
    expect(nextViewName([])).toBe("View 1");
    expect(nextViewName([{ name: "View 1" }, { name: "View 3" }])).toBe("View 2");
  });
  it("cleans names", () => {
    expect(cleanViewName("  Kitchen   from \n the garden ", "x")).toBe("Kitchen from the garden");
    expect(cleanViewName("   ", "View 4")).toBe("View 4");
    expect(cleanViewName("a".repeat(100), "x")).toHaveLength(60);
  });
  it("makes a view with a copy of the pose", () => {
    const v = makeSavedView(pose, "N", null, "id1");
    expect(v).toEqual({ id: "id1", name: "N", ...pose, maxLevel: null });
    expect(v.position).not.toBe(pose.position);
  });
});

describe("parseSavedViews", () => {
  it("returns undefined for non-arrays", () => {
    expect(parseSavedViews(undefined)).toBeUndefined();
    expect(parseSavedViews({})).toBeUndefined();
  });
  it("keeps good views and drops junk", () => {
    const out = parseSavedViews([
      good("a"),
      good("a", { name: "dup" }),
      good("b", { position: { x: NaN, y: 0, z: 0 } }),
      good("c", { position: pose.target }),
      good("d", { name: "  " }),
      { ...pose, name: "no id" },
      null,
      good("e", { maxLevel: "x" }),
    ])!;
    expect(out.map((v) => v.id)).toEqual(["a", "e"]);
    expect(out[1].maxLevel).toBeNull();
  });
  it("caps at 50", () => {
    expect(parseSavedViews(Array.from({ length: 80 }, (_, i) => good(`v${i}`)))).toHaveLength(50);
  });
});

describe("shotTargets", () => {
  const both: VariantKey[] = ["current", "proposed"];
  it("side by side uses each layout's viewer", () => {
    const t = shotTargets(["current", "proposed"], both, "current");
    expect(t).toEqual([{ variant: "current", id: "current" }, { variant: "proposed", id: "proposed" }]);
    expect(viewsCoverAll(t, both)).toBe(true);
  });
  it("wipe uses the wipe viewers", () => {
    expect(shotTargets(["wipe-current", "wipe-proposed"], both, "proposed").map((x) => x.id)).toEqual(["wipe-current", "wipe-proposed"]);
  });
  it("single covers only the active layout", () => {
    const t = shotTargets(["main"], both, "proposed");
    expect(t).toEqual([{ variant: "proposed", id: "main" }]);
    expect(viewsCoverAll(t, both)).toBe(false);
    expect(viewsCoverAll(t, ["proposed"])).toBe(true);
  });
  it("nothing without viewers", () => {
    expect(shotTargets([], both, "current")).toEqual([]);
  });
});
