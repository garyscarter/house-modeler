import { describe, expect, it } from "vitest";
import { DEFAULT_HOUSE_ID, houseList } from "../houses";
import { currentHouse, pickHouse, storageSuffix } from "./house";

describe("pickHouse", () => {
  const ids = ["a-house", "b-house"];
  it("lets the server's meta tag win", () => {
    expect(pickHouse({ meta: "b-house", stored: "a-house", ids })).toBe("b-house");
  });
  it("falls back to the remembered choice", () => {
    expect(pickHouse({ meta: null, stored: "a-house", ids })).toBe("a-house");
  });
  it("ignores ids that are not in the build", () => {
    expect(pickHouse({ meta: null, stored: "also-gone", ids })).toBeNull();
    expect(pickHouse({ meta: null, stored: "gone", ids: ["only"] })).toBe("only");
  });
  it("opens no house when the meta tag names one this build lacks, whatever else is there", () => {
    expect(pickHouse({ meta: "gone", stored: "a-house", ids })).toBeNull();
    expect(pickHouse({ meta: "gone", stored: null, ids: ["only"] })).toBeNull();
  });
  it("opens the only house, and asks when there are several", () => {
    expect(pickHouse({ ids: ["only"] })).toBe("only");
    expect(pickHouse({ ids })).toBeNull();
    expect(pickHouse({ ids: [] })).toBeNull();
  });
});

describe("storageSuffix", () => {
  it("keeps the default house's keys and suffixes any other", () => {
    expect(storageSuffix(DEFAULT_HOUSE_ID)).toBe("");
    expect(storageSuffix(null)).toBe("");
    expect(storageSuffix("my-house")).toBe("/my-house");
  });
});

describe("the registry", () => {
  it("lists the default house first and loads it (the test setup did)", () => {
    expect(houseList()[0].id).toBe(DEFAULT_HOUSE_ID);
    expect(currentHouse().id).toBe(DEFAULT_HOUSE_ID);
    expect(currentHouse().presets[currentHouse().main]).toBeTruthy();
  });
});
