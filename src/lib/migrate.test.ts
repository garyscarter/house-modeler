import { describe, expect, it } from "vitest";
import { listing91770873, listing91770873Proposed, listingSite } from "./houses/listing91770873";
import { migrateModel, migratePersisted, PERSIST_VERSION } from "./migrate";

describe("persisted-state migration", () => {
  it("moves the shared plot of a version 4 save onto both layouts", () => {
    const site = { ...listingSite(), frontBearing: 150 };
    const saved = JSON.parse(JSON.stringify({ variants: { current: listing91770873(""), proposed: listing91770873Proposed("") }, photos: [], site, settings: { quality: "low" } }));
    const st = migratePersisted(saved, 4);
    expect(st.site).toBeUndefined();
    expect(st.sites?.current).toEqual(site);
    expect(st.sites?.proposed).toEqual(site);
    expect(st.sites?.current).not.toBe(st.sites?.proposed);
    expect(st.settings).toEqual({ quality: "low" });
  });

  it("puts it on As listed alone when that is the only layout", () => {
    const st = migratePersisted({ variants: { current: listing91770873("") }, site: listingSite() }, 4);
    expect(Object.keys(st.sites ?? {})).toEqual(["current"]);
  });

  it("leaves a save without a plot without one", () => {
    expect(migratePersisted({ variants: {}, photos: [] }, 4).sites).toEqual({});
  });

  it("still gives a very old listing save the listing's plot, now per layout", () => {
    const current = listing91770873("");
    delete (current as { exterior?: unknown }).exterior;
    const st = migratePersisted({ variants: { current, proposed: listing91770873Proposed("") } }, 2);
    expect(st.sites?.current?.frontBearing).toBe(listingSite().frontBearing);
    expect(st.sites?.proposed?.boundary).toEqual(listingSite().boundary);
  });

  it("is at version 5", () => expect(PERSIST_VERSION).toBe(5));
});

describe("migrateModel", () => {
  const withOpening = (o: Record<string, unknown>) => {
    const m = JSON.parse(JSON.stringify(listing91770873("")));
    m.floors[0].openings = [{ id: "o1", ...o }];
    return m;
  };
  it("turns a style garage door into kind garage", () => {
    const m = migrateModel(withOpening({ kind: "door", style: "garage" }));
    expect(m.floors[0].openings[0].kind).toBe("garage");
    expect("style" in m.floors[0].openings[0]).toBe(false);
    expect(migrateModel(m)).toEqual(m);
  });
  it("leaves a panel door alone", () => {
    const m = withOpening({ kind: "door", style: "panel" });
    expect(migrateModel(m).floors[0].openings[0]).toEqual({ id: "o1", kind: "door", style: "panel" });
  });
  it("adds a hip roof and party wall to a listing exterior without one", () => {
    const m = JSON.parse(JSON.stringify(listing91770873("")));
    m.exterior = { ...m.exterior };
    delete m.exterior.roofStyle;
    const out = migrateModel(m);
    expect(out.exterior?.roofStyle).toBe("hip");
    expect(out.exterior?.partyWall).toBe("right");
  });
});
