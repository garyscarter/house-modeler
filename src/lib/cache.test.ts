import { describe, expect, it } from "vitest";
import { overflow } from "./cache";

const heavy = (k: string) => k.startsWith("h");

describe("overflow", () => {
  it("keeps a cache within both caps", () => {
    expect(overflow(["a", "b"], 4, heavy, 2)).toEqual([]);
  });

  it("drops the oldest heavy entries first", () => {
    expect(overflow(["h1", "a", "h2", "h3"], 10, heavy, 2)).toEqual(["h1"]);
  });

  it("drops the oldest entries when over the overall cap", () => {
    expect(overflow(["a", "b", "c", "d"], 2, heavy, 2)).toEqual(["a", "b"]);
  });

  it("counts heavy drops towards the overall cap", () => {
    expect(overflow(["a", "h1", "h2", "b"], 3, heavy, 1)).toEqual(["h1"]);
    expect(overflow(["a", "h1", "h2", "b"], 2, heavy, 1)).toEqual(["h1", "a"]);
  });
});
