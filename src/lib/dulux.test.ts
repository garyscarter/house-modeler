import { describe, expect, it } from "vitest";
import { DULUX_FAMILIES, POPULAR_DULUX, duluxByHex, duluxColours, duluxName, nearestDulux, searchDulux } from "./dulux";

const named = (n: string) => duluxColours().find((c) => c.name === n);

describe("dulux", () => {
  it("loads the whole range with a family each", () => {
    expect(duluxColours().length).toBeGreaterThan(1900);
    for (const c of duluxColours()) expect(DULUX_FAMILIES).toContain(c.family);
  });
  it("classifies known colours", () => {
    expect(["Greys", "Whites"]).toContain(named("Polished Pebble")!.family);
    expect(named("Egyptian Cotton")!.family).toBe("Neutrals");
    expect(named("Sapphire Salute")!.family).toBe("Blues");
    expect(["Neutrals", "Greens"]).toContain(named("Overtly Olive")!.family);
  });
  it("finds exact hex, case-insensitively", () => {
    expect(duluxByHex("#D8D8D7")?.name).toBeTruthy();
    expect(duluxByHex("#010203")).toBeUndefined();
  });
  it("names exact, near and far colours", () => {
    const hit = duluxByHex("#d8d8d7")!;
    expect(duluxName("#d8d8d7")).toBe(hit.name);
    expect(duluxName("#d8d8d8")).toMatch(/^near /);
    expect(duluxName("#00ff00")).toBeUndefined();
    expect(nearestDulux("#d8d8d7").distance).toBe(0);
  });
  it("searches by words and by hex", () => {
    const names = searchDulux("pebble").map((c) => c.name);
    expect(names).toContain("Polished Pebble");
    expect(names).toContain("Pebble Shore");
    expect(searchDulux("soft stone").every((c) => /soft/i.test(c.name) && /stone/i.test(c.name))).toBe(true);
    expect(searchDulux("d8d8d7")).toHaveLength(12);
    expect(searchDulux("#d8d8d7")[0].hex).toBe("#d8d8d7");
    expect(searchDulux("")).toEqual([]);
  });
  it("popular names all exist", () => {
    for (const n of POPULAR_DULUX) expect(named(n), n).toBeDefined();
  });
});
