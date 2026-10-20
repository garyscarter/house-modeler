import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { listing91770873, listing91770873Proposed, listingSite } from "./houses/listing91770873";
import { hasOwnSite, siteOf } from "./sites";

const st = () => useStore.getState();

describe("store: a plot per layout", () => {
  beforeEach(() => {
    useStore.setState({ variants: {}, sites: {}, photos: [], past: [], future: [], activeVariant: "current" });
  });

  it("copies the plot with Copy As listed to start, then keeps the two apart", () => {
    st().setVariant("current", listing91770873(""));
    st().setSite(listingSite());
    st().copyVariant("current", "proposed");
    expect(st().sites.proposed).toEqual(st().sites.current);
    expect(st().sites.proposed).not.toBe(st().sites.current);

    st().setUi({ activeVariant: "proposed" });
    st().updateSite((s) => ({ ...s, boundary: s.boundary.map((p, i) => (i === 5 ? { ...p, x: p.x + 1.2 } : p)) }));
    expect(siteOf(st().sites, "proposed")!.boundary[5].x).toBeCloseTo(-0.65);
    expect(siteOf(st().sites, "current")!.boundary[5].x).toBeCloseTo(-1.85);

    // Reset to a copy of As listed brings Proposed's plot back too.
    st().copyVariant("current", "proposed");
    expect(siteOf(st().sites, "proposed")!.boundary[5].x).toBeCloseTo(-1.85);
  });

  it("lets Proposed borrow As listed's plot and copies it on the first edit", () => {
    st().setVariant("current", listing91770873(""));
    st().setVariant("proposed", listing91770873Proposed(""));
    st().setSite(listingSite(), "current");
    expect(hasOwnSite(st().sites, "proposed")).toBe(false);
    expect(siteOf(st().sites, "proposed")).toBe(st().sites.current);

    st().updateSite({ frontBearing: 170 }, "proposed");
    expect(hasOwnSite(st().sites, "proposed")).toBe(true);
    expect(st().sites.proposed!.frontBearing).toBe(170);
    expect(st().sites.current!.frontBearing).toBe(162);
  });

  it("undoes a plot edit", () => {
    st().setSite(listingSite(), "current");
    const before = st().sites;
    // Edits close together collapse into one undo step; make this one separate.
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
    st().setSite(undefined, "current");
    now.mockRestore();
    expect(st().sites.current).toBeUndefined();
    st().undo();
    expect(st().sites).toBe(before);
  });
});
