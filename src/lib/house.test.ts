import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HOUSE_ID, houseList } from "../houses";
import { chooseHouse, currentHouse, pickHouse, resolveHouse, storageSuffix } from "./house";

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

describe("choosing a house when storage is blocked", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reloads on a ?house= query when localStorage throws", () => {
    const assign = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("blocked"); } });
    vi.stubGlobal("location", { href: "https://example.test/app/?x=1", search: "?x=1", assign, reload });
    chooseHouse("my-house");
    expect(reload).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("https://example.test/app/?x=1&house=my-house");
  });

  it("just reloads when the choice was remembered", () => {
    const assign = vi.fn();
    const reload = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem });
    vi.stubGlobal("location", { href: "https://example.test/", search: "", assign, reload });
    chooseHouse("my-house");
    expect(setItem).toHaveBeenCalledWith("storey-house", "my-house");
    expect(reload).toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("reads the query after the meta tag and before localStorage", () => {
    vi.stubGlobal("localStorage", { getItem: () => "_template", setItem: () => undefined });
    vi.stubGlobal("location", { href: "", search: `?house=${DEFAULT_HOUSE_ID}` });
    expect(resolveHouse()).toBe(DEFAULT_HOUSE_ID);
    vi.stubGlobal("document", { querySelector: () => ({ content: "gone" }) });
    expect(resolveHouse()).toBeNull();
    vi.unstubAllGlobals();
  });
});
