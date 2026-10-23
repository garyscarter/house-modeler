import { describe, expect, it } from "vitest";
import { decideStartupPrompt, describeUpdate, notNowRemembers, readRemembered, remember } from "./startupPrompt";

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
  it("never offers to replace a Proposed that is an old copy of As listed (still tagged as As listed), but offers to review its updates", () => {
    expect(decideStartupPrompt({ current: m("a", 4), proposed: m("a", 4) }, REG, "a", {})).toEqual({ kind: "update", version: 5, variants: ["current"], review: 5 });
    expect(decideStartupPrompt({ current: m("a", 5), proposed: m("a", 4) }, REG, "a", {})).toEqual({ kind: "update", version: 0, variants: [], review: 5 });
    expect(decideStartupPrompt({ current: m("a", 4), proposed: m("a", 4) }, REG, "a", { review: 5 })).toEqual({ kind: "update", version: 5, variants: ["current"] });
    expect(decideStartupPrompt({ current: m("a", 5), proposed: m("a", 4) }, REG, "a", { review: 5 })).toBeNull();
  });
  it("offers the review by the version a design is based on, and stops once it has been brought up to date", () => {
    const design = (v: number) => ({ basedOn: { id: "a", version: v } });
    expect(decideStartupPrompt({ current: m("a", 5), proposed: design(3) }, REG, "a", {})).toEqual({ kind: "update", version: 0, variants: [], review: 5 });
    expect(decideStartupPrompt({ current: m("a", 5), proposed: design(5) }, REG, "a", {})).toBeNull();
    // An old copy still tagged as As listed, reviewed since: its basedOn wins.
    expect(decideStartupPrompt({ current: m("a", 5), proposed: { ...m("a", 2), ...design(5) } }, REG, "a", {})).toBeNull();
    // The built-in Proposed (another preset) is updated, not reviewed; a design based on something else is left alone.
    expect(decideStartupPrompt({ current: m("a", 5), proposed: { ...m("b", 4), basedOn: { id: "a", version: 1 } } }, REG, "a", {})).toEqual({ kind: "update", version: 5, variants: ["proposed"] });
    expect(decideStartupPrompt({ current: m("a", 5), proposed: { basedOn: { id: "zzz", version: 1 } } }, REG, "a", {})).toBeNull();
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
    remember("review", 6, s);
    expect(readRemembered(s)).toEqual({ load: 3, update: 4, site: 2, review: 6 });
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

describe("describeUpdate with a Proposed review on offer", () => {
  it("asks only about the review when nothing else is out of date", () => {
    const p = { kind: "update" as const, version: 0, variants: [], review: 5 };
    const d = describeUpdate(p);
    expect(d.choices.map((c) => c.label)).toEqual(["Review updates for my Proposed", "Not now"]);
    expect(d.choices[0].plan).toEqual({ layouts: [], sites: [], review: true, remember: [] });
    expect(d.message).toContain("never replaced");
    expect(notNowRemembers(p)).toEqual(["review"]);
  });
  it("adds an update-and-review choice after Update; Keep mine declines both", () => {
    const p = { kind: "update" as const, version: 5, variants: ["current" as const], review: 5 };
    const d = describeUpdate(p);
    expect(d.choices.map((c) => c.label)).toEqual(["Update", "Update, and review updates for my Proposed", "Keep mine"]);
    expect(d.choices[0].plan).toEqual({ layouts: ["current"], sites: [], remember: [] });
    expect(d.choices[1].plan).toEqual({ layouts: ["current"], sites: [], review: true, remember: [] });
    expect(d.choices[2].plan).toBeNull();
    expect(d.message).toMatch(/You can undo it\.$/);
    expect(notNowRemembers(p)).toEqual(["update", "review"]);
  });
  it("pairs the review with the update that keeps the owner's plot edits", () => {
    const d = describeUpdate({ kind: "update", version: 5, variants: ["current"], site: { version: 3, current: true, proposed: "own" }, review: 5 });
    expect(d.choices.map((c) => c.label)).toEqual([
      "Update",
      "Update, and only the plot's boundaries and neighbours (keep my plot edits)",
      "Update, keep my plot edits, and review updates for my Proposed",
      "Update, and Proposed's plot too (your plot edits there are lost)",
      "Not now",
    ]);
    expect(d.choices[2].plan).toEqual({ ...d.choices[1].plan, review: true });
  });
});
