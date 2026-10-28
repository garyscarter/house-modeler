import { describe, expect, it } from "vitest";
import { builtInHouse, builtInProposed, listingSite } from "../houses/default";
import { migrateModel, migratePersisted, migrateSite, PERSIST_VERSION } from "./migrate";

describe("persisted-state migration", () => {
  it("moves the shared plot of a version 4 save onto both layouts", () => {
    const site = { ...listingSite(), frontBearing: 150 };
    const saved = JSON.parse(JSON.stringify({ variants: { current: builtInHouse(""), proposed: builtInProposed("") }, photos: [], site, settings: { quality: "low" } }));
    const st = migratePersisted(saved, 4);
    expect(st.site).toBeUndefined();
    expect(st.sites?.current).toEqual(site);
    expect(st.sites?.proposed).toEqual(site);
    expect(st.sites?.current).not.toBe(st.sites?.proposed);
    expect(st.settings).toEqual({ quality: "low" });
  });

  it("puts it on As listed alone when that is the only layout", () => {
    const st = migratePersisted({ variants: { current: builtInHouse("") }, site: listingSite() }, 4);
    expect(Object.keys(st.sites ?? {})).toEqual(["current"]);
  });

  it("leaves a save without a plot without one", () => {
    expect(migratePersisted({ variants: {}, photos: [] }, 4).sites).toEqual({});
  });

  it("still gives a very old listing save the listing's plot, now per layout", () => {
    const current = builtInHouse("");
    delete (current as { exterior?: unknown }).exterior;
    const st = migratePersisted({ variants: { current, proposed: builtInProposed("") } }, 2);
    expect(st.sites?.current?.frontBearing).toBe(listingSite().frontBearing);
    expect(st.sites?.proposed?.boundary).toEqual(listingSite().boundary);
  });

  it("is at version 7", () => expect(PERSIST_VERSION).toBe(7));

  it("renames the attached neighbour's buildings in a version 5 save", () => {
    const site = listingSite();
    const old = { ...site, neighbours: site.neighbours.map((n) => ({ ...n, name: n.name.replace("Attached neighbour's ", "No. 9 ").replace("Attached neighbour", "No. 9 (attached)") })) };
    const st = migratePersisted({ variants: {}, sites: { current: old, proposed: null } }, 5);
    expect(st.sites?.current?.neighbours.map((n) => n.name)).toEqual(site.neighbours.map((n) => n.name));
    expect(st.sites?.proposed).toBeNull();
  });

  it("drops photos and a room's photo floor from a version 6 save", () => {
    const withPhotoFloor = JSON.parse(JSON.stringify(builtInHouse("")));
    withPhotoFloor.floors[0].rooms[0].floorPhotoId = "p1";
    const st = migratePersisted({ variants: { current: withPhotoFloor }, photos: [{ id: "p1", name: "kitchen-1", dataUrl: "" }] }, 6);
    expect(st).not.toHaveProperty("photos");
    expect(st.variants?.current.floors[0].rooms[0]).not.toHaveProperty("floorPhotoId");
    expect(st.variants?.current.floors[0].rooms.length).toBe(withPhotoFloor.floors[0].rooms.length);
  });

  it("leaves neighbours the owner named alone", () => {
    const site = { ...listingSite(), neighbours: [{ ...listingSite().neighbours[0], name: "No. 9" }] };
    expect(migrateSite(site)).toBe(site);
  });
});

describe("migrateModel", () => {
  const withOpening = (o: Record<string, unknown>) => {
    const m = JSON.parse(JSON.stringify(builtInHouse("")));
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
    const m = JSON.parse(JSON.stringify(builtInHouse("")));
    m.exterior = { ...m.exterior };
    delete m.exterior.roofStyle;
    const out = migrateModel(m);
    expect(out.exterior?.roofStyle).toBe("hip");
    expect(out.exterior?.partyWall).toBe("right");
  });
});

describe("old TV presets", () => {
  it("become the sized TV items, a 65 keeping its size and a 55 taking the default", () => {
    const base = builtInHouse("");
    const f0 = base.floors[0];
    const m = { ...base, floors: [{ ...f0, fixtures: [{ id: "a", type: "tv-wall-65", x: 0, y: 0, rot: 0 }, { id: "b", type: "tv-stand-55", x: 0, y: 0, rot: 0 }, { id: "c", type: "tv-stand-65", x: 0, y: 0, rot: 0, w: 1.6 }] }, ...base.floors.slice(1)] };
    const out = migrateModel(m);
    const [a, b, c] = out.floors[0].fixtures!;
    expect(a).toMatchObject({ type: "tv-wall", w: 1.45, h: 0.83 });
    expect(b).toMatchObject({ type: "tv-stand" });
    expect(b.w).toBeUndefined();
    expect(c).toMatchObject({ type: "tv-stand", w: 1.6, h: 0.88, d: 0.28 });
    expect(migrateModel(out)).toBe(out);
  });
});
