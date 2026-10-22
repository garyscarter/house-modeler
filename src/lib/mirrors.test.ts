import { describe, expect, it } from "vitest";
import { byId, mountOf } from "./catalogue";

describe("mirrors and mount height", () => {
  it("has the mirror items, wall-hung in Bathroom", () => {
    for (const id of ["mirror", "mirror-round", "mirror-cabinet", "mirror-lit"]) {
      const it = byId(id)!;
      expect(it.category).toBe("Bathroom");
      expect(it.mount).toBeGreaterThan(0.8);
    }
  });
  it("mountOf prefers the fixture override, then the catalogue, then the floor", () => {
    expect(mountOf({}, { mount: 1.1 })).toBe(1.1);
    expect(mountOf({ mount: 1.4 }, { mount: 1.1 })).toBe(1.4);
    expect(mountOf({ mount: 0 }, { mount: 1.1 })).toBe(0);
    expect(mountOf({}, {})).toBe(0);
    expect(mountOf({ mount: -2 }, { mount: 1.1 })).toBe(0);
    expect(mountOf({ mount: NaN }, { mount: 1.1 })).toBe(1.1);
  });
});
