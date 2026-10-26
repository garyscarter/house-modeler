import { describe, expect, it } from "vitest";
import type { Site } from "../types";
import { listing91770873, listing91770873Proposed, listingSite } from "./houses/listing91770873";
import { boundaryPieces, changedPieces, diffSites } from "./siteDiff";
import { updateSiteOf, type Sites } from "./sites";
import { COST_LINES, diffModels, estimateCosts } from "./report";
import { areaOf, insertBoundaryVertex } from "./site";
import { rectPoly } from "./site";

/** Boundary corner between the front garden wall (edge 5) and the drive opening (edge 6). */
const DRIVE_CORNER = 6;

/** Proposed as a copy of As listed, with the drive opening widened 1.2 m towards the bay and the drive paved to match. */
function widenedDrive(): { current: Site; proposed: Site } {
  const sites: Sites = { current: listingSite() };
  const next = updateSiteOf(sites, "proposed", (s) => ({
    ...s,
    boundary: s.boundary.map((p, i) => (i === DRIVE_CORNER ? { ...p, x: p.x + 1.2 } : p)),
    surfaces: s.surfaces.map((x) => (x.kind === "drive" ? { ...x, polygon: x.polygon.map((p) => (p.x > -2 ? { ...p, x: p.x + 1.2 } : p)) } : x)),
  }));
  return { current: next.current!, proposed: next.proposed! };
}

describe("boundary pieces", () => {
  it("sees an unchanged plot as unchanged, even with an extra corner on a straight edge", () => {
    const a = listingSite();
    expect(changedPieces(a, structuredClone(a))).toEqual([]);
    const mid = { x: (a.boundary[5].x + a.boundary[6].x) / 2, y: a.boundary[5].y };
    expect(changedPieces(a, insertBoundaryVertex(a, 5, mid))).toEqual([]);
  });

  it("finds the stretch of front wall that became drive opening", () => {
    const { current, proposed } = widenedDrive();
    const changed = changedPieces(current, proposed);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ side: "front", before: { kind: "wall" }, after: { kind: "open" } });
    expect(changed[0].length).toBeCloseTo(1.2);
    // Total boundary length is the same before and after.
    const total = (f: "before" | "after") => boundaryPieces(current, proposed).filter((p) => p[f]).reduce((s, p) => s + p.length, 0);
    expect(total("before")).toBeCloseTo(total("after"));
  });
});

describe("site changes", () => {
  it("lists nothing for identical plots, or when neither layout has one", () => {
    expect(diffSites(listingSite(), listingSite())).toEqual([]);
    expect(diffSites(undefined, undefined)).toEqual([]);
  });

  it("describes a widened drive: shorter front wall, wider opening, bigger drive", () => {
    const { current, proposed } = widenedDrive();
    const changes = diffSites(current, proposed);
    const driveBefore = areaOf(current.surfaces.find((s) => s.kind === "drive")!.polygon);
    const driveAfter = areaOf(proposed.surfaces.find((s) => s.kind === "drive")!.polygon);
    expect(changes.map((c) => c.description)).toEqual([
      "Front wall shortened by 1.2 m; drive opening widened from 3.0 m to 4.2 m",
      `Driveway enlarged from ${driveBefore.toFixed(1)} m² to ${driveAfter.toFixed(1)} m²`,
    ]);
    expect(changes.every((c) => c.category === "Site" && c.floor === "Site")).toBe(true);
    expect(changes[0]).toMatchObject({ quantity: 1.2, unit: "m", costLine: "removeGardenWall" });
    expect(changes[1]).toMatchObject({ unit: "m²", costLine: "newPaving" });
    expect(changes[1].quantity).toBeCloseTo(driveAfter - driveBefore, 1);
  });

  it("goes on the end of the report's change list and is priced on the garden lines", () => {
    const { current, proposed } = widenedDrive();
    const a = listing91770873("");
    const b = listing91770873Proposed("");
    const house = diffModels(a, b);
    const all = diffModels(a, b, { a: current, b: proposed });
    expect(all.slice(0, house.length)).toEqual(house);
    expect(all.slice(house.length).map((c) => c.category)).toEqual(["Site", "Site"]);
    const est = estimateCosts(all, { removeGardenWall: 100, newPaving: 50 });
    const wall = est.lines.find((l) => l.def.id === "removeGardenWall")!;
    expect(wall.quantity).toBeCloseTo(1.2);
    expect(wall.total).toBeCloseTo(120);
    expect(est.lines.find((l) => l.def.id === "newPaving")!.rate).toBe(50);
    expect(COST_LINES.map((l) => [l.id, l.label, l.unit])).toEqual(
      expect.arrayContaining([
        ["removeGardenWall", "Remove garden wall", "m"],
        ["newPaving", "New paving", "m²"],
      ]),
    );
    // No rates yet: the lines are there but unpriced.
    expect(estimateCosts(all, {}).missing).toEqual(expect.arrayContaining(["removeGardenWall", "newPaving"]));
  });

  it("says when a boundary edge changes treatment, height or top", () => {
    const base: Site = {
      frontBearing: 180,
      latitude: 51,
      longitude: 0,
      boundary: rectPoly(0, 0, 10, 20),
      boundaryEdges: [
        { kind: "fence", height: 1.8 },
        { kind: "fence", height: 1.8 },
        { kind: "wall", height: 0.9 },
        { kind: "fence", height: 1.8 },
      ],
      neighbours: [],
      surfaces: [],
    };
    const edgeAt = (s: Site, side: string) => diffSites(base, s).find((c) => c.key === `site:boundary:${side}`)?.description;
    // rectPoly runs (0,0) (10,0) (10,20) (0,20): edge 2 is the front (y = 20), edge 1 the right side.
    const walled: Site = { ...base, boundaryEdges: base.boundaryEdges!.map((e, i) => (i === 1 ? { kind: "wall", height: 1.8 } : e)) };
    expect(edgeAt(walled, "right")).toBe("Right side boundary changed from fence to wall (20.0 m)");
    const raised: Site = { ...base, boundaryEdges: base.boundaryEdges!.map((e, i) => (i === 2 ? { kind: "wall", height: 1.2, top: "brick" } : e)) };
    expect(edgeAt(raised, "front")).toBe("Front wall raised from 0.9 m to 1.2 m; wall topped with brick on edge instead of coping");
    expect(diffSites(base, raised).find((c) => c.key === "site:boundary:front")?.costLine).toBeUndefined();
    const gone: Site = { ...base, boundaryEdges: base.boundaryEdges!.map((e, i) => (i === 2 ? { kind: "open", height: 0 } : e)) };
    expect(diffSites(base, gone)[0]).toMatchObject({ description: "Front wall removed (10.0 m); opening added (10.0 m)", quantity: 10, costLine: "removeGardenWall" });
  });

  it("lists surfaces added and removed, buildings and orientation", () => {
    const a = listingSite();
    const b = structuredClone(a);
    b.surfaces = b.surfaces.filter((s) => s.kind !== "patio");
    b.surfaces.push({ id: "p2", kind: "path", polygon: rectPoly(0, 3, 1, 5) });
    b.neighbours = b.neighbours.slice(1);
    b.frontBearing = 170;
    const text = diffSites(a, b).map((c) => c.description);
    expect(text).toContain(`Patio removed (${areaOf(a.surfaces.find((s) => s.kind === "patio")!.polygon).toFixed(1)} m²)`);
    // The listing already has a path (along the hall front), so the new one is told apart by position.
    expect(text).toContain("New front path (2.0 m²)");
    expect(text).toContain(`${a.neighbours[0].name} removed`);
    expect(text).toContain("Orientation changed from 162° to 170°");
    expect(diffSites(a, b).find((c) => c.description.startsWith("New front path"))?.costLine).toBe("newPaving");
  });

  it("names front and back lawns apart", () => {
    const a = listingSite();
    const b = structuredClone(a);
    const front = b.surfaces.filter((s) => s.kind === "lawn").find((s) => s.polygon.some((p) => p.y > 5))!;
    front.polygon = front.polygon.map((p) => (p.y > 5 ? { ...p, y: p.y - 1 } : p));
    expect(diffSites(a, b).map((c) => c.description)).toEqual([expect.stringMatching(/^Front lawn reduced from/)]);
  });

  it("notes a plot on one side only", () => {
    expect(diffSites(listingSite(), undefined)[0].description).toBe("Proposed has no plot");
    expect(diffSites(undefined, listingSite())[0].description).toBe("Plot added for Proposed");
  });
});

describe("screen blocks on walls", () => {
  it("count as a change of treatment, named in the change list", () => {
    const before = listingSite();
    const i = (before.boundaryEdges ?? []).findIndex((e) => e.screen?.rows === 2);
    expect(i).toBeGreaterThanOrEqual(0);
    const after: Site = { ...before, boundaryEdges: before.boundaryEdges!.map((e, k) => (k === i ? { ...e, screen: undefined } : e)) };
    expect(changedPieces(before, after)).toHaveLength(1);
    const texts = diffSites(before, after).map((c) => c.description);
    expect(texts.some((t) => /screen blocks removed/.test(t))).toBe(true);
    expect(changedPieces(before, before)).toHaveLength(0);
  });
});
