import { describe, expect, it } from "vitest";
import { byId, wardrobeDoorCount } from "./catalogue";

describe("fitted wardrobes", () => {
  it("gives the shaker style about seven doors across the listing's 3.15 m run", () => {
    expect(byId("wardrobe-shaker")?.symbol).toBe("shaker-wardrobe");
    expect(wardrobeDoorCount("shaker-wardrobe", 3.15)).toBe(7);
  });

  it("keeps the flat-door pitch of the plain fitted wardrobe, and always has a door", () => {
    expect(wardrobeDoorCount("fitted-wardrobe", 2.2)).toBe(4);
    expect(wardrobeDoorCount("shaker-wardrobe", 0.2)).toBe(1);
  });
});
