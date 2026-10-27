import { describe, expect, it } from "vitest";
import { litMask, MAX_GLASS_ROOMS, roomSlots } from "./glassGlow";

const ids = (n: number) => Array.from({ length: n }, (_, i) => "r" + i);

describe("roomSlots", () => {
  it("is 1-based and in order", () => {
    const s = roomSlots(["a", "b", "c"]);
    expect([s.get("a"), s.get("b"), s.get("c")]).toEqual([1, 2, 3]);
  });
  it("leaves out ids past 128", () => {
    const s = roomSlots(ids(130));
    expect(s.size).toBe(MAX_GLASS_ROOMS);
    expect(s.get("r127")).toBe(128);
    expect(s.has("r128")).toBe(false);
  });
});

describe("litMask", () => {
  const slots = roomSlots(ids(128));
  it("is all zeros for an empty set", () => {
    expect([...litMask(slots, new Set())]).toEqual([0, 0, 0, 0]);
  });
  it("puts bits 0, 31, 32 and 127 in the right words", () => {
    const m = litMask(slots, new Set(["r0", "r31", "r32", "r127"]));
    expect([...m]).toEqual([(1 | 0x80000000) >>> 0, 1, 0, 0x80000000]);
  });
  it("ignores unknown ids", () => {
    expect([...litMask(slots, new Set(["nope"]))]).toEqual([0, 0, 0, 0]);
  });
  it("reuses and clears `out`", () => {
    const out = new Uint32Array(4);
    expect(litMask(slots, new Set(["r1"]), out)).toBe(out);
    litMask(slots, new Set(["r33"]), out);
    expect([...out]).toEqual([0, 2, 0, 0]);
  });
});
