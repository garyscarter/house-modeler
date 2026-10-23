import { describe, expect, it } from "vitest";
import { listingSite } from "./houses/listing91770873";
import { setOpeningWidth } from "./boundaryOpening";
import { describeBoundaryChanges, mergeBoundaryTreatments, neighbourUpdates } from "./siteMerge";
import { applyChanges, defaultSelection } from "./layoutMerge";
import { insertBoundaryVertex } from "./site";
import type { BoundaryEdge, Site } from "../types";

const BRICK: BoundaryEdge = { kind: "wall", height: 1.8, top: "brick", piers: false };

/**
 * The listing's plot with the boundary treatments it had before the garden walls
 * were confirmed (fences and a hedge), so these tests don't depend on the current data.
 */
function baseSite(): Site {
  const s = listingSite();
  const fence: BoundaryEdge = { kind: "fence", height: 1.8 };
  const old: Record<number, BoundaryEdge> = { 0: fence, 1: fence, 3: fence, 8: fence, 9: fence, 11: { kind: "hedge", height: 2 } };
  s.boundaryEdges = s.boundaryEdges!.map((e, i) => old[i] ?? e);
  return s;
}

/** The base plot as a "newer" one: every fence and hedge becomes a brick wall. */
function newerSite(): Site {
  const s = baseSite();
  s.preset = { ...s.preset!, version: s.preset!.version + 1 };
  s.boundaryEdges = s.boundaryEdges!.map((e) => (e.kind === "fence" || e.kind === "hedge" ? { ...BRICK, height: e.height } : e));
  return s;
}

describe("mergeBoundaryTreatments", () => {
  it("changes nothing when the treatments already match, and does not mutate its inputs", () => {
    const mine = baseSite();
    const latest = baseSite();
    const before = structuredClone(mine);
    const r = mergeBoundaryTreatments(mine, latest);
    expect(r.changes).toEqual([]);
    expect(r.site).toEqual(before);
    expect(mine).toEqual(before);
  });

  it("takes the new walls on an unedited copy", () => {
    const latest = newerSite();
    const r = mergeBoundaryTreatments(baseSite(), latest);
    expect(r.site.boundaryEdges).toEqual(latest.boundaryEdges);
    expect(r.changes.map((c) => c.edge)).toEqual([0, 1, 3, 8, 9, 11]);
    expect(r.site.preset).toEqual(latest.preset);
  });

  it("keeps a widened drive: corners, surfaces and the opening stay, the walls beside it update", () => {
    const mine = setOpeningWidth(baseSite(), 6, 4.0, "start");
    const latest = newerSite();
    // The front garden wall in the newer plot is a different height and has piers.
    latest.boundaryEdges![5] = { kind: "wall", height: 1.1, top: "brick", piers: true };
    const r = mergeBoundaryTreatments(mine, latest);
    expect(r.site.boundary).toEqual(mine.boundary);
    expect(r.site.surfaces).toEqual(mine.surfaces);
    expect(r.site.neighbours).toEqual(mine.neighbours);
    expect(r.site.boundaryEdges![6].kind).toBe("open");
    // The shortened front wall still finds the latest front wall.
    expect(r.site.boundaryEdges![5]).toEqual(latest.boundaryEdges![5]);
    expect(r.site.boundaryEdges![0]).toEqual(latest.boundaryEdges![0]);
    expect(r.changes.find((c) => c.edge === 5)!.label).toBe("Front boundary, 2nd from the left: brick wall 0.9 m (no piers) → brick wall 1.1 m (piers)");
  });

  it("keeps an opening the owner made where the latest plot has a wall", () => {
    const mine = baseSite();
    mine.boundaryEdges![3] = { kind: "open", height: 0, endFinish: "pier" };
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges![3]).toEqual({ kind: "open", height: 0, endFinish: "pier" });
    expect(r.changes.some((c) => c.edge === 3)).toBe(false);
  });

  it("never changes endFinish, and a wall made open in the latest plot takes the opening", () => {
    const mine = baseSite();
    mine.boundaryEdges![6] = { kind: "open", height: 0, endFinish: "pier" };
    const latest = newerSite();
    latest.boundaryEdges![6] = { kind: "open", height: 0, endFinish: "plain" };
    expect(mergeBoundaryTreatments(mine, latest).site.boundaryEdges![6].endFinish).toBe("pier");
    const m2 = baseSite();
    m2.boundaryEdges![3] = { kind: "fence", height: 1.8, endFinish: "pier" };
    const l2 = baseSite();
    l2.boundaryEdges![3] = { kind: "open", height: 0 };
    const r = mergeBoundaryTreatments(m2, l2);
    expect(r.site.boundaryEdges![3]).toEqual({ kind: "open", height: 0, endFinish: "pier" });
  });

  it("matches an edge split into two by an extra corner", () => {
    const mine = insertBoundaryVertex(baseSite(), 0, { x: 0.5, y: -11.65 }); // on the rear line
    expect(mine.boundary.length).toBe(13);
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges![0].kind).toBe("wall");
    expect(r.site.boundaryEdges![1].kind).toBe("wall");
    expect(r.changes.filter((c) => c.edge <= 1)).toHaveLength(2);
    expect(r.site.boundary).toEqual(mine.boundary);
  });

  it("leaves an edge alone when no latest edge lies along it", () => {
    const mine = baseSite();
    mine.boundary = mine.boundary.map((p, i) => (i === 1 ? { x: p.x, y: p.y - 0.5 } : p)); // rear corner moved off the line
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges![0]).toEqual({ kind: "fence", height: 1.8 });
    expect(r.site.boundaryEdges![1]).toEqual({ kind: "fence", height: 1.8 });
    expect(r.changes.map((c) => c.edge)).not.toContain(0);
  });

  it("tolerates 4 cm of drift but not 8 cm", () => {
    const near = baseSite();
    near.boundary = near.boundary.map((p, i) => (i === 0 || i === 1 ? { x: p.x, y: p.y + 0.04 } : p));
    expect(mergeBoundaryTreatments(near, newerSite()).site.boundaryEdges![0].kind).toBe("wall");
    const far = baseSite();
    far.boundary = far.boundary.map((p, i) => (i === 0 || i === 1 ? { x: p.x, y: p.y + 0.08 } : p));
    expect(mergeBoundaryTreatments(far, newerSite()).site.boundaryEdges![0].kind).toBe("fence");
  });

  it("copies top, piers, follow and stepEvery, and drops ones the latest plot does not have", () => {
    const mine = baseSite();
    mine.boundaryEdges![7] = { kind: "wall", height: 1, top: "coping", piers: true, follow: "level", stepEvery: 1 };
    const latest = baseSite();
    latest.boundaryEdges![7] = { kind: "wall", height: 1, top: "brick", piers: false };
    const r = mergeBoundaryTreatments(mine, latest);
    expect(r.site.boundaryEdges![7]).toEqual({ kind: "wall", height: 1, top: "brick", piers: false });
  });

  it("does not count a missing top or piers as different from the defaults", () => {
    const mine = baseSite();
    mine.boundaryEdges![4] = { kind: "wall", height: 0.95 };
    const latest = baseSite();
    latest.boundaryEdges![4] = { kind: "wall", height: 0.95, top: "coping", piers: true };
    const r = mergeBoundaryTreatments(mine, latest);
    expect(r.changes).toEqual([]);
    expect(r.site.boundaryEdges![4]).toEqual({ kind: "wall", height: 0.95 });
  });

  it("fills in missing boundaryEdges as fences, as the editor does", () => {
    const mine = baseSite();
    delete mine.boundaryEdges;
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges).toHaveLength(mine.boundary.length);
    expect(r.site.boundaryEdges![0].kind).toBe("wall");
  });

  it("copes with a very short edge at a corner", () => {
    const mine = baseSite();
    mine.boundary = mine.boundary.flatMap((p, i) => (i === 5 ? [p, { x: p.x - 0.02, y: p.y }] : [p]));
    mine.boundaryEdges = [...mine.boundaryEdges!.slice(0, 6), { ...mine.boundaryEdges![5] }, ...mine.boundaryEdges!.slice(6)];
    expect(() => mergeBoundaryTreatments(mine, newerSite())).not.toThrow();
  });
});

describe("labels", () => {
  it("names the side and the treatments in plain words", () => {
    const r = mergeBoundaryTreatments(baseSite(), newerSite());
    expect(r.changes[0].label).toBe("Rear boundary: fence 1.8 m → brick wall 1.8 m");
  });
  it("says which one when a side has several edges", () => {
    const r = mergeBoundaryTreatments(baseSite(), newerSite());
    const labels = r.changes.map((c) => c.label);
    expect(labels).toContain("Right boundary, 3rd from the rear: fence 1.8 m → brick wall 1.8 m");
    expect(labels).toContain("Left boundary, 1st from the rear: hedge 2 m → brick wall 2 m");
  });
  it("describes the confirm text and an empty change", () => {
    const r = mergeBoundaryTreatments(baseSite(), newerSite());
    const text = describeBoundaryChanges([{ changes: r.changes }]);
    expect(text).toContain("• Rear boundary: fence 1.8 m → brick wall 1.8 m");
    expect(text).toContain("stay as they are");
    expect(describeBoundaryChanges([{ changes: [] }])).toContain("already match");
  });
});

describe("neighbourUpdates", () => {
  /** The listing's plot with its buildings under plain names (attached house, its conservatory, side extension, west neighbour, outbuilding). */
  const NAMES = ["Attached house", "Conservatory", "Side extension", "West neighbour", "Outbuilding"];
  function plot(): Site {
    const s = listingSite();
    expect(s.neighbours).toHaveLength(NAMES.length);
    s.neighbours = s.neighbours.map((n, i) => ({ ...n, name: NAMES[i] }));
    return s;
  }
  /** The listing's plot as an owner's copy from before the attached house's roof was measured, with edits of their own. */
  function ownCopy(): Site {
    const s = plot();
    const shift = (dx: number) => (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y });
    s.neighbours = s.neighbours
      .filter((n) => n.name !== "Outbuilding")
      .map((n) => {
        if (n.name === "Attached house") {
          const { overhang: _o, ...rest } = n;
          return { ...rest, pitchDeg: 28 };
        }
        if (n.name === "Conservatory") return { ...n, polygon: n.polygon.map(shift(-0.24)) };
        return n;
      });
    s.neighbours.push({ id: "shed", name: "My shed", polygon: [{ x: 0, y: -12 }, { x: 2, y: -12 }, { x: 2, y: -10 }, { x: 0, y: -10 }], eaves: 2, roof: "flat" });
    s.surfaces = s.surfaces.slice(1);
    return s;
  }

  it("offers nothing when the buildings match", () => {
    expect(neighbourUpdates(plot(), plot())).toEqual([]);
  });

  it("offers the attached house's roof and a small move ticked, and a missing building unticked", () => {
    const cs = neighbourUpdates(ownCopy(), plot());
    expect(cs.map((c) => [c.label, c.defaultSelected])).toEqual([
      ["Attached house: roof pitch 28° → 32°", true],
      ["Attached house: eaves overhang 0.35 m → 0.25 m", true],
      ["Conservatory: moved 0.24 m to the right", true],
      [expect.stringMatching(/^Add Outbuilding \(\d+(\.\d)? m², flat roof\)$/), false],
    ]);
    expect(cs[3].note).toContain("may be on purpose");
  });

  it("applies only the ticked ones, keeping the owner's own buildings, surfaces and boundary", () => {
    const mine = ownCopy();
    const before = structuredClone(mine);
    const latest = plot();
    const cs = neighbourUpdates(mine, latest);
    const out = applyChanges(mine, cs, defaultSelection(cs));
    const byName = (s: Site, n: string) => s.neighbours.find((x) => x.name === n)!;
    expect(byName(out, "Attached house")).toEqual({ ...byName(latest, "Attached house"), id: byName(mine, "Attached house").id });
    expect(byName(out, "Conservatory").polygon).toEqual(byName(latest, "Conservatory").polygon);
    expect(out.neighbours.map((n) => n.name)).toEqual(mine.neighbours.map((n) => n.name));
    expect({ ...out, neighbours: [] }).toEqual({ ...mine, neighbours: [] });
    const all = applyChanges(mine, cs, cs.map((c) => c.id));
    expect(all.neighbours.map((n) => n.name)).toContain("Outbuilding");
    expect(neighbourUpdates(all, latest)).toEqual([]);
    expect(mine).toEqual(before);
  });

  it("leaves a big move or a redrawn outline unticked", () => {
    const mine = plot();
    const latest = plot();
    const n = latest.neighbours.find((x) => x.name === "West neighbour")!;
    n.polygon = n.polygon.map((p) => ({ x: p.x - 1, y: p.y }));
    const c = neighbourUpdates(mine, latest)[0];
    expect(c.label).toBe("West neighbour: moved 1 m to the left");
    expect(c.defaultSelected).toBe(false);
    n.polygon = n.polygon.slice(0, 3);
    const r = neighbourUpdates(mine, latest)[0];
    expect(r.label).toMatch(/^West neighbour: new outline/);
    expect(r.defaultSelected).toBe(false);
  });
});
