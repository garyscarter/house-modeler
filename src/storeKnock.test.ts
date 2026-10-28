import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "./store";
import { LISTING_PRESET, builtInHouse, listingSite } from "./houses/default";
import { applyListingReview, latestListing, planListingReview } from "./lib/presetActions";
import { floor, rect } from "./lib/testing";
import type { HouseModel, Photo } from "./types";

const st = () => useStore.getState();
const photo = (id: string, roomName: string): Photo => ({ id, name: id, dataUrl: "", floorName: "Floor", roomName });

/** The listing model with its floors swapped for two rooms side by side. */
function twoRooms(): HouseModel {
  return { ...builtInHouse(""), floors: [floor([rect("A", 0, 0, 200, 300), rect("B", 200, 0, 450, 300)])] };
}

describe("store: knock through, copy and listing review", () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    useStore.setState({ variants: {}, sites: {}, photos: [], past: [], future: [], selectedRoomId: null, selectedEdge: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("knockThrough merges, selects the kept room, moves photos and undoes in one step", () => {
    st().setVariant("current", twoRooms());
    useStore.setState({ photos: [photo("p1", "A"), photo("p2", "B"), photo("p3", "B")], past: [] });
    now += 10_000;
    const res = st().knockThrough("current", "f0", "A", "B", "a");
    expect(res.ok).toBe(true);
    expect(st().variants.current!.floors[0].rooms.map((r) => r.id)).toEqual(["A"]);
    expect(st().selectedRoomId).toBe("A");
    expect(st().photos.map((p) => p.roomName)).toEqual(["A", "A", "A"]);
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().variants.current!.floors[0].rooms.map((r) => r.id)).toEqual(["A", "B"]);
    expect(st().photos.map((p) => p.roomName)).toEqual(["A", "B", "B"]);
  });

  it("copyVariant to proposed sets basedOn to the source preset and drops preset and listedArea", () => {
    const current = builtInHouse("");
    current.listedArea = 100 as never;
    st().setVariant("current", current);
    const preset = { ...current.preset! };
    st().copyVariant("current", "proposed");
    const copy = st().variants.proposed!;
    expect(copy.preset).toBeUndefined();
    expect(copy.listedArea).toBeUndefined();
    expect(copy.basedOn).toEqual(preset);
    expect(st().variants.current!.preset).toEqual(preset);
  });

  describe("applyListingReview", () => {
    const setup = () => {
      const site = listingSite();
      site.neighbours = site.neighbours.map((n, i) => (i === 0 ? { ...n, eaves: n.eaves + 1 } : n));
      st().setVariant("current", builtInHouse(""));
      st().copyVariant("current", "proposed");
      st().setSite(site, "proposed");
      const review = planListingReview("proposed");
      expect(review?.plot?.changes.length).toBeGreaterThan(0);
      return { review: review!, site, plotId: review!.plot!.changes[0].id };
    };

    it("records basedOn.version and leaves the plot alone when its change is not ticked", () => {
      const { review, site } = setup();
      now += 10_000;
      applyListingReview(review, []);
      expect(st().variants.proposed!.basedOn).toEqual({ id: LISTING_PRESET.id, version: latestListing().version });
      expect(st().variants.proposed!.preset).toBeUndefined();
      expect(st().sites.proposed).toEqual(site);
    });

    it("applies the plot change when it is ticked", () => {
      const { review, site, plotId } = setup();
      now += 10_000;
      applyListingReview(review, [plotId]);
      expect(st().variants.proposed!.basedOn?.version).toBe(latestListing().version);
      expect(st().sites.proposed).not.toEqual(site);
      expect(st().sites.proposed!.neighbours[0].eaves).toBe(site.neighbours[0].eaves - 1);
    });
  });
});
