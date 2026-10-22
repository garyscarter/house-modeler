import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store";
import { listing91770873, listing91770873Proposed, listingSite, LISTING_PRESET, LISTING_PROPOSED_PRESET, LISTING_SITE_PRESET, SITE_PRESETS } from "./houses/listing91770873";
import { applyBoundaryUpdate, planBoundaryUpdate, updatePreset, updateSitePreset } from "./presetActions";
import { setOpeningWidth } from "./boundaryOpening";
import { decideSiteUpdate, freshSiteFor, hasPlotEdits, isListingPlot, isStaleSite, looksLikeListingSite } from "./sitePreset";
import { simpleSite } from "./site";
import { decideStartupPrompt, describeUpdate } from "./startupPrompt";
import type { Site } from "../types";

const asListed = { preset: LISTING_PRESET };
const proposed = { preset: LISTING_PROPOSED_PRESET };

/** A plot as an earlier release saved it: no marker, and the newer drive wall / finish fields missing. */
function legacySite(): Site {
  const s = structuredClone(listingSite());
  delete s.preset;
  s.boundaryEdges = s.boundaryEdges!.map((e) => {
    const { follow: _f, stepEvery: _s, ...rest } = e;
    return rest;
  });
  s.surfaces = s.surfaces.map(({ finish: _f, ...rest }) => rest);
  return s;
}

describe("the built-in plot is marked", () => {
  it("carries the site preset and is in the registry", () => {
    expect(listingSite().preset).toEqual(LISTING_SITE_PRESET);
    expect(SITE_PRESETS[LISTING_SITE_PRESET.id].version).toBe(LISTING_SITE_PRESET.version);
    expect(SITE_PRESETS[LISTING_SITE_PRESET.id].build().preset).toEqual(LISTING_SITE_PRESET);
  });
});

describe("isStaleSite", () => {
  it("is false for a current built-in plot and for no plot", () => {
    expect(isStaleSite(listingSite(), asListed)).toBe(false);
    expect(isStaleSite(undefined, asListed)).toBe(false);
    expect(isStaleSite(null, asListed)).toBe(false);
  });
  it("is true for a marker with an older version, and false for an unknown id", () => {
    const reg = { [LISTING_SITE_PRESET.id]: { version: LISTING_SITE_PRESET.version + 1, build: listingSite } };
    expect(isStaleSite(listingSite(), asListed, reg)).toBe(true);
    const other = { ...listingSite(), preset: { id: "something-else", version: 1 } };
    expect(isStaleSite(other, asListed, reg)).toBe(false);
  });
  it("keeps the marker through an edit, so an edited older plot is still offered the update", () => {
    const edited = { ...listingSite(), frontBearing: 170 };
    const reg = { [LISTING_SITE_PRESET.id]: { version: LISTING_SITE_PRESET.version + 1, build: listingSite } };
    expect(isStaleSite(edited, asListed, reg)).toBe(true);
  });
  it("recognises a legacy listing plot without a marker, on a built-in listing layout only", () => {
    expect(isStaleSite(legacySite(), asListed)).toBe(true);
    expect(isStaleSite(legacySite(), proposed)).toBe(true);
    expect(isStaleSite(legacySite(), {})).toBe(false);
    expect(isStaleSite(legacySite(), undefined)).toBe(false);
  });
  it("still recognises a legacy plot whose edges were edited a little", () => {
    const s = legacySite();
    s.boundary = s.boundary.map((p, i) => (i === 6 ? { ...p, x: p.x + 1.2 } : p));
    expect(isStaleSite(s, asListed)).toBe(true);
  });
  it("never offers a plot the user made", () => {
    const model = listing91770873("");
    const simple = simpleSite(model, { front: 6, rear: 10, left: 1, right: 1 });
    expect(isStaleSite(simple, asListed)).toBe(false);
    // Even one that keeps the listing's bearing and location is a different size.
    const keep = simpleSite(model, { front: 6, rear: 10, left: 1, right: 1 }, { frontBearing: 162, latitude: 51.44, longitude: -2.62 });
    expect(looksLikeListingSite(keep, listingSite())).toBe(false);
    expect(isStaleSite(keep, asListed)).toBe(false);
    // And a hand-drawn square in the same place.
    const drawn: Site = { frontBearing: 162, latitude: 51.44, longitude: -2.62, boundary: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], neighbours: [], surfaces: [] };
    expect(isStaleSite(drawn, asListed)).toBe(false);
  });
  it("is false for a plot elsewhere or facing another way", () => {
    expect(isStaleSite({ ...legacySite(), frontBearing: 90 }, asListed)).toBe(false);
    expect(isStaleSite({ ...legacySite(), latitude: 40 }, asListed)).toBe(false);
  });
});

describe("freshSiteFor", () => {
  it("builds the plot the marker names, or the listing's for a legacy one", () => {
    expect(freshSiteFor(legacySite())!.preset).toEqual(LISTING_SITE_PRESET);
    expect(freshSiteFor(listingSite())!.preset).toEqual(LISTING_SITE_PRESET);
  });
});

describe("decideSiteUpdate", () => {
  const reg = { [LISTING_SITE_PRESET.id]: { version: LISTING_SITE_PRESET.version + 1, build: listingSite } };
  const v = { current: asListed, proposed };
  it("is null when nothing is stale or there are no plots", () => {
    expect(decideSiteUpdate(v, {})).toBeNull();
    expect(decideSiteUpdate(v, { current: listingSite() })).toBeNull();
  });
  it("offers As listed's stale plot; Proposed borrowing it follows without being listed", () => {
    expect(decideSiteUpdate(v, { current: legacySite() })).toEqual({ version: LISTING_SITE_PRESET.version, current: true, proposed: undefined });
    expect(decideSiteUpdate(v, { current: listingSite() }, reg)).toEqual({ version: LISTING_SITE_PRESET.version + 1, current: true, proposed: undefined });
  });
  it("takes Proposed's unchanged copy along, but treats an edited one as its own", () => {
    const old = legacySite();
    expect(decideSiteUpdate(v, { current: old, proposed: structuredClone(old) })).toEqual({ version: LISTING_SITE_PRESET.version, current: true, proposed: "with-current" });
    const edited = structuredClone(old);
    edited.boundary[6].x += 1.2;
    expect(decideSiteUpdate(v, { current: old, proposed: edited })).toEqual({ version: LISTING_SITE_PRESET.version, current: true, proposed: "own" });
    expect(decideSiteUpdate(v, { current: listingSite(), proposed: edited })).toEqual({ version: LISTING_SITE_PRESET.version, current: false, proposed: "own" });
  });
  it("ignores a cleared Proposed plot and a user-made one", () => {
    const simple = simpleSite(listing91770873(""), { front: 6, rear: 10, left: 1, right: 1 });
    expect(decideSiteUpdate(v, { current: legacySite(), proposed: null })?.proposed).toBeUndefined();
    expect(decideSiteUpdate(v, { current: simple })).toBeNull();
    expect(decideSiteUpdate(v, { current: listingSite(), proposed: simple })).toBeNull();
  });
});

describe("the startup prompt with a plot update", () => {
  const REG = { a: { version: 5 } };
  const m = (v: number) => ({ preset: { id: "a", version: v } });
  const layoutsOk = { current: m(5) };
  it("offers the plot alone when the layouts are up to date", () => {
    const site = { version: 1, current: true };
    expect(decideStartupPrompt(layoutsOk, REG, "a", {}, site)).toEqual({ kind: "update", version: 0, variants: [], site });
  });
  it("combines layouts and plot in one prompt", () => {
    const site = { version: 1, current: true };
    expect(decideStartupPrompt({ current: m(4) }, REG, "a", {}, site)).toEqual({ kind: "update", version: 5, variants: ["current"], site });
  });
  it("remembers the plot and the layouts separately", () => {
    const site = { version: 1, current: true };
    expect(decideStartupPrompt(layoutsOk, REG, "a", { site: 1 }, site)).toBeNull();
    expect(decideStartupPrompt(layoutsOk, REG, "a", { site: 1 }, { ...site, version: 2 })).not.toBeNull();
    // Layouts declined, plot not: only the plot is asked.
    expect(decideStartupPrompt({ current: m(4) }, REG, "a", { update: 5 }, site)).toEqual({ kind: "update", version: 0, variants: [], site });
    // Plot declined, layouts not: only the layouts are asked.
    expect(decideStartupPrompt({ current: m(4) }, REG, "a", { site: 1 }, site)).toEqual({ kind: "update", version: 5, variants: ["current"] });
  });
  it("keeps the old wording and buttons when only layouts are on offer", () => {
    const d = describeUpdate({ kind: "update", version: 5, variants: ["current"] });
    expect(d.choices.map((c) => c.label)).toEqual(["Update", "Keep mine"]);
    expect(d.message).toContain("built-in As listed layout");
  });
  it("describes layouts and plot together", () => {
    const d = describeUpdate({ kind: "update", version: 5, variants: ["current", "proposed"], site: { version: 1, current: true } });
    expect(d.message).toContain("house layouts (As listed, Proposed) and the plot");
    expect(d.choices.map((c) => c.label)).toEqual(["Update", "Not now"]);
    expect(d.choices[0].plan).toEqual({ layouts: ["current", "proposed"], sites: ["current"], remember: [] });
    expect(d.choices[1].plan).toBeNull();
  });
  it("never replaces an edited Proposed plot without the explicit choice", () => {
    const d = describeUpdate({ kind: "update", version: 0, variants: [], site: { version: 1, current: true, proposed: "own" } });
    expect(d.choices.map((c) => c.label)).toEqual([
      "Update",
      "Update the boundaries only (keep my edits)",
      "Update, and Proposed's plot too (your plot edits there are lost)",
      "Not now",
    ]);
    expect(d.choices[0].plan!.sites).toEqual(["current"]);
    expect(d.choices[0].plan!.remember).toEqual(["site"]);
    // Boundaries only: As listed's unedited plot is replaced, Proposed's edited one keeps its edits.
    expect(d.choices[1].plan).toEqual({ layouts: [], sites: ["current"], boundaries: ["proposed"], remember: [] });
    expect(d.choices[2].plan!.sites).toEqual(["current", "proposed"]);
    expect(d.message).toContain("Proposed has a plot of its own");
  });
  it("offers boundaries only for an edited As listed plot, with layouts or without", () => {
    const only = describeUpdate({ kind: "update", version: 0, variants: [], site: { version: 1, current: true, currentEdited: true } });
    expect(only.choices.map((c) => c.label)).toEqual(["Update", "Update the boundaries only (keep my edits)", "Not now"]);
    expect(only.choices[1].plan).toEqual({ layouts: [], sites: [], boundaries: ["current"], remember: [] });
    const both = describeUpdate({ kind: "update", version: 5, variants: ["current"], site: { version: 1, current: true, proposed: "with-current", currentEdited: true } });
    expect(both.choices[1].label).toBe("Update, and only the plot's boundaries (keep my plot edits)");
    expect(both.choices[1].plan).toEqual({ layouts: ["current"], sites: [], boundaries: ["current", "proposed"], remember: [] });
    expect(both.message).toContain("boundaries-only");
  });
  it("offers no boundaries-only choice for a plot with no edits", () => {
    const d = describeUpdate({ kind: "update", version: 0, variants: [], site: { version: 1, current: true } });
    expect(d.choices.map((c) => c.label)).toEqual(["Update", "Not now"]);
    expect(d.choices[0].plan!.boundaries).toBeUndefined();
  });
  it("offers just the boundaries when only Proposed's own plot is stale", () => {
    const d = describeUpdate({ kind: "update", version: 0, variants: [], site: { version: 1, current: false, proposed: "own" } });
    expect(d.choices.map((c) => c.label)).toEqual(["Update Proposed's plot (your plot edits there are lost)", "Update the boundaries only (keep my edits)", "Not now"]);
    expect(d.choices[1].plan).toEqual({ layouts: [], sites: [], boundaries: ["proposed"], remember: [] });
  });
  it("takes Proposed's unchanged copy with As listed", () => {
    const d = describeUpdate({ kind: "update", version: 0, variants: [], site: { version: 1, current: true, proposed: "with-current" } });
    expect(d.choices[0].plan!.sites).toEqual(["current", "proposed"]);
    expect(d.choices).toHaveLength(2);
  });
  it("offers just Proposed's plot when only that is out of date", () => {
    const d = describeUpdate({ kind: "update", version: 0, variants: [], site: { version: 1, current: false, proposed: "own" } });
    expect(d.choices[0].label).toContain("Proposed's plot");
    expect(d.choices[0].plan).toEqual({ layouts: [], sites: ["proposed"], remember: [] });
  });
});

describe("telling edited plots from unedited ones", () => {
  it("sees no edits in a copy that differs only in treatments and ids", () => {
    expect(hasPlotEdits(legacySite(), listingSite())).toBe(false);
  });
  it("sees a moved corner, a changed neighbour or a moved bearing", () => {
    expect(hasPlotEdits(setOpeningWidth(listingSite(), 6, 4), listingSite())).toBe(true);
    const n = listingSite();
    n.neighbours[0].eaves += 1;
    expect(hasPlotEdits(n, listingSite())).toBe(true);
    expect(hasPlotEdits({ ...listingSite(), frontBearing: 170 }, listingSite())).toBe(true);
  });
  it("flags As listed's edited stale plot in decideSiteUpdate, only when it is", () => {
    const v = { current: asListed, proposed };
    expect(decideSiteUpdate(v, { current: legacySite() })?.currentEdited).toBeUndefined();
    expect(decideSiteUpdate(v, { current: setOpeningWidth(legacySite(), 6, 4) })?.currentEdited).toBe(true);
  });
  it("knows a listing plot on a listing layout", () => {
    expect(isListingPlot(listingSite(), asListed)).toBe(true);
    expect(isListingPlot(legacySite(), proposed)).toBe(true);
    expect(isListingPlot(listingSite(), {})).toBe(false);
    expect(isListingPlot(listingSite(), undefined)).toBe(false);
    expect(isListingPlot(undefined, asListed)).toBe(false);
    expect(isListingPlot(simpleSite(listing91770873(""), { front: 6, rear: 10, left: 1, right: 1 }), asListed)).toBe(false);
  });
});

describe("updating through the store", () => {
  const st = () => useStore.getState();
  beforeEach(() => {
    useStore.setState({ variants: {}, sites: {}, photos: [], past: [], future: [], activeVariant: "current" });
  });

  it("replaces a legacy plot with the latest one, in one undo step", () => {
    st().setVariant("current", listing91770873(""));
    useStore.setState({ sites: { current: legacySite() }, past: [] });
    updateSitePreset("current");
    expect(st().sites.current!.preset).toEqual(LISTING_SITE_PRESET);
    expect(st().sites.current!.boundaryEdges![7]).toMatchObject({ follow: "step", stepEvery: 2.45 });
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().sites.current!.preset).toBeUndefined();
  });
  it("leaves Proposed's own plot alone unless asked, and it follows As listed when it has none", () => {
    st().setVariant("current", listing91770873(""));
    st().setVariant("proposed", listing91770873Proposed(""));
    const edited = { ...legacySite(), longitude: -2.6201 };
    useStore.setState({ sites: { current: legacySite(), proposed: edited } });
    updateSitePreset("current");
    expect(st().sites.proposed).toBe(edited);
    updateSitePreset("proposed");
    expect(st().sites.proposed!.longitude).toBe(-2.62);
    useStore.setState({ sites: { current: legacySite() } });
    updateSitePreset("current");
    expect(st().sites.proposed).toBeUndefined();
  });
  it("does nothing for a layout with no plot", () => {
    st().setVariant("current", listing91770873(""));
    updateSitePreset("current");
    expect(st().sites.current).toBeUndefined();
  });
  it("updates layouts and plots together in a single undo step", () => {
    st().setVariant("current", { ...listing91770873(""), preset: { ...LISTING_PRESET, version: 1 } });
    useStore.setState({ sites: { current: legacySite() }, past: [] });
    updatePreset("current");
    updateSitePreset("current");
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().variants.current!.preset!.version).toBe(1);
    expect(st().sites.current!.preset).toBeUndefined();
  });
  it("updates the boundaries of an edited plot, keeps the widened drive, and undoes in one step", () => {
    st().setVariant("current", listing91770873(""));
    st().setVariant("proposed", listing91770873Proposed(""));
    const mine = setOpeningWidth(legacySite(), 6, 4.0, "start");
    useStore.setState({ sites: { current: legacySite(), proposed: mine }, past: [] });
    const plan = planBoundaryUpdate("proposed")!;
    expect(plan.changes.map((c) => c.edge)).toContain(7); // the drive-side wall gains its stepped top
    applyBoundaryUpdate("proposed", plan);
    const after = st().sites.proposed!;
    expect(after.boundary).toEqual(mine.boundary);
    expect(after.boundaryEdges![6].kind).toBe("open");
    expect(after.boundaryEdges![7]).toMatchObject({ follow: "step", stepEvery: 2.45 });
    expect(after.preset).toEqual(LISTING_SITE_PRESET);
    expect(isStaleSite(after, proposed)).toBe(false);
    expect(st().sites.current!.preset).toBeUndefined();
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().sites.proposed).toBe(mine);
  });
  it("has nothing to plan for a layout with no plot of its own", () => {
    st().setVariant("current", listing91770873(""));
    expect(planBoundaryUpdate("proposed")).toBeUndefined();
  });
});
