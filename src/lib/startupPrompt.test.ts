import { describe, expect, it } from "vitest";
import { decideStartupPrompt, readRemembered, remember } from "./startupPrompt";

const REG = { a: { version: 5 }, b: { version: 5 } };
const m = (id?: string, version = 5) => ({ preset: id ? { id, version } : undefined });

describe("decideStartupPrompt", () => {
  it("offers to load when there is no As listed", () => {
    expect(decideStartupPrompt({}, REG, "a", {})).toEqual({ kind: "load", version: 5, withProposed: true });
  });
  it("leaves out the extension when a Proposed layout already exists", () => {
    expect(decideStartupPrompt({ proposed: m() }, REG, "a", {})).toEqual({ kind: "load", version: 5, withProposed: false });
  });
  it("stays quiet once the load prompt was declined for this version, and asks again for a newer one", () => {
    expect(decideStartupPrompt({}, REG, "a", { load: 5 })).toBeNull();
    expect(decideStartupPrompt({}, { a: { version: 6 } }, "a", { load: 5 })).not.toBeNull();
  });
  it("offers an update for an out-of-date built-in variant", () => {
    expect(decideStartupPrompt({ current: m("a", 4), proposed: m("b", 5) }, REG, "a", {})).toEqual({ kind: "update", version: 5, variants: ["current"] });
  });
  it("never touches a variant without a preset", () => {
    expect(decideStartupPrompt({ current: m("a", 5), proposed: m() }, REG, "a", {})).toBeNull();
  });
  it("ignores presets the registry does not know", () => {
    expect(decideStartupPrompt({ current: m("zzz", 1) }, REG, "a", {})).toBeNull();
  });
  it("is silent when up to date, or after keeping mine for this version", () => {
    expect(decideStartupPrompt({ current: m("a", 5) }, REG, "a", {})).toBeNull();
    expect(decideStartupPrompt({ current: m("a", 4) }, REG, "a", { update: 5 })).toBeNull();
    expect(decideStartupPrompt({ current: m("a", 4) }, { a: { version: 6 } }, "a", { update: 5 })).not.toBeNull();
  });
});

describe("remembered answers", () => {
  const fake = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  it("round-trips and keeps the other kind", () => {
    const s = fake();
    remember("load", 3, s);
    remember("update", 4, s);
    remember("site", 2, s);
    expect(readRemembered(s)).toEqual({ load: 3, update: 4, site: 2 });
  });
  it("survives junk and throwing storage", () => {
    const junk = { getItem: () => "{nope" };
    expect(readRemembered(junk)).toEqual({});
    const boom = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
    };
    expect(readRemembered(boom)).toEqual({});
    expect(() => remember("load", 1, boom)).not.toThrow();
  });
});
