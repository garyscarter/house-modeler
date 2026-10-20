import { describe, expect, it } from "vitest";
import type { HouseModel, Site } from "../types";
import { listingSite } from "./houses/listing91770873";
import { copySiteOf, hasOwnSite, setSiteOf, siteOf, sitesFromImport, sitesFromShared, siteSource, updateSiteOf, type Sites } from "./sites";

const model = {} as HouseModel;
const plot = (frontBearing = 180): Site => ({ frontBearing, latitude: 51, longitude: -2, boundary: [], neighbours: [], surfaces: [] });

describe("each layout's plot", () => {
  it("lets Proposed borrow As listed's plot until it has its own", () => {
    const current = plot();
    const sites: Sites = { current };
    expect(siteOf(sites, "current")).toBe(current);
    expect(siteOf(sites, "proposed")).toBe(current);
    expect(siteSource(sites, "proposed")).toBe("current");
    expect(hasOwnSite(sites, "proposed")).toBe(false);
    // As listed never borrows Proposed's.
    expect(siteOf({ proposed: current }, "current")).toBeUndefined();
  });

  it("copies on the first edit to Proposed, leaving As listed's plot alone", () => {
    const current = listingSite();
    const sites: Sites = { current };
    const next = updateSiteOf(sites, "proposed", (s) => ({ ...s, boundary: s.boundary.map((p, i) => (i === 6 ? { ...p, x: p.x + 1.2 } : p)) }));
    expect(hasOwnSite(next, "proposed")).toBe(true);
    expect(next.current).toBe(current);
    expect(current.boundary[6].x).toBeCloseTo(-1.85);
    expect(next.proposed!.boundary[6].x).toBeCloseTo(-0.65);
    // The copy shares nothing with As listed's, so a later in-place change can't leak across.
    expect(next.proposed!.surfaces[0]).not.toBe(current.surfaces[0]);
    // A second edit works on Proposed's own plot.
    const again = updateSiteOf(next, "proposed", { frontBearing: 170 });
    expect(again.proposed!.frontBearing).toBe(170);
    expect(again.current!.frontBearing).toBe(162);
  });

  it("does nothing when there is no plot to edit", () => {
    const sites: Sites = {};
    expect(updateSiteOf(sites, "proposed", { frontBearing: 1 })).toBe(sites);
  });

  it("clearing Proposed's plot leaves it with none rather than As listed's", () => {
    const sites: Sites = { current: plot(), proposed: plot(170) };
    const cleared = setSiteOf(sites, "proposed", undefined);
    expect(cleared.proposed).toBeNull();
    expect(siteOf(cleared, "proposed")).toBeUndefined();
    expect(siteSource(cleared, "proposed")).toBeUndefined();
    // Without an As listed plot there is nothing to hide, so the entry just goes.
    expect(setSiteOf({ proposed: plot() }, "proposed", undefined)).toEqual({});
    expect(setSiteOf(sites, "current", undefined)).toEqual({ proposed: sites.proposed });
  });

  it("copies As listed's plot onto Proposed (Copy As listed to start, Reset to a copy)", () => {
    const sites: Sites = { current: plot(162), proposed: plot(90) };
    const next = copySiteOf(sites, "current", "proposed");
    expect(next.proposed).toEqual(sites.current);
    expect(next.proposed).not.toBe(sites.current);
    expect(copySiteOf({ proposed: plot() }, "current", "proposed")).toEqual({});
  });
});

describe("the old shared plot", () => {
  it("gives every layout that exists its own copy", () => {
    const site = listingSite();
    const both = sitesFromShared(site, { current: model, proposed: model });
    expect(both.current).toEqual(site);
    expect(both.proposed).toEqual(site);
    expect(both.current).not.toBe(both.proposed);
    expect(sitesFromShared(site, { proposed: model })).toEqual({ proposed: site });
    // With no layouts the plot still isn't lost.
    expect(sitesFromShared(site, {})).toEqual({ current: site });
    expect(sitesFromShared(undefined, { current: model })).toEqual({});
  });

  it("imports old JSON exports (one `site`) the same way, and new ones (`sites`) as they are", () => {
    const site = listingSite();
    const old = JSON.parse(JSON.stringify({ variants: { current: model, proposed: model }, site }));
    const fromOld = sitesFromImport(old);
    expect(fromOld.current).toEqual(site);
    expect(fromOld.proposed).toEqual(site);
    const fresh = sitesFromImport({ sites: { current: site, proposed: null }, variants: { current: model, proposed: model } });
    expect(fresh).toEqual({ current: site, proposed: null });
    expect(sitesFromImport({ sites: { current: { junk: true } } })).toEqual({});
    expect(sitesFromImport({ variants: { current: model } })).toEqual({});
  });
});
