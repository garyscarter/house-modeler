import { describe, expect, it } from "vitest";
import { applyChanges, applyListingUpdates, defaultSelection, isBasedOnListing, listingUpdates, onWall, reviewedVersion, type LayoutChange } from "./layoutMerge";
import { floor, rect } from "./testing";
import { DEFAULT_EXTERIOR, type Fixture, type HouseModel, type Opening } from "../types";
import { LISTING_PRESET, PRESETS } from "../houses/default";
import { frontUnit, withSidelight } from "./openings";
import { wallRun } from "./planMath";

// 1 px = 1 cm. Ground: Kitchen (0-400 × 0-300) beside Hall (400-600 × 0-300). First: Bedroom over both.
const door = (x: number, y: number, o: "h" | "v", extra: Partial<Opening> = {}): Opening => ({ id: `d${x}-${y}`, kind: "door", x, y, orientation: o, widthM: 0.8, ...extra });
const win = (x: number, y: number, extra: Partial<Opening> = {}): Opening => ({ id: `w${x}-${y}`, kind: "window", x, y, orientation: "h", widthM: 1.2, ...extra });
const fx = (id: string, type: string, x: number, y: number, rot = 0, extra: Partial<Fixture> = {}): Fixture => ({ id, type, x, y, rot, ...extra });

function base(): HouseModel {
  return {
    floors: [
      floor([rect("Kitchen", 0, 0, 400, 300), rect("Hall", 400, 0, 600, 300)], [door(400, 150, "v"), win(200, 300)], {
        id: "g",
        stairs: { x: 500, y: 150 },
        stairsLen: 2.3,
        fixtures: [fx("sofa", "sofa-2", 200, 150)],
      }),
      floor([rect("Bedroom", 0, 0, 600, 300)], [win(300, 300)], { id: "f", level: 1, name: "First" }),
    ],
    ceilingHeight: 2.4,
    slabThickness: 0.2,
    exterior: { ...DEFAULT_EXTERIOR, pitchDeg: 28, overhang: 0.35 },
    preset: { id: "listing", version: 1 },
  };
}

/** The "latest" built-in house: steeper roof, radiators, a wound stair head, a lower cupboard door. */
function latest(): HouseModel {
  const m = base();
  m.preset = { id: "listing", version: 2 };
  m.exterior = { ...m.exterior!, pitchDeg: 32, overhang: 0.25, extensionRoof: "separate" };
  const g = m.floors[0];
  g.fixtures = [
    ...g.fixtures!,
    // Under the kitchen window, against the front wall (inner face at y 287.5).
    fx("rad-k", "radiator-single-1000", 200, 284, 180),
    // Hall, against the party wall at x 600.
    fx("rad-h", "radiator-single-600", 584, 150, 90),
    fx("table", "table-4", 100, 60),
  ];
  g.stairsTopTurn = "right";
  g.stairsTopWinders = 2;
  g.stairsLen = 3.3;
  g.openings = [door(400, 150, "v", { head: 1.75, style: "ledged" }), win(200, 300, { sillStyle: "upvc" }), door(500, 300, "h", { kind: "front" })];
  m.floors[1].fixtures = [fx("mirror", "mirror", 300, 3, 0)];
  return m;
}

const byLabel = (cs: LayoutChange[], text: string) => cs.find((c) => c.label.includes(text));
const ids = (cs: LayoutChange[]) => cs.map((c) => c.id);

describe("listingUpdates", () => {
  it("offers nothing when the design already matches, and does not mutate its inputs", () => {
    const mine = base();
    const l = base();
    const before = structuredClone(mine);
    expect(listingUpdates(mine, l)).toEqual([]);
    expect(applyListingUpdates(mine, l, [])).toEqual(before);
    listingUpdates(mine, latest());
    expect(mine).toEqual(before);
  });

  it("offers the roof settings in plain words, ticking measured ones and not design ones", () => {
    const cs = listingUpdates(base(), latest()).filter((c) => c.group === "exterior");
    expect(cs.map((c) => c.label)).toEqual(["Roof pitch: 28° → 32°", "Eaves overhang: 0.35 m → 0.25 m", "Extension roofs: carry on the main roof → separate, lower roofs"]);
    expect(cs.map((c) => c.defaultSelected)).toEqual([true, true, false]);
    expect(cs[2].note).toMatch(/Not ticked/);
  });

  it("offers new storey heights as one ticked change that sets both the ceiling and the floor depth", () => {
    const l = latest();
    l.ceilingHeight = 2.25;
    const cs = listingUpdates(base(), l).filter((c) => c.id === "model.storeys");
    expect(cs.map((c) => [c.label, c.defaultSelected])).toEqual([["Storey heights: 2.4 m ceilings, 0.2 m floors → 2.25 m ceilings, 0.2 m floors", true]]);
    const out = applyListingUpdates(base(), l, ["model.storeys"]);
    expect([out.ceilingHeight, out.slabThickness]).toEqual([2.25, 0.2]);
    expect(out.floors).toEqual(base().floors);
  });

  it("brings the design's own default-height windows to the sill and head every window on the latest floor shares", () => {
    const mine = base();
    // An extension window of the owner's at the default heights, and one with heights of its own.
    mine.floors[1].openings.push(win(100, 0), win(500, 0, { sill: 1.2, head: 2.0 }));
    const l = base();
    l.floors[1].openings = [win(300, 300, { sill: 0.98, head: 1.95 }), win(450, 300, { sill: 0.98, head: 1.95 })];
    // The ground floor's one window has its own heights, so no house height is offered there.
    l.floors[0].openings[1] = win(200, 300, { sill: 1.0, head: 2.15 });
    const cs = listingUpdates(mine, l).filter((c) => c.id.endsWith("own-heights"));
    expect(cs.map((c) => [c.label, c.defaultSelected])).toEqual([["First, your own window in Bedroom's outside wall: sill and head 0.9 m to 2.1 m → 0.98 m to 1.95 m, as the house's", true]]);
    const out = applyChanges(mine, cs, [cs[0].id]);
    expect(out.floors[1].openings.map((o) => [o.x, o.sill, o.head])).toEqual([
      [300, undefined, undefined],
      [100, 0.98, 1.95],
      [500, 1.2, 2.0],
    ]);
  });

  it("applies only what is ticked, and never touches rooms, walls or the design's own fixtures", () => {
    const mine = base();
    mine.floors[0].rooms[1].name = "Utility Room";
    mine.floors[0].walls = [{ id: "w", a: { x: 100, y: 0 }, b: { x: 100, y: 100 } }];
    mine.floors[0].fixtures!.push(fx("mine", "bed-double", 100, 200));
    const l = latest();
    const out = applyListingUpdates(mine, l, ["exterior.pitchDeg"]);
    expect(out.exterior!.pitchDeg).toBe(32);
    expect(out.exterior!.overhang).toBe(0.35);
    expect({ ...out, exterior: mine.exterior }).toEqual(mine);
  });

  it("ticks fittings that land in the same room, clear of walls, doors and furniture; furniture stays unticked", () => {
    const cs = listingUpdates(base(), latest()).filter((c) => c.group === "fixtures");
    const k = byLabel(cs, "Kitchen: Radiator, single (1000 × 450)")!;
    const h = byLabel(cs, "Hall: Radiator, single (600 × 600)")!;
    const m = byLabel(cs, "First, Bedroom: Mirror")!;
    const t = byLabel(cs, "Dining table")!;
    expect([k.defaultSelected, h.defaultSelected, m.defaultSelected, t.defaultSelected]).toEqual([true, true, true, false]);
    expect(t.note).toMatch(/furniture is yours/);
    // The sofa is already there: not offered.
    expect(byLabel(cs, "Sofa")).toBeUndefined();
    // Ticked first.
    expect(cs[cs.length - 1]).toBe(t);
  });

  it("flags a fitting where the design has another room, a wall, a door or its own furniture", () => {
    const mine = base();
    mine.floors[0].rooms[1].name = "Utility Room";
    // A wall run across the kitchen where the radiator would go, and a bed in the bedroom under the mirror.
    mine.floors[0].walls = [{ id: "x", a: { x: 150, y: 284 }, b: { x: 250, y: 284 } }];
    mine.floors[1].fixtures = [fx("bed", "bedside", 300, 25)];
    const cs = listingUpdates(mine, latest()).filter((c) => c.group === "fixtures");
    const h = byLabel(cs, "Radiator, single (600 × 600)")!;
    expect(h.defaultSelected).toBe(false);
    expect(h.note).toContain("sits where your Utility Room now is");
    expect(byLabel(cs, "(1000 × 450)")!.note).toContain("would cut into one of your walls");
    expect(byLabel(cs, "Mirror")!.defaultSelected).toBe(true); // wall-hung at 1.1 m: clear of a 0.55 m bedside table
    mine.floors[1].fixtures = [fx("ward", "wardrobe-double", 300, 30)];
    expect(byLabel(listingUpdates(mine, latest()), "Mirror")!.note).toContain("overlaps your double wardrobe");
    const blocked = base();
    blocked.floors[0].openings.push(door(200, 300, "h", { kind: "front" }));
    blocked.floors[0].openings.splice(1, 1);
    expect(byLabel(listingUpdates(blocked, latest()), "(1000 × 450)")!.note).toContain("would block your front door");
  });

  it("adds a ticked fitting with a fresh id at the same place, mapped onto the design's floor", () => {
    const mine = base();
    // The design's ground floor is drawn at another scale and origin: the radiator lands at the same world spot.
    const g = mine.floors[0];
    const scale = (p: { x: number; y: number }) => ({ x: p.x * 2 + 50, y: p.y * 2 + 50 });
    g.pxPerM = 200;
    g.origin = { x: 50, y: 50 };
    g.rooms = g.rooms.map((r) => ({ ...r, polygon: r.polygon.map(scale) }));
    g.openings = g.openings.map((o) => ({ ...o, ...scale(o) }));
    g.fixtures = g.fixtures!.map((f) => ({ ...f, ...scale(f) }));
    g.stairs = scale(g.stairs!);
    const cs = listingUpdates(mine, latest());
    const k = byLabel(cs, "(1000 × 450)")!;
    expect(k.defaultSelected).toBe(true);
    const out = applyListingUpdates(mine, latest(), [k.id]);
    const added = out.floors[0].fixtures!.find((f) => f.type === "radiator-single-1000")!;
    expect(added).toMatchObject({ x: 450, y: 618, rot: 180 });
    expect(added.id).not.toBe("rad-k");
    expect(out.floors[0].fixtures!.slice(0, -1)).toEqual(g.fixtures);
  });

  it("offers a flat head with steps to a copy with the old winding head, and applies it", () => {
    const mine = latest();
    const l = latest();
    l.floors[0].stairsTopSteps = 2;
    const cs = listingUpdates(mine, l).filter((c) => c.group === "stairs");
    expect(cs).toHaveLength(1);
    expect(cs[0].label).toBe("Floor stairs: top winds right (2 winders) → turns right: a landing, then 2 rises up");
    expect(cs[0].defaultSelected).toBe(true);
    const out = applyListingUpdates(mine, l, [cs[0].id]).floors[0];
    expect([out.stairsTopTurn, out.stairsTopSteps]).toEqual(["right", 2]);
  });

  it("offers each floor's stairs as one change, ticked while the flight is where the listing's is", () => {
    const cs = listingUpdates(base(), latest()).filter((c) => c.group === "stairs");
    expect(cs).toHaveLength(1);
    expect(cs[0].label).toBe("Floor stairs: 2.3 m → 3.3 m long, top straight → winds right (2 winders)");
    expect(cs[0].defaultSelected).toBe(true);
    const out = applyListingUpdates(base(), latest(), [cs[0].id]).floors[0];
    expect([out.stairsLen, out.stairsTopTurn, out.stairsTopWinders]).toEqual([3.3, "right", 2]);
    const moved = base();
    moved.floors[0].stairs = { x: 100, y: 150 };
    const far = listingUpdates(moved, latest()).find((c) => c.group === "stairs")!;
    expect(far.defaultSelected).toBe(false);
    expect(far.label).toContain("moved 4 m to the right");
    expect(far.note).toContain("you may have moved them");
  });

  it("updates a matched door's look and size but never its hinge or swing, and offers missing openings unticked", () => {
    const mine = base();
    mine.floors[0].openings[0] = { ...mine.floors[0].openings[0], x: 400, y: 160, flipHinge: true };
    const cs = listingUpdates(mine, latest()).filter((c) => c.group === "openings");
    const d = byLabel(cs, "door (0.8 m) between Kitchen and Hall")!;
    expect(d.label).toBe("Floor, door (0.8 m) between Kitchen and Hall: style default → ledged, head height 2.05 m → 1.75 m");
    expect(d.defaultSelected).toBe(true);
    const w = byLabel(cs, "window (1.2 m)")!;
    expect(w.label).toContain("outside sill stone → upvc");
    const front = byLabel(cs, "add the listing's front door")!;
    expect(front).toMatchObject({ defaultSelected: false, available: true });
    expect(front.label).toBe("Floor: add the listing's front door (0.8 m) in Hall's outside wall");
    const out = applyListingUpdates(mine, latest(), defaultSelection(cs));
    expect(out.floors[0].openings[0]).toEqual({ ...mine.floors[0].openings[0], head: 1.75, style: "ledged" });
    expect(out.floors[0].openings).toHaveLength(2);
    const all = applyListingUpdates(mine, latest(), ids(cs));
    expect(all.floors[0].openings).toHaveLength(3);
    expect(all.floors[0].openings[2]).toMatchObject({ kind: "front", x: 500, y: 300 });
  });

  it("won't add an opening off the design's walls or over its own, and never removes the design's openings", () => {
    const mine = base();
    // The hall's front wall is now further forward, and the kitchen window is gone in favour of French doors.
    mine.floors[0].rooms[1] = rect("Hall", 400, 0, 600, 400);
    mine.floors[0].openings[1] = { id: "fr", kind: "french", x: 200, y: 300, orientation: "h", widthM: 1.5 };
    const l = latest();
    l.floors[0].openings.push(win(150, 300));
    const cs = listingUpdates(mine, l).filter((c) => c.group === "openings");
    const front = byLabel(cs, "front door")!;
    expect(front.available).toBe(false);
    expect(front.note).toBe("Can't be added: there is no wall there in your design.");
    const w = cs.filter((c) => c.label.includes("add the listing's window"));
    expect(w.map((c) => c.note)).toEqual(["Can't be added: it would overlap your french doors there.", "Can't be added: it would overlap your french doors there."]);
    const out = applyListingUpdates(mine, l, ids(cs));
    expect(out.floors[0].openings.find((o) => o.id === "fr")).toEqual(mine.floors[0].openings[1]);
  });

  it("says when the design already has a door between the same rooms (the listing's may be the same one moved)", () => {
    const l = latest();
    l.floors[0].openings[0] = { ...l.floors[0].openings[0], y: 60 };
    const c = byLabel(listingUpdates(base(), l), "add the listing's door")!;
    expect(c.available).toBe(true);
    expect(c.defaultSelected).toBe(false);
    expect(c.note).toContain("you already have a door between Kitchen and Hall");
  });

  it("leaves a width change unticked when it would run past the wall", () => {
    const l = latest();
    l.floors[0].openings[0] = { ...l.floors[0].openings[0], widthM: 3.2 };
    const c = byLabel(listingUpdates(base(), l), "width 0.8 m → 3.2 m")!;
    expect(c.defaultSelected).toBe(false);
    expect(c.note).toBe("Not ticked: it would run past the end of your wall.");
  });
});

describe("onWall", () => {
  it("joins collinear room edges and free walls", () => {
    const f = floor([rect("A", 0, 0, 200, 100), rect("B", 200, 0, 400, 100)]);
    expect(onWall(f, { x: 200, y: 100, orientation: "h", widthM: 2 })).toBe(true);
    expect(onWall(f, { x: 380, y: 100, orientation: "h", widthM: 1 })).toBe(false);
    expect(onWall(f, { x: 200, y: 50, orientation: "h", widthM: 1 })).toBe(false);
    expect(onWall({ ...f, walls: [{ id: "w", a: { x: 100, y: 0 }, b: { x: 100, y: 100 } }] }, { x: 100, y: 50, orientation: "v", widthM: 0.8 })).toBe(true);
  });
});

describe("which designs are based on the listing", () => {
  const l = latest();
  it("knows a tagged old copy, a basedOn copy, and an untagged copy whose floors line up", () => {
    expect(isBasedOnListing({ ...base(), preset: { id: "listing", version: 1 } }, "listing")).toBe(true);
    expect(isBasedOnListing({ ...base(), preset: undefined, basedOn: { id: "listing", version: 1 } }, "listing")).toBe(true);
    expect(isBasedOnListing({ ...base(), preset: undefined }, "listing", l)).toBe(true);
    expect(isBasedOnListing({ ...base(), preset: undefined }, "listing")).toBe(false);
    const other = { ...base(), preset: undefined, floors: base().floors.map((f) => ({ ...f, pxPerM: 60 })) };
    expect(isBasedOnListing(other, "listing", l)).toBe(false);
    expect(isBasedOnListing({ ...base(), preset: { id: "listing-proposed", version: 1 } }, "listing", l)).toBe(false);
  });
  it("reads the version reviewed against: basedOn first, then As listed's tag", () => {
    expect(reviewedVersion({ preset: { id: "listing", version: 3 } }, "listing")).toBe(3);
    expect(reviewedVersion({ preset: { id: "listing", version: 3 }, basedOn: { id: "listing", version: 7 } }, "listing")).toBe(7);
    expect(reviewedVersion({ preset: { id: "other", version: 3 } }, "listing")).toBeUndefined();
  });
});

describe("the built-in house", () => {
  /** As listed today, as an owner's copy from before the roof and radiators: 28° roof, 0.35 m eaves, no radiators. */
  function oldCopy(): HouseModel {
    const m = PRESETS[LISTING_PRESET.id].build("");
    m.exterior = { ...m.exterior!, pitchDeg: 28, overhang: 0.35 };
    m.floors.forEach((f) => (f.fixtures = (f.fixtures ?? []).filter((x) => !x.type.startsWith("radiator"))));
    m.preset = { id: LISTING_PRESET.id, version: 17 };
    return m;
  }
  it("offers an unedited old copy exactly the roof and the radiators, all ticked, and putting them in gives the latest back", () => {
    const latestModel = PRESETS[LISTING_PRESET.id].build("");
    const mine = oldCopy();
    const cs = listingUpdates(mine, latestModel);
    expect(cs.filter((c) => c.group === "exterior").map((c) => c.label)).toEqual(["Roof pitch: 28° → 32°", "Eaves overhang: 0.35 m → 0.25 m"]);
    const radiators = cs.filter((c) => c.group === "fixtures");
    expect(radiators.length).toBe(latestModel.floors.flatMap((f) => f.fixtures ?? []).filter((x) => x.type.startsWith("radiator")).length);
    expect(cs.every((c) => c.defaultSelected && c.available)).toBe(true);
    expect(cs.length).toBe(radiators.length + 2);
    const out = applyListingUpdates(mine, latestModel, defaultSelection(cs));
    expect(listingUpdates(out, latestModel)).toEqual([]);
    expect(out.exterior).toEqual(latestModel.exterior);
  });

  it("cuts the kitchen's bulkhead back to a wall built under it, keeping the part over the stairs, and doesn't offer it again", () => {
    const latestModel = PRESETS[LISTING_PRESET.id].build("");
    const mine = PRESETS[LISTING_PRESET.id].build("");
    const ground = mine.floors.find((f) => f.level === 0)!;
    ground.fixtures = (ground.fixtures ?? []).filter((x) => x.type !== "bulkhead");
    // A WC partitioned off the kitchen's south-west corner, its east wall (x 824.5) under the bulkhead's west end.
    ground.rooms.push(rect("WC", 694, 250, 824.5, 345));
    const cs = listingUpdates(mine, latestModel);
    const c = byLabel(cs, "Bulkhead")!;
    expect(c).toMatchObject({ available: true, defaultSelected: true });
    expect(c.note).toMatch(/^Cut back to your walls: 1\.9\d × 0\.94 m of its 3\.26 × 0\.94 m\.$/);
    const out = applyListingUpdates(mine, latestModel, [c.id]);
    const b = out.floors.find((f) => f.level === 0)!.fixtures!.find((x) => x.type === "bulkhead")!;
    const ppm = ground.pxPerM;
    const [x0, x1] = [b.x - (b.w! * ppm) / 2, b.x + (b.w! * ppm) / 2];
    // From the WC wall's kitchen face to the bulkhead's own east end, over the flight (ground x 832-898).
    expect(x0).toBeCloseTo(824.5 + (0.1 / 2) * ppm, 1);
    expect(x1).toBeCloseTo(971.35, 1);
    expect(b.d).toBeCloseTo(0.936);
    expect(byLabel(listingUpdates(out, latestModel), "Bulkhead")).toBeUndefined();
  });

  it("leaves a front door's side lights, and the width they need, to the owner", () => {
    const latestModel = PRESETS[LISTING_PRESET.id].build("");
    const mine = PRESETS[LISTING_PRESET.id].build("");
    const ground = mine.floors.find((f) => f.level === 0)!;
    const i = ground.openings.findIndex((o) => o.kind === "front");
    const door = ground.openings[i];
    ground.openings[i] = { ...door, ...withSidelight(door, "latch", ground.pxPerM, wallRun(ground, door)) };
    // The porch wall is 1.44 m between the garage and the front corner, so the unit is narrowed and slid to fit.
    const unit = ground.openings[i];
    expect(unit.widthM).toBeGreaterThan(1.1);
    expect(unit.widthM).toBeLessThan(1.3);
    expect(onWall(ground, unit)).toBe(true);
    const [lo, hi] = [unit.y - (unit.widthM / 2) * ground.pxPerM, unit.y + (unit.widthM / 2) * ground.pxPerM];
    expect(lo).toBeGreaterThanOrEqual(515);
    expect(hi).toBeLessThanOrEqual(620);
    expect(frontUnit(unit, unit.widthM).lights).toHaveLength(1);
    expect(listingUpdates(mine, latestModel).filter((c) => c.group === "openings")).toEqual([]);
    // A plain change of colour on it is still offered.
    ground.openings[i].color = "#123456";
    expect(listingUpdates(mine, latestModel).filter((c) => c.group === "openings")).toHaveLength(1);
  });
});
