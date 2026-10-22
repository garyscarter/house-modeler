import { describe, expect, it } from "vitest";
import { listingSite } from "./houses/listing91770873";
import { setOpeningWidth } from "./boundaryOpening";
import { describeBoundaryChanges, mergeBoundaryTreatments } from "./siteMerge";
import { insertBoundaryVertex } from "./site";
import type { BoundaryEdge, Site } from "../types";

const BRICK: BoundaryEdge = { kind: "wall", height: 1.8, top: "brick", piers: false };

/** The listing's plot as a "newer" one: every fence and hedge becomes a brick wall. */
function newerSite(): Site {
  const s = listingSite();
  s.preset = { ...s.preset!, version: s.preset!.version + 1 };
  s.boundaryEdges = s.boundaryEdges!.map((e) => (e.kind === "fence" || e.kind === "hedge" ? { ...BRICK, height: e.height } : e));
  return s;
}

describe("mergeBoundaryTreatments", () => {
  it("changes nothing when the treatments already match, and does not mutate its inputs", () => {
    const mine = listingSite();
    const latest = listingSite();
    const before = structuredClone(mine);
    const r = mergeBoundaryTreatments(mine, latest);
    expect(r.changes).toEqual([]);
    expect(r.site).toEqual(before);
    expect(mine).toEqual(before);
  });

  it("takes the new walls on an unedited copy", () => {
    const latest = newerSite();
    const r = mergeBoundaryTreatments(listingSite(), latest);
    expect(r.site.boundaryEdges).toEqual(latest.boundaryEdges);
    expect(r.changes.map((c) => c.edge)).toEqual([0, 1, 3, 8, 9, 11]);
    expect(r.site.preset).toEqual(latest.preset);
  });

  it("keeps a widened drive: corners, surfaces and the opening stay, the walls beside it update", () => {
    const mine = setOpeningWidth(listingSite(), 6, 4.0, "start");
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
    const mine = listingSite();
    mine.boundaryEdges![3] = { kind: "open", height: 0, endFinish: "pier" };
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges![3]).toEqual({ kind: "open", height: 0, endFinish: "pier" });
    expect(r.changes.some((c) => c.edge === 3)).toBe(false);
  });

  it("never changes endFinish, and a wall made open in the latest plot takes the opening", () => {
    const mine = listingSite();
    mine.boundaryEdges![6] = { kind: "open", height: 0, endFinish: "pier" };
    const latest = newerSite();
    latest.boundaryEdges![6] = { kind: "open", height: 0, endFinish: "plain" };
    expect(mergeBoundaryTreatments(mine, latest).site.boundaryEdges![6].endFinish).toBe("pier");
    const m2 = listingSite();
    m2.boundaryEdges![3] = { kind: "fence", height: 1.8, endFinish: "pier" };
    const l2 = listingSite();
    l2.boundaryEdges![3] = { kind: "open", height: 0 };
    const r = mergeBoundaryTreatments(m2, l2);
    expect(r.site.boundaryEdges![3]).toEqual({ kind: "open", height: 0, endFinish: "pier" });
  });

  it("matches an edge split into two by an extra corner", () => {
    const mine = insertBoundaryVertex(listingSite(), 0, { x: 0.5, y: -11.65 }); // on the rear line
    expect(mine.boundary.length).toBe(13);
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges![0].kind).toBe("wall");
    expect(r.site.boundaryEdges![1].kind).toBe("wall");
    expect(r.changes.filter((c) => c.edge <= 1)).toHaveLength(2);
    expect(r.site.boundary).toEqual(mine.boundary);
  });

  it("leaves an edge alone when no latest edge lies along it", () => {
    const mine = listingSite();
    mine.boundary = mine.boundary.map((p, i) => (i === 1 ? { x: p.x, y: p.y - 0.5 } : p)); // rear corner moved off the line
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges![0]).toEqual({ kind: "fence", height: 1.8 });
    expect(r.site.boundaryEdges![1]).toEqual({ kind: "fence", height: 1.8 });
    expect(r.changes.map((c) => c.edge)).not.toContain(0);
  });

  it("tolerates 4 cm of drift but not 8 cm", () => {
    const near = listingSite();
    near.boundary = near.boundary.map((p, i) => (i === 0 || i === 1 ? { x: p.x, y: p.y + 0.04 } : p));
    expect(mergeBoundaryTreatments(near, newerSite()).site.boundaryEdges![0].kind).toBe("wall");
    const far = listingSite();
    far.boundary = far.boundary.map((p, i) => (i === 0 || i === 1 ? { x: p.x, y: p.y + 0.08 } : p));
    expect(mergeBoundaryTreatments(far, newerSite()).site.boundaryEdges![0].kind).toBe("fence");
  });

  it("copies top, piers, follow and stepEvery, and drops ones the latest plot does not have", () => {
    const mine = listingSite();
    mine.boundaryEdges![7] = { kind: "wall", height: 1, top: "coping", piers: true, follow: "level", stepEvery: 1 };
    const latest = listingSite();
    latest.boundaryEdges![7] = { kind: "wall", height: 1, top: "brick", piers: false };
    const r = mergeBoundaryTreatments(mine, latest);
    expect(r.site.boundaryEdges![7]).toEqual({ kind: "wall", height: 1, top: "brick", piers: false });
  });

  it("does not count a missing top or piers as different from the defaults", () => {
    const mine = listingSite();
    mine.boundaryEdges![4] = { kind: "wall", height: 0.95 };
    const latest = listingSite();
    latest.boundaryEdges![4] = { kind: "wall", height: 0.95, top: "coping", piers: true };
    const r = mergeBoundaryTreatments(mine, latest);
    expect(r.changes).toEqual([]);
    expect(r.site.boundaryEdges![4]).toEqual({ kind: "wall", height: 0.95 });
  });

  it("fills in missing boundaryEdges as fences, as the editor does", () => {
    const mine = listingSite();
    delete mine.boundaryEdges;
    const r = mergeBoundaryTreatments(mine, newerSite());
    expect(r.site.boundaryEdges).toHaveLength(mine.boundary.length);
    expect(r.site.boundaryEdges![0].kind).toBe("wall");
  });

  it("copes with a very short edge at a corner", () => {
    const mine = listingSite();
    mine.boundary = mine.boundary.flatMap((p, i) => (i === 5 ? [p, { x: p.x - 0.02, y: p.y }] : [p]));
    mine.boundaryEdges = [...mine.boundaryEdges!.slice(0, 6), { ...mine.boundaryEdges![5] }, ...mine.boundaryEdges!.slice(6)];
    expect(() => mergeBoundaryTreatments(mine, newerSite())).not.toThrow();
  });
});

describe("labels", () => {
  it("names the side and the treatments in plain words", () => {
    const r = mergeBoundaryTreatments(listingSite(), newerSite());
    expect(r.changes[0].label).toBe("Rear boundary: fence 1.8 m → brick wall 1.8 m");
  });
  it("says which one when a side has several edges", () => {
    const r = mergeBoundaryTreatments(listingSite(), newerSite());
    const labels = r.changes.map((c) => c.label);
    expect(labels).toContain("Right boundary, 3rd from the rear: fence 1.8 m → brick wall 1.8 m");
    expect(labels).toContain("Left boundary, 1st from the rear: hedge 2 m → brick wall 2 m");
  });
  it("describes the confirm text and an empty change", () => {
    const r = mergeBoundaryTreatments(listingSite(), newerSite());
    const text = describeBoundaryChanges([{ changes: r.changes }]);
    expect(text).toContain("• Rear boundary: fence 1.8 m → brick wall 1.8 m");
    expect(text).toContain("stay as they are");
    expect(describeBoundaryChanges([{ changes: [] }])).toContain("already match");
  });
});
